import {
  createReadStream,
  existsSync,
  lstatSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getHreflangCluster,
  getLocalizedRoute,
  getLocalizedUrl,
  V5_LOCALES,
  V5_PAGE_STEMS,
} from './v5-i18n-config.mjs';
import { CLOUDFLARE_HOSTS, LEGACY_REDIRECTS } from './v5-retirement-map.mjs';
import { validateReleaseBundle } from './archive-v5.mjs';

const scriptsRoot = dirname(fileURLToPath(import.meta.url));
const repo = resolve(scriptsRoot, '..');
const localeIds = Object.keys(V5_LOCALES);
const viewports = Object.freeze([
  Object.freeze({ label: '1280x900', width: 1280, height: 900, mobile: false }),
  Object.freeze({ label: '390x844', width: 390, height: 844, mobile: true }),
]);
const canonicalCases = localeIds.flatMap((locale) => V5_PAGE_STEMS.map((stem) => Object.freeze({
  locale,
  stem,
  route: getLocalizedRoute(locale, stem),
})));
const expectedHttpRoutes = Object.freeze([
  ...canonicalCases.map(({ route }) => route),
  ...LEGACY_REDIRECTS.map(({ path }) => path),
]);
const expectedBrowserKeys = Object.freeze(canonicalCases.flatMap(({ locale, stem }) => (
  viewports.map(({ label }) => `${locale}\0${stem}\0${label}`)
)));
const expectedPersianKeys = Object.freeze(V5_PAGE_STEMS.flatMap((stem) => (
  viewports.map(({ label }) => `fa\0${stem}\0${label}`)
)));
const acceptedCsvSha256 = '8d17b3226a266ff4539cf9a6721e4854992121663aeebd60354b3e73cf76fb63';
const allowedCliKeys = new Set(['root', 'base-url', 'cloudflare-csv', 'output', 'browser']);
const formspreeOrigin = 'https://formspree.io';
const turnstileHost = 'challenges.cloudflare.com';

class CliError extends Error {}
class AcceptanceError extends Error {}

function sha256Bytes(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sha256File(file) {
  const hash = createHash('sha256');
  hash.update(readFileSync(file));
  return hash.digest('hex');
}

function isInside(parent, candidate) {
  const rel = relative(parent, candidate);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith('--')) throw new CliError(`Malformed argument: ${argument}`);
    let key;
    let value;
    if (argument.includes('=')) {
      [key, value] = argument.slice(2).split(/=(.*)/s, 2);
    } else {
      key = argument.slice(2);
      value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new CliError(`--${key} requires a value`);
      index += 1;
    }
    if (!allowedCliKeys.has(key)) throw new CliError(`Unknown argument: --${key}`);
    if (Object.hasOwn(values, key)) throw new CliError(`Duplicate argument: --${key}`);
    if (!value) throw new CliError(`--${key} requires a non-empty value`);
    values[key] = value;
  }

  if (!values.output) throw new CliError('Missing required argument: --output');
  if (!values.browser) throw new CliError('Missing required argument: --browser');
  const local = Boolean(values.root);
  const production = Boolean(values['base-url']);
  if (local === production) throw new CliError('Provide exactly one of --root or --base-url');
  if (local && values['cloudflare-csv']) throw new CliError('--cloudflare-csv is only valid with --base-url');
  if (production && !values['cloudflare-csv']) throw new CliError('--base-url requires --cloudflare-csv');

  const output = resolve(values.output);
  if (isInside(repo, output)) throw new CliError('Acceptance output must be outside the repository');
  if (existsSync(output)) throw new CliError(`Refusing to overwrite acceptance output: ${output}`);
  if (!existsSync(dirname(output))) {
    throw new CliError(`Acceptance output parent is missing: ${dirname(output)}`);
  }
  const outputParent = realpathSync(dirname(output));
  if (!statSync(outputParent).isDirectory()) throw new CliError('Acceptance output parent must resolve to a directory');
  if (isInside(repo, outputParent)) throw new CliError('Acceptance output parent must be outside the repository');

  const browserRequested = resolve(values.browser);
  if (!existsSync(browserRequested)) throw new CliError(`Browser executable is missing: ${browserRequested}`);
  const browserInfo = lstatSync(browserRequested);
  if (browserInfo.isSymbolicLink() || !browserInfo.isFile()) throw new CliError('Browser executable must be a regular non-symbolic-link file');
  const browser = realpathSync(browserRequested);
  const versionResult = spawnSync(browser, ['--version'], { encoding: 'utf8', timeout: 10000 });
  const browserVersion = `${versionResult.stdout ?? ''}${versionResult.stderr ?? ''}`.trim();
  if (versionResult.status !== 0 || !/\b(?:Google Chrome|Chromium)\b/i.test(browserVersion)) {
    throw new CliError(`Browser executable is not Chromium: ${browserVersion || browser}`);
  }

  let root = null;
  let baseUrl = null;
  let cloudflareCsv = null;
  if (local) {
    const requestedRoot = resolve(values.root);
    if (!existsSync(requestedRoot)) throw new CliError(`Release root is missing: ${requestedRoot}`);
    const rootInfo = lstatSync(requestedRoot);
    if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory()) {
      throw new CliError('Release root must be a non-symbolic-link directory');
    }
    root = realpathSync(requestedRoot);
    if (isInside(repo, root)) throw new CliError('Release root must be outside the repository');
  } else {
    let parsed;
    try {
      parsed = new URL(values['base-url']);
    } catch {
      throw new CliError('Invalid --base-url');
    }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) {
      throw new CliError('--base-url must be an HTTPS origin URL without credentials, query, or fragment');
    }
    if (parsed.pathname !== '/') throw new CliError('--base-url must be an HTTPS origin root');
    baseUrl = parsed.href;
    const csvRequested = resolve(values['cloudflare-csv']);
    if (!existsSync(csvRequested) || lstatSync(csvRequested).isSymbolicLink() || !lstatSync(csvRequested).isFile()) {
      throw new CliError('Cloudflare CSV must be an existing regular non-symbolic-link file');
    }
    cloudflareCsv = realpathSync(csvRequested);
    if (sha256File(cloudflareCsv) !== acceptedCsvSha256) {
      throw new CliError('Cloudflare CSV does not match the exact accepted SHA-256');
    }
  }
  return {
    mode: local ? 'local' : 'production',
    root,
    baseUrl,
    cloudflareCsv,
    output,
    browser,
    browserRequested,
    browserVersion,
    browserSha256: sha256File(browser),
  };
}

function walkFiles(root) {
  const files = [];
  const visit = (directory) => {
    for (const name of readdirSync(directory).sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)))) {
      const file = join(directory, name);
      const info = lstatSync(file);
      if (info.isSymbolicLink()) throw new AcceptanceError(`Release contains symbolic link: ${file}`);
      if (info.isDirectory()) visit(file);
      else if (info.isFile()) files.push(file);
      else throw new AcceptanceError(`Release contains unsupported filesystem entry: ${file}`);
    }
  };
  visit(root);
  return files;
}

function releaseManifest(root) {
  const relativeFiles = walkFiles(root)
    .map((file) => relative(root, file).split(sep).join('/'))
    .sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
  if (relativeFiles.length !== 521) throw new AcceptanceError(`Release manifest must contain exactly 521 files; found ${relativeFiles.length}`);
  const contents = relativeFiles.map((file) => `${sha256File(join(root, ...file.split('/')))}  ./${file}\n`).join('');
  return { files: relativeFiles.length, relativeFiles, contents, sha256: sha256Bytes(contents) };
}

function mimeFor(file) {
  return ({
    '.html': 'text/html; charset=utf-8',
    '.xml': 'application/xml; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.csv': 'text/csv; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.webp': 'image/webp',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
  })[extname(file).toLowerCase()] ?? 'application/octet-stream';
}

async function startStaticServer(root) {
  const state = { requests: [], errors: [] };
  const server = createServer((request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      const decoded = decodeURIComponent(url.pathname);
      if (decoded.includes('\0') || decoded.split('/').includes('..')) {
        response.writeHead(400).end('Bad request');
        return;
      }
      let file = join(root, decoded.replace(/^\/+/, ''));
      if (decoded.endsWith('/')) file = join(file, 'index.html');
      if (!isInside(root, file) || !existsSync(file) || !lstatSync(file).isFile()) {
        response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found');
        return;
      }
      state.requests.push({ method: request.method, path: `${url.pathname}${url.search}` });
      const size = statSync(file).size;
      const range = request.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
      if (range) {
        const start = Number(range[1]);
        const end = Math.min(range[2] ? Number(range[2]) : size - 1, size - 1);
        if (!Number.isSafeInteger(start) || start < 0 || start > end || start >= size) {
          response.writeHead(416, { 'content-range': `bytes */${size}` }).end();
          return;
        }
        response.writeHead(206, {
          'accept-ranges': 'bytes',
          'content-range': `bytes ${start}-${end}/${size}`,
          'content-length': end - start + 1,
          'content-type': mimeFor(file),
        });
        createReadStream(file, { start, end }).pipe(response);
        return;
      }
      response.writeHead(200, { 'content-length': size, 'content-type': mimeFor(file) });
      if (request.method === 'HEAD') response.end();
      else createReadStream(file).pipe(response);
    } catch (error) {
      state.errors.push(error.message);
      response.writeHead(500).end('Internal error');
    }
  });
  await new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolvePromise);
  });
  const address = server.address();
  return {
    server,
    state,
    baseUrl: `http://127.0.0.1:${address.port}/`,
    close: () => new Promise((resolvePromise, reject) => server.close((error) => (error ? reject(error) : resolvePromise()))),
  };
}

async function fetchNoRedirect(url, init = {}) {
  return fetch(url, { ...init, redirect: 'manual', signal: AbortSignal.timeout(20000) });
}

function pageLanguageFromHtml(html) {
  return html.match(/<html\b[^>]*\blang=["']([^"']+)["']/i)?.[1] ?? null;
}

async function runHttpChecks(baseUrl, mode, acceptedCsv) {
  const results = [];
  for (const route of expectedHttpRoutes) {
    const url = new URL(route, baseUrl);
    const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20000) });
    const body = await response.text();
    const ok = response.status === 200 && /<!doctype html>/i.test(body) && pageLanguageFromHtml(body) !== null;
    results.push({ route, status: response.status, ok, language: pageLanguageFromHtml(body), finalUrl: response.url });
  }
  const redirectResults = [];
  if (mode === 'production') {
    const rows = readFileSync(acceptedCsv, 'utf8').split(/\r?\n/).filter(Boolean);
    if (rows.length !== 50) throw new AcceptanceError(`Accepted Cloudflare CSV must contain exactly 50 rows; found ${rows.length}`);
    const testQuery = 'source=ja-ko-fa-release';
    for (const [index, line] of rows.entries()) {
      const [hostPath, target, status, preserveQuery, subdomains, pathSuffix, queryString] = line.split(',');
      if (![hostPath, target, status, preserveQuery, subdomains, pathSuffix, queryString].every((value) => value !== undefined)) {
        throw new AcceptanceError(`Malformed Cloudflare CSV row ${index + 1}`);
      }
      const slash = hostPath.indexOf('/');
      const host = slash === -1 ? hostPath : hostPath.slice(0, slash);
      const path = slash === -1 ? '/' : hostPath.slice(slash);
      if (!CLOUDFLARE_HOSTS.includes(host) || status !== '301' || preserveQuery !== 'true'
          || subdomains !== 'false' || pathSuffix !== 'false' || queryString !== 'false') {
        throw new AcceptanceError(`Cloudflare CSV row ${index + 1} does not match the accepted rule contract`);
      }
      const sourceUrl = `https://${host}${path}?${testQuery}`;
      const expected = new URL(target);
      expected.search = testQuery;
      const first = await fetchNoRedirect(sourceUrl);
      const location = first.headers.get('location');
      const actualLocation = location ? new URL(location, sourceUrl).href : null;
      const final = location
        ? await fetch(actualLocation, { redirect: 'follow', signal: AbortSignal.timeout(20000) })
        : null;
      const finalBody = final ? await final.text() : '';
      const expectedLocale = LEGACY_REDIRECTS[Math.floor(index / 2)]?.htmlLang;
      const targetLanguage = pageLanguageFromHtml(finalBody);
      const ok = first.status === 301 && actualLocation === expected.href && final?.status === 200
        && targetLanguage === expectedLocale;
      redirectResults.push({
        index,
        sourceUrl,
        expectedLocation: expected.href,
        actualLocation,
        status: first.status,
        finalStatus: final?.status ?? null,
        expectedLanguage: expectedLocale,
        targetLanguage,
        ok,
      });
    }
  }
  return { results, redirectResults };
}

class CdpConnection {
  constructor(webSocketUrl) {
    this.webSocketUrl = webSocketUrl;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
  }

  async connect() {
    this.socket = new WebSocket(this.webSocketUrl);
    await new Promise((resolvePromise, reject) => {
      const timer = setTimeout(() => reject(new Error('Timed out connecting to Chrome DevTools')), 10000);
      this.socket.addEventListener('open', () => { clearTimeout(timer); resolvePromise(); }, { once: true });
      this.socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Chrome DevTools WebSocket failed')); }, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(`${pending.method}: ${message.error.message}`));
        else pending.resolve(message.result ?? {});
        return;
      }
      const key = `${message.sessionId ?? ''}:${message.method}`;
      for (const listener of this.listeners.get(key) ?? []) listener(message.params ?? {});
    });
    this.socket.addEventListener('close', () => {
      for (const pending of this.pending.values()) pending.reject(new Error('Chrome DevTools connection closed'));
      this.pending.clear();
    });
  }

  command(method, params = {}, sessionId = undefined) {
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolvePromise, reject) => {
      this.pending.set(id, { resolve: resolvePromise, reject, method });
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  on(method, listener, sessionId = '') {
    const key = `${sessionId}:${method}`;
    const listeners = this.listeners.get(key) ?? new Set();
    listeners.add(listener);
    this.listeners.set(key, listeners);
    return () => listeners.delete(listener);
  }

  waitFor(method, sessionId, timeout = 20000) {
    return new Promise((resolvePromise, reject) => {
      const cleanup = this.on(method, (params) => {
        clearTimeout(timer);
        cleanup();
        resolvePromise(params);
      }, sessionId);
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`Timed out waiting for ${method}`));
      }, timeout);
    });
  }

  close() {
    this.socket?.close();
  }
}

async function launchChrome(browser) {
  const profile = mkdtempSync(join(tmpdir(), 'zxrubbertech-v5-acceptance-chrome.'));
  const args = [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-default-apps',
    '--disable-sync',
    '--metrics-recording-only',
    '--mute-audio',
    'about:blank',
  ];
  const child = spawn(browser, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  const webSocketUrl = await new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for Chrome DevTools endpoint')), 20000);
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timer);
        resolvePromise(match[1]);
      }
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Chrome exited before DevTools was ready (${code}): ${stderr.slice(-500)}`));
    });
  });
  const cdp = new CdpConnection(webSocketUrl);
  await cdp.connect();
  const version = await cdp.command('Browser.getVersion');
  if (!/^Chrome\//.test(version.product ?? '') && !/^Chromium\//.test(version.product ?? '')) {
    throw new AcceptanceError(`CDP target is not Chromium: ${version.product ?? 'unknown'}`);
  }
  return {
    child,
    profile,
    cdp,
    version,
    stderr: () => stderr,
    async close() {
      try { await cdp.command('Browser.close'); } catch {}
      cdp.close();
      if (child.exitCode === null) {
        await Promise.race([
          new Promise((resolvePromise) => child.once('exit', resolvePromise)),
          new Promise((resolvePromise) => setTimeout(resolvePromise, 5000)),
        ]);
      }
      if (child.exitCode === null) child.kill('SIGTERM');
      if (child.exitCode === null) {
        await new Promise((resolvePromise) => child.once('exit', resolvePromise));
      }
      rmSync(profile, { recursive: true, force: true });
    },
  };
}

async function createPage(chrome) {
  const { targetId } = await chrome.cdp.command('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await chrome.cdp.command('Target.attachToTarget', { targetId, flatten: true });
  const events = { consoleErrors: [], pageErrors: [], sameOriginHttpErrors: [], loadFailures: [] };
  const form = { attemptedPostRequests: 0, actualPostRequests: 0, interceptedUrls: [] };
  await Promise.all([
    chrome.cdp.command('Page.enable', {}, sessionId),
    chrome.cdp.command('DOM.enable', {}, sessionId),
    chrome.cdp.command('Runtime.enable', {}, sessionId),
    chrome.cdp.command('Network.enable', {}, sessionId),
    chrome.cdp.command('Fetch.enable', { patterns: [{ urlPattern: 'https://formspree.io/*', requestStage: 'Request' }] }, sessionId),
  ]);
  chrome.cdp.on('Runtime.exceptionThrown', ({ exceptionDetails }) => {
    events.pageErrors.push(exceptionDetails?.exception?.description ?? exceptionDetails?.text ?? 'Unknown page error');
  }, sessionId);
  chrome.cdp.on('Runtime.consoleAPICalled', ({ type, args, stackTrace }) => {
    if (!['error', 'assert', 'warning'].includes(type)) return;
    const text = args.map((arg) => arg.value ?? arg.description ?? '').join(' ');
    const source = stackTrace?.callFrames?.[0]?.url ?? '';
    const exactTurnstileNoise = source.includes(turnstileHost)
      && /(?:turnstile|challenge|private access token|preload)/i.test(text);
    if (!exactTurnstileNoise) events.consoleErrors.push({ type, text, source });
  }, sessionId);
  chrome.cdp.on('Network.responseReceived', ({ response }) => {
    let url;
    try { url = new URL(response.url); } catch { return; }
    if (url.origin === page.currentOrigin && response.status >= 400) {
      events.sameOriginHttpErrors.push({ url: response.url, status: response.status });
    }
    if (url.origin === formspreeOrigin && response.requestHeaders?.[':method'] === 'POST') form.actualPostRequests += 1;
  }, sessionId);
  chrome.cdp.on('Network.loadingFailed', ({ errorText, blockedReason, canceled, requestId }) => {
    if (!canceled) events.loadFailures.push({ errorText, blockedReason: blockedReason ?? null, requestId });
  }, sessionId);
  chrome.cdp.on('Fetch.requestPaused', async ({ requestId, request }) => {
    if (request.method === 'POST' && new URL(request.url).origin === formspreeOrigin) {
      form.attemptedPostRequests += 1;
      form.interceptedUrls.push(request.url);
      await chrome.cdp.command('Fetch.failRequest', { requestId, errorReason: 'Aborted' }, sessionId).catch(() => {});
    } else {
      await chrome.cdp.command('Fetch.continueRequest', { requestId }, sessionId).catch(() => {});
    }
  }, sessionId);

  const page = {
    targetId,
    sessionId,
    events,
    form,
    currentOrigin: '',
    async command(method, params = {}) { return chrome.cdp.command(method, params, sessionId); },
    resetEvents() {
      events.consoleErrors.length = 0;
      events.pageErrors.length = 0;
      events.sameOriginHttpErrors.length = 0;
      events.loadFailures.length = 0;
    },
    async viewport(viewport) {
      await this.command('Emulation.setDeviceMetricsOverride', {
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: 1,
        mobile: viewport.mobile,
        screenWidth: viewport.width,
        screenHeight: viewport.height,
      });
    },
    async navigate(url) {
      this.currentOrigin = new URL(url).origin;
      this.resetEvents();
      const loaded = chrome.cdp.waitFor('Page.loadEventFired', sessionId, 30000);
      const result = await this.command('Page.navigate', { url });
      if (result.errorText) throw new AcceptanceError(`Navigation failed: ${url}: ${result.errorText}`);
      await loaded;
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 150));
    },
    async evaluate(expression, { awaitPromise = true, returnByValue = true } = {}) {
      const result = await this.command('Runtime.evaluate', {
        expression,
        awaitPromise,
        returnByValue,
        userGesture: true,
      });
      if (result.exceptionDetails) throw new AcceptanceError(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
      return result.result?.value;
    },
    async waitFor(expression, label, timeout = 10000) {
      return this.evaluate(`new Promise((resolve,reject)=>{const started=Date.now();const poll=()=>{let value=false;try{value=(${expression})}catch{}if(value)return resolve(value);if(Date.now()-started>${timeout})return reject(new Error(${JSON.stringify(`Timed out waiting for ${label}`)}));setTimeout(poll,50)};poll()})`);
    },
    async click(selector) {
      const { root } = await this.command('DOM.getDocument', { depth: 0 });
      const { nodeId } = await this.command('DOM.querySelector', { nodeId: root.nodeId, selector });
      if (!nodeId) throw new AcceptanceError(`Cannot find physical click selector: ${selector}`);
      await this.command('DOM.scrollIntoViewIfNeeded', { nodeId });
      const hasFadeAncestor = await this.evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)})?.closest('.fade'))`);
      await new Promise((resolvePromise) => setTimeout(resolvePromise, hasFadeAncestor ? 950 : 100));
      const { model } = await this.command('DOM.getBoxModel', { nodeId });
      const point = await this.evaluate(`(()=>{const element=document.querySelector(${JSON.stringify(selector)});if(!element)return null;const r=element.getBoundingClientRect();for(const yf of [.2,.5,.8])for(const xf of [.2,.5,.8]){const x=r.left+r.width*xf,y=r.top+r.height*yf,hit=document.elementFromPoint(x,y);if(hit&&(hit===element||element.contains(hit)))return {x,y,hit:hit.tagName}}return null})()`);
      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || model.width <= 0 || model.height <= 0) {
        throw new AcceptanceError(`Cannot resolve physical click box: ${selector}`);
      }
      await this.command('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y });
      await this.command('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 });
      await this.command('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 });
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
    },
    async key(key) {
      const definitions = {
        Tab: { code: 'Tab', vk: 9 },
        ArrowDown: { code: 'ArrowDown', vk: 40 },
        ArrowUp: { code: 'ArrowUp', vk: 38 },
        Escape: { code: 'Escape', vk: 27 },
        Enter: { code: 'Enter', vk: 13 },
      };
      const definition = definitions[key];
      if (!definition) throw new AcceptanceError(`Unsupported physical key: ${key}`);
      await this.command('Input.dispatchKeyEvent', { type: 'rawKeyDown', key, code: definition.code, windowsVirtualKeyCode: definition.vk, nativeVirtualKeyCode: definition.vk });
      await this.command('Input.dispatchKeyEvent', { type: 'keyUp', key, code: definition.code, windowsVirtualKeyCode: definition.vk, nativeVirtualKeyCode: definition.vk });
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
    },
    async close() {
      await chrome.cdp.command('Target.closeTarget', { targetId }).catch(() => {});
    },
  };
  return page;
}

const pageInvariantExpression = (locale, stem, expectedCanonical) => `
(async()=>{
  const locale=${JSON.stringify(locale)};
  const stem=${JSON.stringify(stem)};
  const expectedCanonical=${JSON.stringify(expectedCanonical)};
  const expectedLocales=${JSON.stringify(localeIds)};
  const expectedAlternates=${JSON.stringify(getHreflangCluster(stem).map(({ hreflang, url }) => ({ hreflang, href: url })))};
  const images=[...document.images];
  const imageDeadline=Date.now()+45000;
  const waitImage=(image)=>new Promise(resolve=>{
    let settled=false;
    let timeoutId;
    const cleanup=()=>{clearTimeout(timeoutId);image.removeEventListener('load',onLoad);image.removeEventListener('error',onError)};
    const finish=async outcome=>{
      if(settled)return;
      settled=true;
      cleanup();
      const successful=outcome!=='error'&&outcome!=='timeout'&&image.complete&&image.naturalWidth>0;
      if(successful&&typeof image.decode==='function'){
        const remaining=Math.max(0,imageDeadline-Date.now());
        if(remaining>0)await new Promise(done=>{
          const decodeTimeoutId=setTimeout(done,remaining);
          image.decode().catch(()=>{}).finally(()=>{clearTimeout(decodeTimeoutId);done()});
        });
      }
      resolve({outcome,successful});
    };
    const onLoad=()=>finish(image.complete&&image.naturalWidth>0?'load':'load-without-dimensions');
    const onError=()=>finish('error');
    image.addEventListener('load',onLoad,{once:true});
    image.addEventListener('error',onError,{once:true});
    timeoutId=setTimeout(()=>finish('timeout'),Math.max(0,imageDeadline-Date.now()));
    if(image.complete){finish(image.naturalWidth>0?'already-loaded':'already-broken');return}
    image.loading='eager';
    try{image.fetchPriority='high'}catch{}
    void image.currentSrc;
    void image.getBoundingClientRect();
    if(image.complete)finish(image.naturalWidth>0?'loaded-after-trigger':'broken-after-trigger');
  });
  const imageResults=await Promise.all(images.map(waitImage));
  const brokenImages=images.filter((image,index)=>!imageResults[index].successful||!image.complete||image.naturalWidth===0).map(image=>image.currentSrc||image.src);
  const videoChecks=await Promise.all([...document.querySelectorAll('video')].map(async video=>{
    const source=video.currentSrc||video.querySelector('source')?.src||video.src;
    if(!source)return {source:null,ok:false,reason:'missing source'};
    try{const response=await fetch(source,{headers:{Range:'bytes=0-1'}});const mime=response.headers.get('content-type')||'';return {source,ok:(response.status===200||response.status===206)&&mime.startsWith('video/'),status:response.status,mime}}catch(error){return {source,ok:false,reason:error.message}}
  }));
  const elements=[...document.querySelectorAll('body *')].filter(element=>{
    const style=getComputedStyle(element);if(style.display==='none'||style.visibility==='hidden')return false;
    const r=element.getBoundingClientRect();return r.width>0&&r.height>0;
  });
  const locallyVisibleOutsideViewport=(element)=>{const r=element.getBoundingClientRect();if(r.width<=document.documentElement.clientWidth+1)return false;let ancestor=element.parentElement;while(ancestor&&ancestor!==document.body){const style=getComputedStyle(ancestor),a=ancestor.getBoundingClientRect();if(['hidden','clip'].includes(style.overflowX)&&a.left>=-1&&a.right<=document.documentElement.clientWidth+1)return false;ancestor=ancestor.parentElement}return true};
  const localOverflowElements=elements.filter(locallyVisibleOutsideViewport).slice(0,20).map(element=>{const r=element.getBoundingClientRect();return {tag:element.tagName,className:element.className,id:element.id,width:r.width,viewport:document.documentElement.clientWidth}});
  const groups=['.v5-language-switcher','.v5-language-mobile','.v5-language-footer'].map(selector=>{
    const root=document.querySelector(selector);const links=[...(root?.querySelectorAll('a[data-language-link]')||[])];return {selector,exists:!!root,count:links.length,locales:links.map(link=>link.dataset.locale),current:links.filter(link=>link.getAttribute('aria-current')==='page').map(link=>link.dataset.locale)};
  });
  const controlsValid=groups.every(group=>group.exists&&group.count===8&&JSON.stringify(group.locales)===JSON.stringify(expectedLocales)&&JSON.stringify(group.current)===JSON.stringify([locale]));
  const canonical=document.querySelector('link[rel="canonical"]')?.href||null;
  const alternates=[...document.querySelectorAll('link[rel="alternate"][hreflang]')].map(link=>({hreflang:link.hreflang,href:link.href}));
  const hrefs=[...document.querySelectorAll('a[href]')].filter(a=>!a.hasAttribute('data-language-link')).map(a=>a.getAttribute('href'));
  const prefix=${JSON.stringify(V5_LOCALES[locale].prefix ? `/${V5_LOCALES[locale].prefix}/` : '/')};
  const otherPrefixes=${JSON.stringify(Object.values(V5_LOCALES).map(v=>v.prefix).filter(Boolean).map(prefix=>`/${prefix}/`))};
  const leaked=hrefs.filter(href=>{if(!href||href.startsWith('#')||href.startsWith('mailto:')||href.startsWith('tel:'))return false;const url=new URL(href,location.href);if(/^https?:/i.test(href)&&!['zxrubbertech.com','www.zxrubbertech.com',location.hostname].includes(url.hostname))return false;const path=url.pathname;if(path.startsWith('/media/')||path.startsWith('/LOGO/'))return false;if(locale==='en')return otherPrefixes.some(p=>path.startsWith(p));return !path.startsWith(prefix);});
  const mirrored=[...document.querySelectorAll('img,video,picture,svg,.logo,[data-map-destination],.quotev5-map-preview')].filter(element=>{const value=getComputedStyle(element).transform;if(!value||value==='none')return false;const match=value.match(/^matrix\\(([^)]+)\\)$/);if(!match)return /scaleX\\(\\s*-/.test(value);const [a,b,c,d]=match[1].split(',').map(Number);return a*d-b*c<0;}).map(element=>({tag:element.tagName,className:element.className,transform:getComputedStyle(element).transform}));
  const ltrBdi=[...document.querySelectorAll('bdi[dir="ltr"]')];
  const languageRoots=[...document.querySelectorAll('.v5-language-switcher,.v5-language-mobile,.v5-language-footer')];
  const persianEvidence=locale!=='fa'?null:{
    documentDirection:document.documentElement.dir==='rtl'&&getComputedStyle(document.body).direction==='rtl',
    h1Direction:getComputedStyle(document.querySelector('h1')).direction==='rtl',
    languageControlDirections:languageRoots.map(root=>getComputedStyle(root).direction),
    footerDirection:getComputedStyle(document.querySelector('.footv5')).direction,
    faqSummaryDirections:[...document.querySelectorAll('details summary')].map(summary=>getComputedStyle(summary).direction),
    form:stem!=='quote'?null:{
      hiddenLocale:document.querySelector('input[type="hidden"][name="language"]')?.value||null,
      turnstileLanguage:document.querySelector('.cf-turnstile')?.dataset?.language||null,
      emailDir:document.querySelector('[name="email"]')?.dir||null,
      phoneDir:document.querySelector('[name="phone"]')?.dir||null,
      nameDir:document.querySelector('[name="name"]')?.dir||null,
      messageDir:document.querySelector('[name="message"]')?.dir||null,
      dirnameFields:document.querySelectorAll('[dirname]').length,
    },
    ltrBdiCount:ltrBdi.length,
    ltrBdiValid:ltrBdi.length>0&&ltrBdi.every(element=>getComputedStyle(element).direction==='ltr'&&!/[\\u0600-\\u06ff]/.test(element.textContent)),
  };
  const persianEvidenceValid=locale!=='fa'||(persianEvidence.documentDirection&&persianEvidence.h1Direction&&persianEvidence.languageControlDirections.every(direction=>direction==='rtl')&&persianEvidence.footerDirection==='rtl'&&(stem!=='faq'||(persianEvidence.faqSummaryDirections.length>0&&persianEvidence.faqSummaryDirections.every(direction=>direction==='rtl')))&&(stem!=='quote'||(persianEvidence.form.hiddenLocale==='fa'&&persianEvidence.form.turnstileLanguage==='fa'&&persianEvidence.form.emailDir==='ltr'&&persianEvidence.form.phoneDir==='ltr'&&persianEvidence.form.nameDir==='auto'&&persianEvidence.form.messageDir==='auto'&&persianEvidence.form.dirnameFields===0))&&persianEvidence.ltrBdiValid);
  return {
    htmlLang:document.documentElement.lang,
    htmlDir:document.documentElement.dir||'ltr',
    h1Count:document.querySelectorAll('h1').length,
    horizontalOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+1||document.body.scrollWidth>document.body.clientWidth+1,
    localOverflow:localOverflowElements.length>0,
    localOverflowElements,
    brokenImages,
    videoChecks,
    groups,
    controlsValid,
    canonical,
    canonicalValid:canonical===expectedCanonical,
    alternates,
    hreflangCount:alternates.length,
    hreflangValid:JSON.stringify(alternates)===JSON.stringify(expectedAlternates),
    internalNavigationValid:leaked.length===0,
    leaked,
    rtlValid:persianEvidenceValid,
    persianEvidence,
    mediaMirrored:mirrored.some(item=>!item.className?.toString().includes('map')),
    mapMirrored:mirrored.some(item=>item.className?.toString().includes('map')),
    mirrored,
  };
})()`;

function pageResultOk(result, locale, events) {
  return result.htmlLang === V5_LOCALES[locale].htmlLang
    && result.h1Count === 1
    && result.horizontalOverflow === false
    && result.localOverflow === false
    && result.brokenImages.length === 0
    && result.videoChecks.every(({ ok }) => ok)
    && result.controlsValid === true
    && result.canonicalValid === true
    && result.hreflangCount === 9
    && result.hreflangValid === true
    && result.internalNavigationValid === true
    && events.consoleErrors.length === 0
    && events.pageErrors.length === 0
    && events.sameOriginHttpErrors.length === 0
    && (locale !== 'fa' || (result.rtlValid && !result.mediaMirrored && !result.mapMirrored));
}

async function runBrowserChecks(chrome, baseUrl) {
  const page = await createPage(chrome);
  const browserResults = [];
  const failures = [];
  try {
    for (const { locale, stem, route } of canonicalCases) {
      for (const viewport of viewports) {
        await page.viewport(viewport);
        const pageUrl = new URL(route, baseUrl).href;
        await page.navigate(pageUrl);
        const invariant = await page.evaluate(pageInvariantExpression(locale, stem, getLocalizedUrl(locale, stem)));
        const migrationConsoleErrors = [
          ...page.events.consoleErrors,
          ...page.events.pageErrors.map((text) => ({ type: 'pageerror', text })),
          ...page.events.sameOriginHttpErrors.map((error) => ({ type: 'http', text: `${error.status} ${error.url}` })),
        ];
        const result = {
          locale,
          stem,
          viewport: viewport.label,
          ok: pageResultOk(invariant, locale, page.events),
          h1Count: invariant.h1Count,
          horizontalOverflow: invariant.horizontalOverflow,
          localOverflow: invariant.localOverflow,
          brokenImages: invariant.brokenImages.length,
          failedVideos: invariant.videoChecks.filter(({ ok }) => !ok).length,
          controlsValid: invariant.controlsValid,
          canonicalValid: invariant.canonicalValid,
          hreflangCount: invariant.hreflangCount,
          internalNavigationValid: invariant.internalNavigationValid,
          migrationConsoleErrors,
          ...(locale === 'fa' ? {
            rtlValid: invariant.rtlValid,
            mediaMirrored: invariant.mediaMirrored,
            mapMirrored: invariant.mapMirrored,
          } : {}),
          diagnostics: {
            htmlLang: invariant.htmlLang,
            htmlDir: invariant.htmlDir,
            groups: invariant.groups,
            canonical: invariant.canonical,
            hreflangValid: invariant.hreflangValid,
            leaked: invariant.leaked,
            brokenImages: invariant.brokenImages,
            videoChecks: invariant.videoChecks,
            localOverflowElements: invariant.localOverflowElements,
            mirrored: invariant.mirrored,
            persianEvidence: invariant.persianEvidence,
          },
        };
        browserResults.push(result);
        if (!result.ok) failures.push(`Browser invariant failed: ${locale}/${stem}/${viewport.label}`);
      }
    }
    let clickPaths = {};
    let formEvidence = {
      locales: [],
      allPassed: false,
      attemptedPostRequests: page.form.attemptedPostRequests,
      actualPostRequests: page.form.actualPostRequests,
      interceptedUrls: page.form.interceptedUrls,
    };
    try {
      clickPaths = await runInteractions(page, baseUrl);
    } catch (error) {
      failures.push(`Interaction harness failed closed: ${error.message}`);
    }
    try {
      formEvidence = await runQuoteChecks(page, baseUrl);
    } catch (error) {
      failures.push(`Quote harness failed closed: ${error.message}`);
      formEvidence.attemptedPostRequests = page.form.attemptedPostRequests;
      formEvidence.actualPostRequests = page.form.actualPostRequests;
    }
    return { page, browserResults, clickPaths, formEvidence, failures };
  } catch (error) {
    await page.close();
    throw error;
  }
}

async function interceptAndClick(page, selector) {
  const installed = await page.evaluate(`(()=>{const element=document.querySelector(${JSON.stringify(selector)});if(!element)return false;window.__acceptanceClick=null;element.addEventListener('click',event=>{event.preventDefault();window.__acceptanceClick={href:element.href,trusted:event.isTrusted}}, {once:true});return true})()`);
  if (!installed) return { href: null, trusted: false };
  await page.click(selector);
  return page.evaluate('window.__acceptanceClick');
}

async function interceptAndKeyboardActivate(page, selector) {
  const installed = await page.evaluate(`(()=>{const element=document.querySelector(${JSON.stringify(selector)});if(!element)return false;window.__acceptanceClick=null;element.addEventListener('click',event=>{event.preventDefault();window.__acceptanceClick={href:element.href,trusted:event.isTrusted,detail:event.detail}}, {once:true});element.focus();return document.activeElement===element})()`);
  if (!installed) return { href: null, trusted: false };
  await page.key('Enter');
  return page.evaluate('window.__acceptanceClick');
}

async function runInteractions(page, baseUrl) {
  let samePageLanguageRoles = 0;
  for (const stem of V5_PAGE_STEMS) {
    await page.viewport(viewports[0]);
    await page.navigate(new URL(getLocalizedRoute('en', stem), baseUrl).href);
    await page.click('.v5-language-switcher__button');
    await page.click('.v5-language-switcher__menu a[data-locale="ja"]');
    await page.waitFor(`location.pathname===${JSON.stringify(getLocalizedRoute('ja', stem))}`, `Japanese ${stem} language-switch route`);
    const role = await page.evaluate('({lang:document.documentElement.lang,path:location.pathname})');
    if (role.lang === 'ja' && role.path === getLocalizedRoute('ja', stem)) samePageLanguageRoles += 1;
  }

  await page.navigate(new URL('/products/', baseUrl).href);
  await page.click('a[href="#c-automotive"]');
  const productsFragment = await page.evaluate('location.hash==="#c-automotive"');
  await page.navigate(new URL('/', baseUrl).href);
  const compoundClick = await interceptAndClick(page, 'a[href="/rubber-compounds/#compound-primary"]');
  await page.navigate(new URL('/rubber-compounds/#compound-primary', baseUrl).href);
  const compoundsFragment = compoundClick?.trusted === true
    && new URL(compoundClick.href).pathname === '/rubber-compounds/'
    && new URL(compoundClick.href).hash === '#compound-primary'
    && await page.evaluate(`location.pathname==='/rubber-compounds/'&&location.hash==='#compound-primary'`);

  await page.navigate(new URL('/industries/', baseUrl).href);
  const industryClick = await interceptAndKeyboardActivate(page, 'a[href="/quote/?industry=automotive-mobility#contact"]');
  await page.navigate(new URL('/quote/?industry=automotive-mobility#contact', baseUrl).href);
  const quoteIndustry = industryClick?.trusted === true
    && new URL(industryClick.href).search === '?industry=automotive-mobility'
    && await page.evaluate('location.search==="?industry=automotive-mobility"');
  const quoteContact = industryClick?.trusted === true
    && new URL(industryClick.href).hash === '#contact'
    && await page.evaluate('location.hash==="#contact"');

  await page.viewport(viewports[1]);
  await page.navigate(new URL('/products/', baseUrl).href);
  await page.click('a[href="#c-sealing"]');
  const mobileFragments = await page.evaluate('location.hash==="#c-sealing"');

  await page.viewport(viewports[0]);
  await page.navigate(new URL('/quote/', baseUrl).href);
  const emailClick = await interceptAndClick(page, '.quotev5-contact-item a[href^="mailto:"]');
  const whatsappClick = await interceptAndClick(page, '.quotev5-contact-item a[href^="https://wa.me/"]');
  const mapClick = await interceptAndClick(page, 'a[data-map-destination]');

  await page.evaluate('document.body.focus();window.scrollTo(0,0)');
  await page.key('Tab');
  const tabActive = await page.evaluate('document.activeElement!==document.body&&document.activeElement!==document.documentElement');
  await page.evaluate('document.querySelector(".v5-language-switcher__button").focus()');
  await page.key('ArrowDown');
  const firstMenuLocale = await page.evaluate('document.activeElement?.dataset?.locale||null');
  await page.key('ArrowDown');
  const secondMenuLocale = await page.evaluate('document.activeElement?.dataset?.locale||null');
  await page.key('Escape');
  const escapeRestored = await page.evaluate('document.activeElement===document.querySelector(".v5-language-switcher__button")&&document.querySelector(".v5-language-switcher__menu").hidden');

  await page.navigate(new URL('/fa/quote/', baseUrl).href);
  await page.viewport(viewports[0]);
  const expectedFocusable = await page.evaluate(`(()=>[...document.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(e=>{const s=getComputedStyle(e);const r=e.getBoundingClientRect();return s.visibility!=='hidden'&&s.display!=='none'&&r.width>0&&r.height>0}).slice(0,8).map(e=>e.outerHTML.slice(0,120)))()`);
  await page.evaluate('document.body.focus()');
  const observedFocusable = [];
  for (let index = 0; index < expectedFocusable.length; index += 1) {
    await page.key('Tab');
    observedFocusable.push(await page.evaluate('document.activeElement?.outerHTML?.slice(0,120)||null'));
  }
  const persianFocusOrder = JSON.stringify(observedFocusable) === JSON.stringify(expectedFocusable);
  return {
    samePageLanguageRoles,
    productsFragment,
    compoundsFragment,
    quoteIndustry,
    quoteContact,
    mobileFragments,
    email: emailClick?.trusted === true && emailClick.href.startsWith('mailto:'),
    whatsapp: whatsappClick?.trusted === true && whatsappClick.href.startsWith('https://wa.me/'),
    map: mapClick?.trusted === true && /^https:\/\/(?:www\.google\.com\/maps|uri\.amap\.com\/)/.test(mapClick.href),
    localizedInternalNavigation: samePageLanguageRoles === 7,
    keyboardTab: tabActive,
    keyboardArrows: firstMenuLocale === 'en' && secondMenuLocale === 'de',
    keyboardEscape: escapeRestored,
    persianFocusOrder,
  };
}

async function setField(page, selector, value) {
  await page.evaluate(`(()=>{const field=document.querySelector(${JSON.stringify(selector)});field.focus();field.value=${JSON.stringify(value)};field.dispatchEvent(new Event('input',{bubbles:true}));})()`);
}

async function runQuoteChecks(page, baseUrl) {
  const localeResults = [];
  for (const locale of localeIds) {
    await page.viewport(viewports[0]);
    await page.navigate(new URL(getLocalizedRoute(locale, 'quote'), baseUrl).href);
    const beforeAttempts = page.form.attemptedPostRequests;
    await page.click('[data-fs-submit-btn]');
    const empty = await page.evaluate(`(()=>{const fields=[...document.querySelectorAll('[data-fs-field][required]')];return {invalid:fields.filter(f=>!f.checkValidity()).length,messages:fields.map(f=>f.validationMessage)}})()`);
    await setField(page, '[name="name"]', 'Acceptance Tester');
    await setField(page, '[name="email"]', 'invalid-email');
    await setField(page, '[name="message"]', 'Acceptance only; do not submit.');
    await page.click('[data-fs-submit-btn]');
    const badEmail = await page.evaluate('({invalid:!document.querySelector("[name=email]").checkValidity(),message:document.querySelector("[name=email]").validationMessage})');
    await setField(page, '[name="email"]', 'acceptance@example.com');
    await page.evaluate(`(()=>{const form=document.getElementById('contact-form');document.querySelectorAll('[name="cf-turnstile-response"]').forEach(field=>field.remove());form.addEventListener('submit',()=>document.querySelectorAll('[name="cf-turnstile-response"]').forEach(field=>field.remove()),{capture:true,once:true})})()`);
    await page.click('[data-fs-submit-btn]');
    const withoutTurnstile = await page.evaluate(`(()=>({
      status:document.getElementById('quote-verification-status')?.textContent?.trim()||'',
      state:document.getElementById('quote-verification-status')?.dataset?.state||'',
      values:Object.fromEntries([...document.querySelectorAll('[data-fs-field]')].map(field=>[field.name,field.value])),
      hiddenLocale:document.querySelector('input[type="hidden"][name="language"]')?.value||null,
      turnstileLanguage:document.querySelector('.cf-turnstile')?.dataset?.language||null,
      formAction:document.getElementById('contact-form')?.action||null,
    }))()`);
    const expectedTurnstile = V5_LOCALES[locale].turnstileLanguage;
    const ok = empty.invalid === 3 && empty.messages.every(Boolean)
      && badEmail.invalid && Boolean(badEmail.message)
      && withoutTurnstile.state === 'error' && Boolean(withoutTurnstile.status)
      && withoutTurnstile.values.name === 'Acceptance Tester'
      && withoutTurnstile.values.email === 'acceptance@example.com'
      && withoutTurnstile.values.message === 'Acceptance only; do not submit.'
      && withoutTurnstile.hiddenLocale === locale
      && withoutTurnstile.turnstileLanguage === expectedTurnstile
      && withoutTurnstile.formAction === 'https://formspree.io/f/mrpzqado'
      && page.form.attemptedPostRequests === beforeAttempts;
    localeResults.push({ locale, ok, empty, badEmail, withoutTurnstile });
  }
  return {
    locales: localeResults,
    allPassed: localeResults.every(({ ok }) => ok),
    attemptedPostRequests: page.form.attemptedPostRequests,
    actualPostRequests: page.form.actualPostRequests,
    interceptedUrls: page.form.interceptedUrls,
  };
}

function exactClickPathsPassed(clicks) {
  return Object.entries({
    samePageLanguageRoles: 7,
    productsFragment: true,
    compoundsFragment: true,
    quoteIndustry: true,
    quoteContact: true,
    mobileFragments: true,
    email: true,
    whatsapp: true,
    map: true,
    localizedInternalNavigation: true,
    keyboardTab: true,
    keyboardArrows: true,
    keyboardEscape: true,
    persianFocusOrder: true,
  }).every(([key, expected]) => clicks[key] === expected);
}

function validateExactOrdering(report) {
  const httpKeys = report.httpResults.map(({ route }) => route);
  if (JSON.stringify(httpKeys) !== JSON.stringify(expectedHttpRoutes)) throw new AcceptanceError('HTTP result keys/order are not exact');
  const browserKeys = report.browserResults.map(({ locale, stem, viewport }) => `${locale}\0${stem}\0${viewport}`);
  if (JSON.stringify(browserKeys) !== JSON.stringify(expectedBrowserKeys)) throw new AcceptanceError('Browser result keys/order are not exact');
  const persianKeys = report.browserResults.filter(({ locale }) => locale === 'fa').map(({ locale, stem, viewport }) => `${locale}\0${stem}\0${viewport}`);
  if (JSON.stringify(persianKeys) !== JSON.stringify(expectedPersianKeys)) throw new AcceptanceError('Persian RTL keys/order are not exact');
}

async function run(options) {
  let localServer = null;
  let chrome = null;
  let browserPage = null;
  let initialManifest = null;
  const failures = [];
  let cleanup = { browserExited: false, serverClosed: false, profileRemoved: false };
  try {
    let baseUrl = options.baseUrl;
    let candidateInputSha256;
    const revisionResult = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' });
    if (revisionResult.status !== 0 || !/^[a-f0-9]{40}\n?$/.test(revisionResult.stdout ?? '')) {
      throw new AcceptanceError('Cannot bind acceptance to the candidate Git input revision');
    }
    const candidateInputRevision = revisionResult.stdout.trim();
    let releaseManifestSha256;
    if (options.mode === 'local') {
      validateReleaseBundle(options.root);
      initialManifest = releaseManifest(options.root);
      releaseManifestSha256 = initialManifest.sha256;
      candidateInputSha256 = sha256File(join(options.root, 'v5-release-report.json'));
      localServer = await startStaticServer(options.root);
      baseUrl = localServer.baseUrl;
    } else {
      candidateInputSha256 = sha256Bytes(readFileSync(options.cloudflareCsv));
      releaseManifestSha256 = candidateInputSha256;
    }

    const http = await runHttpChecks(baseUrl, options.mode, options.cloudflareCsv);
    failures.push(...http.results.filter(({ ok }) => !ok).map(({ route }) => `HTTP route failed: ${route}`));
    failures.push(...http.redirectResults.filter(({ ok }) => !ok).map(({ sourceUrl }) => `Production redirect failed: ${sourceUrl}`));
    chrome = await launchChrome(options.browser);
    const browser = await runBrowserChecks(chrome, baseUrl);
    browserPage = browser.page;
    failures.push(...browser.failures);
    if (!exactClickPathsPassed(browser.clickPaths)) failures.push('Targeted interaction evidence failed');
    if (!browser.formEvidence.allPassed) failures.push('Quote validation evidence failed');
    if (browser.formEvidence.attemptedPostRequests !== 0) failures.push('A Formspree POST was attempted');
    if (browser.formEvidence.actualPostRequests !== 0) failures.push('A Formspree POST reached the network');
    if (browser.formEvidence.interceptedUrls.length !== 0) failures.push('A Formspree POST URL was intercepted');

    if (initialManifest) {
      const finalManifest = releaseManifest(options.root);
      if (finalManifest.sha256 !== initialManifest.sha256 || finalManifest.contents !== initialManifest.contents) {
        failures.push('Release manifest changed during acceptance');
      }
    }

    const passingBrowser = browser.browserResults.filter(({ ok }) => ok).length;
    const report = {
      status: failures.length === 0 ? 'PASS' : 'FAIL',
      mode: options.mode,
      candidateInputRevision,
      candidateInputSha256,
      releaseReportSha256: options.mode === 'local' ? candidateInputSha256 : null,
      releaseManifestSha256,
      manifestFiles: initialManifest?.files ?? null,
      controller: {
        kind: 'node-built-in-websocket-chrome-devtools-protocol',
        browserRequested: options.browserRequested,
        browserRealpath: options.browser,
        browserVersion: options.browserVersion,
        browserSha256: options.browserSha256,
        protocolVersion: chrome.version.protocolVersion,
        product: chrome.version.product,
      },
      httpRoutes: http.results.length,
      httpPassed: http.results.filter(({ ok }) => ok).length,
      httpResults: http.results,
      productionRedirectRows: http.redirectResults.length,
      productionRedirectPassed: http.redirectResults.filter(({ ok }) => ok).length,
      redirectResults: http.redirectResults,
      browserPages: canonicalCases.length,
      pageViewportChecks: browser.browserResults.length,
      pageViewportPassed: passingBrowser,
      browserResults: browser.browserResults,
      persianRtlViewportChecks: browser.browserResults.filter(({ locale, ok }) => locale === 'fa' && ok).length,
      clickPaths: browser.clickPaths,
      interactionEvidence: {
        quoteValidation: browser.formEvidence.locales,
        exactHttpKeys: expectedHttpRoutes,
        exactBrowserKeys: expectedBrowserKeys,
        exactPersianKeys: expectedPersianKeys,
      },
      formSubmission: 'deferred',
      realSubmissions: 0,
      formspreeAttemptedPostRequests: browser.formEvidence.attemptedPostRequests,
      formspreePostRequests: browser.formEvidence.actualPostRequests,
      formspreeInterceptedUrls: browser.formEvidence.interceptedUrls,
      failures,
      cleanup,
    };
    validateExactOrdering(report);
    return report;
  } finally {
    if (browserPage) await browserPage.close().catch(() => {});
    if (chrome) {
      const profile = chrome.profile;
      await chrome.close().catch(() => {});
      cleanup.browserExited = chrome.child.exitCode !== null;
      cleanup.profileRemoved = !existsSync(profile);
    }
    if (localServer) {
      await localServer.close().catch(() => {});
      cleanup.serverClosed = !localServer.server.listening;
    } else cleanup.serverClosed = true;
  }
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(JSON.stringify({ status: 'FAIL', error: error.message }, null, 2));
    process.exitCode = 2;
    return;
  }
  try {
    const report = await run(options);
    if (!report.cleanup.browserExited || !report.cleanup.serverClosed || !report.cleanup.profileRemoved) {
      report.status = 'FAIL';
      report.failures.push('Browser/server cleanup verification failed');
    }
    writeFileSync(options.output, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    console.log(JSON.stringify(report, null, 2));
    if (report.status !== 'PASS') process.exitCode = 1;
  } catch (error) {
    const report = {
      status: 'FAIL',
      error: error.message,
      httpRoutes: 0,
      httpPassed: 0,
      browserPages: 0,
      pageViewportChecks: 0,
      pageViewportPassed: 0,
      persianRtlViewportChecks: 0,
      formSubmission: 'deferred',
      realSubmissions: 0,
      formspreeAttemptedPostRequests: 0,
      formspreePostRequests: 0,
      formspreeInterceptedUrls: [],
      failures: [error.message],
    };
    try { writeFileSync(options.output, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' }); } catch {}
    console.error(JSON.stringify(report, null, 2));
    process.exitCode = 1;
  }
}

await main();
