#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { getHreflangCluster, getLocalizedRoute, getLocalizedUrl, V5_LOCALES, V5_PAGE_STEMS } from './v5-i18n-config.mjs';
import { CLOUDFLARE_HOSTS, LEGACY_REDIRECTS, V5_URLS } from './v5-retirement-map.mjs';

const cliFailures = [];
let rootArgument = null;

for (const argument of process.argv.slice(2)) {
  if (!argument.startsWith('--root=')) {
    cliFailures.push(`unknown argument: ${argument}`);
    continue;
  }
  if (rootArgument !== null) {
    cliFailures.push('duplicate --root argument');
    continue;
  }
  rootArgument = argument.slice('--root='.length);
  if (!rootArgument) cliFailures.push('--root must not be empty');
}

const requestedRoot = resolve(rootArgument ?? resolve(import.meta.dirname, '..'));
if (!existsSync(requestedRoot)) cliFailures.push(`root does not exist: ${requestedRoot}`);
else if (lstatSync(requestedRoot).isSymbolicLink() || !lstatSync(requestedRoot).isDirectory()) {
  cliFailures.push(`root must be a real directory: ${requestedRoot}`);
}
const repositoryRoot = existsSync(requestedRoot) ? realpathSync(requestedRoot) : requestedRoot;

if (cliFailures.length) {
  process.stderr.write(`${JSON.stringify({ status: 'FAIL', failures: cliFailures }, null, 2)}\n`);
  process.exit(2);
}

const failures = [];
const registryLocales = Object.freeze(Object.keys(V5_LOCALES));
const expectedV5Urls = Object.freeze(registryLocales.flatMap((locale) => (
  V5_PAGE_STEMS.map((stem) => getLocalizedUrl(locale, stem))
)));
const expectedCounts = Object.freeze({
  v5Urls: registryLocales.length * V5_PAGE_STEMS.length,
  legacyPaths: 25,
  hosts: 2,
  csvRows: 50,
  releaseFiles: 528,
});
const acceptedCsvSha256 = '8d17b3226a266ff4539cf9a6721e4854992121663aeebd60354b3e73cf76fb63';
const exactRobots = `User-agent: *\nAllow: /\n\nSitemap: https://www.zxrubbertech.com/sitemap.xml\n`;
const allowedTargets = new Set(V5_URLS);
const allowedFragments = new Set(['', '#c-automotive', '#c-industrial']);
const legacyPaths = new Set();
const v5Paths = new Set(V5_URLS.map((url) => new URL(url).pathname));
const expectedLegacyLocales = Object.freeze([
  Object.freeze({ locale: 'en', htmlLang: 'en', sourcePrefix: '', targetPrefix: '' }),
  Object.freeze({ locale: 'de', htmlLang: 'de', sourcePrefix: 'de', targetPrefix: 'de' }),
  Object.freeze({ locale: 'zh-CN', htmlLang: 'zh-CN', sourcePrefix: 'zh', targetPrefix: 'zh' }),
  Object.freeze({ locale: 'ru', htmlLang: 'ru', sourcePrefix: 'ru', targetPrefix: 'ru' }),
  Object.freeze({ locale: 'tr', htmlLang: 'tr', sourcePrefix: 'tr', targetPrefix: 'tr' }),
]);

const expectedProductVariants = (slug, fragment) => expectedLegacyLocales.map(({ locale, htmlLang, sourcePrefix, targetPrefix }) => ({
  locale,
  htmlLang,
  path: `/${sourcePrefix ? `${sourcePrefix}/` : ''}products/${slug}/`,
  target: `https://www.zxrubbertech.com/${targetPrefix ? `${targetPrefix}/` : ''}products/${fragment}`,
}));

const expectedLegacyRedirects = [
  ...['suspension-bushing', 'shock-absorber-dust-cover', 'ball-joint-dust-cover', 'wire-harness-sheath']
    .flatMap((slug) => expectedProductVariants(slug, '#c-automotive')),
  ...expectedProductVariants('rubber-wheel', '#c-industrial'),
];
const expectedFallbackCopy = Object.freeze({
  en: Object.freeze({ title: 'Page moved | ZHIXIN', lead: 'This page has moved to ', link: 'the ZHIXIN V5 website', tail: '.' }),
  de: Object.freeze({ title: 'Seite verschoben | ZHIXIN', lead: 'Diese Seite wurde verschoben. ', link: 'Zur ZHIXIN V5-Website', tail: '.' }),
  'zh-CN': Object.freeze({ title: '页面已迁移 | ZHIXIN', lead: '此页面已迁移。', link: '前往 ZHIXIN V5 网站', tail: '。' }),
  ru: Object.freeze({ title: 'Страница перемещена | ZHIXIN', lead: 'Эта страница была перемещена. ', link: 'Перейти на сайт ZHIXIN V5', tail: '.' }),
  tr: Object.freeze({ title: 'Sayfa taşındı | ZHIXIN', lead: 'Bu sayfa taşındı. ', link: 'ZHIXIN V5 sitesine git', tail: '.' }),
});

const fail = (message) => failures.push(message);
const filePath = (relativePath) => resolve(repositoryRoot, relativePath);
const read = (relativePath) => {
  const absolutePath = filePath(relativePath);
  if (!existsSync(absolutePath)) {
    fail(`missing file: ${relativePath}`);
    return null;
  }
  const info = lstatSync(absolutePath);
  if (info.isSymbolicLink() || !info.isFile() || !realpathSync(absolutePath).startsWith(`${repositoryRoot}${sep}`)) {
    fail(`not a real file inside root: ${relativePath}`);
    return null;
  }
  return readFileSync(absolutePath, 'utf8');
};
const count = (haystack, needle) => haystack.split(needle).length - 1;
const htmlEscape = (value) => value
  .replaceAll('&', '&amp;')
  .replaceAll('"', '&quot;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;');
const decodeXml = (value) => value
  .replaceAll('&amp;', '&')
  .replaceAll('&quot;', '"')
  .replaceAll('&lt;', '<')
  .replaceAll('&gt;', '>')
  .replaceAll('&apos;', "'");

const releaseReportContents = read('v5-release-report.json');
if (releaseReportContents !== null) {
  let releaseReport;
  try {
    releaseReport = JSON.parse(releaseReportContents);
  } catch {
    fail('V5 release report is malformed');
  }
  if (releaseReport) {
    const expectedPageRecords = registryLocales.flatMap((locale) => V5_PAGE_STEMS.map((stem) => {
      const route = getLocalizedRoute(locale, stem);
      return {
        locale,
        stem,
        route,
        file: route === '/' ? 'index.html' : `${route.slice(1)}index.html`,
      };
    }));
    if (releaseReport.status !== 'PASS'
        || releaseReport.locales !== registryLocales.length
        || JSON.stringify(releaseReport.localeIds) !== JSON.stringify(registryLocales)
        || releaseReport.publicPages !== expectedPageRecords.length
        || releaseReport.hreflangLinks !== expectedPageRecords.length * getHreflangCluster(V5_PAGE_STEMS[0]).length
        || releaseReport.sitemapUrls !== expectedPageRecords.length
        || !Array.isArray(releaseReport.pages)
        || releaseReport.pages.length !== expectedPageRecords.length) {
      fail(`retirement requires the complete ordered ${expectedPageRecords.length}-page V5 release report`);
    } else {
      for (const [index, expected] of expectedPageRecords.entries()) {
        const page = releaseReport.pages[index];
        if (page?.locale !== expected.locale || page?.stem !== expected.stem
            || page?.route !== expected.route || page?.file !== expected.file
            || !/^[a-f0-9]{64}$/.test(page?.sha256 ?? '')) {
          fail(`V5 release report page order mismatch at index ${index}`);
          continue;
        }
        const pageContents = read(expected.file);
        if (pageContents !== null && createHash('sha256').update(pageContents).digest('hex') !== page.sha256) {
          fail(`V5 release report page hash mismatch: ${expected.file}`);
        }
      }
    }
  }
}

if (JSON.stringify(V5_URLS) !== JSON.stringify(expectedV5Urls)) {
  fail(`V5 URL inventory must exactly match the ordered ${expectedCounts.v5Urls}-route registry`);
}
if (LEGACY_REDIRECTS.length !== expectedCounts.legacyPaths) fail(`expected 25 legacy paths, found ${LEGACY_REDIRECTS.length}`);
const actualByPath = new Map(LEGACY_REDIRECTS.map((entry) => [entry.path, entry]));
for (const expected of expectedLegacyRedirects) {
  const actual = actualByPath.get(expected.path);
  if (!actual) {
    fail(`missing approved legacy mapping: ${expected.path}`);
  } else {
    if (actual.target !== expected.target) {
      fail(`language-conservation mismatch: ${expected.path}; expected ${expected.target}; actual ${actual.target}`);
    }
    if (actual.locale !== expected.locale) {
      fail(`legacy locale mismatch: ${expected.path}; expected ${expected.locale}; actual ${String(actual.locale)}`);
    }
    if (actual.htmlLang !== expected.htmlLang) {
      fail(`legacy htmlLang mismatch: ${expected.path}; expected ${expected.htmlLang}; actual ${String(actual.htmlLang)}`);
    }
  }
}
for (const actual of LEGACY_REDIRECTS) {
  if (!expectedLegacyRedirects.some((expected) => expected.path === actual.path)) {
    fail(`unexpected legacy mapping: ${actual.path}`);
  }
}
if (CLOUDFLARE_HOSTS.length !== expectedCounts.hosts) fail(`expected 2 Cloudflare hosts, found ${CLOUDFLARE_HOSTS.length}`);
if (new Set(CLOUDFLARE_HOSTS).size !== expectedCounts.hosts
  || !CLOUDFLARE_HOSTS.includes('zxrubbertech.com')
  || !CLOUDFLARE_HOSTS.includes('www.zxrubbertech.com')) {
  fail('Cloudflare hosts must be apex and www only');
}

for (const { path, target } of LEGACY_REDIRECTS) {
  if (legacyPaths.has(path)) fail(`duplicate legacy path: ${path}`);
  legacyPaths.add(path);
  if (v5Paths.has(path)) fail(`legacy path overlaps a V5 route: ${path}`);
  if (!/^\/[a-z0-9/-]+\/$/.test(path)) fail(`malformed legacy path: ${path}`);

  let targetUrl;
  try {
    targetUrl = new URL(target);
  } catch {
    fail(`malformed target URL: ${target}`);
    continue;
  }
  if (targetUrl.protocol !== 'https:' || targetUrl.hostname !== 'www.zxrubbertech.com') {
    fail(`target must use production HTTPS www host: ${target}`);
  }
  if (!allowedTargets.has(target.split('#')[0])) fail(`target is outside approved V5 URLs: ${target}`);
  if (!allowedFragments.has(targetUrl.hash)) fail(`unapproved target fragment: ${target}`);
}

const forbiddenFallbackPatterns = [
  /<nav\b/i,
  /<img\b/i,
  /<video\b/i,
  /<form\b/i,
  /application\/ld\+json/i,
  /hreflang=/i,
  /xkoevwql|mrpzqado/i,
  /turnstile/i,
];

let fallbackPages = 0;
for (const { path, target } of LEGACY_REDIRECTS) {
  const relativePath = `${path.slice(1)}index.html`;
  const contents = read(relativePath);
  if (contents === null) continue;
  fallbackPages += 1;
  if (Buffer.byteLength(contents, 'utf8') >= 2000) fail(`fallback page is too large: ${relativePath}`);
  const expected = expectedLegacyRedirects.find((entry) => entry.path === path);
  const copy = expected && expectedFallbackCopy[expected.locale];
  if (!expected || !copy) {
    fail(`fallback has no approved locale fixture: ${relativePath}`);
    continue;
  }
  const escapedTarget = htmlEscape(target);
  const requiredTokens = [
    `<html lang="${htmlEscape(expected.htmlLang)}">`,
    '<meta name="robots" content="noindex,follow">',
    `<link rel="canonical" href="${escapedTarget}">`,
    `<meta http-equiv="refresh" content="0;url=${escapedTarget}">`,
    `<title>${htmlEscape(copy.title)}</title>`,
    `location.replace(${JSON.stringify(target)})`,
    `<main><p>${htmlEscape(copy.lead)}<a href="${escapedTarget}">${htmlEscape(copy.link)}</a>${htmlEscape(copy.tail)}</p></main>`,
  ];
  for (const token of requiredTokens) {
    if (count(contents, token) !== 1) fail(`fallback token count must be 1 in ${relativePath}: ${token}`);
  }
  for (const pattern of forbiddenFallbackPatterns) {
    if (pattern.test(contents)) fail(`legacy content marker remains in ${relativePath}: ${pattern}`);
  }
}

const csvRelativePath = 'cloudflare/zxrubbertech-v5-legacy-redirects.csv';
const csvContents = read(csvRelativePath);
let cloudflareEntries = 0;
if (csvContents !== null) {
  const csvSha256 = createHash('sha256').update(csvContents).digest('hex');
  if (csvSha256 !== acceptedCsvSha256) {
    fail(`Cloudflare CSV SHA-256 mismatch: expected ${acceptedCsvSha256}; actual ${csvSha256}`);
  }
  const rows = csvContents.split(/\r?\n/).filter(Boolean);
  cloudflareEntries = rows.length;
  if (rows.length !== expectedCounts.csvRows) fail(`expected 50 CSV rows, found ${rows.length}`);
  if (/source.?url/i.test(rows[0] ?? '')) fail('Cloudflare CSV must not contain a header row');

  const expectedRows = new Set(LEGACY_REDIRECTS.flatMap(({ path, target }) => CLOUDFLARE_HOSTS.map((host) => (
    `${host}${path},${target},301,true,false,false,false`
  ))));
  const actualRows = new Set();

  for (const row of rows) {
    if (actualRows.has(row)) fail(`duplicate Cloudflare CSV row: ${row}`);
    actualRows.add(row);
    const fields = row.split(',');
    if (fields.length !== 7) {
      fail(`Cloudflare CSV row must contain 7 fields: ${row}`);
      continue;
    }
    const [source, target, status, preserveQuery, includeSubdomains, subpathMatching, preservePathSuffix] = fields;
    if (/^https?:\/\//i.test(source) || /[?#]/.test(source)) fail(`Cloudflare source must omit scheme, query, and fragment: ${source}`);
    if (!CLOUDFLARE_HOSTS.some((host) => source.startsWith(`${host}/`))) fail(`unapproved Cloudflare source host: ${source}`);
    if (!LEGACY_REDIRECTS.some((item) => CLOUDFLARE_HOSTS.some((host) => source === `${host}${item.path}`) && item.target === target)) {
      fail(`unapproved Cloudflare mapping: ${source} -> ${target}`);
    }
    if (status !== '301') fail(`Cloudflare redirect must be 301: ${row}`);
    if (preserveQuery !== 'true') fail(`Cloudflare redirect must preserve query: ${row}`);
    if (includeSubdomains !== 'false') fail(`Cloudflare redirect must not include subdomains: ${row}`);
    if (subpathMatching !== 'false') fail(`Cloudflare redirect must not match subpaths: ${row}`);
    if (preservePathSuffix !== 'false') fail(`Cloudflare redirect must not preserve path suffix: ${row}`);
  }
  for (const expectedRow of expectedRows) {
    if (!actualRows.has(expectedRow)) fail(`missing Cloudflare CSV row: ${expectedRow}`);
  }
  for (const actualRow of actualRows) {
    if (!expectedRows.has(actualRow)) fail(`unexpected Cloudflare CSV row: ${actualRow}`);
  }
}

const sitemapContents = read('sitemap.xml');
let sitemapUrls = 0;
if (sitemapContents !== null) {
  const locations = [...sitemapContents.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => decodeXml(match[1]));
  sitemapUrls = locations.length;
  if (JSON.stringify(locations) !== JSON.stringify(V5_URLS)) {
    fail(`sitemap URLs must exactly equal the ${expectedCounts.v5Urls} V5 URLs: ${JSON.stringify(locations)}`);
  }
  if (/hreflang=/i.test(sitemapContents)) fail('sitemap must not contain legacy hreflang annotations');
  if (locations.some((location) => location.includes('#'))) fail('sitemap URLs must not contain fragments');
  if (new Set(locations).size !== locations.length) fail('sitemap URLs must be unique');
  for (const path of legacyPaths) {
    if (sitemapContents.includes(`https://www.zxrubbertech.com${path}`)) fail(`legacy URL remains in sitemap: ${path}`);
  }
}

const robotsContents = read('robots.txt');
if (robotsContents !== null && robotsContents !== exactRobots) fail('robots.txt must equal the exact approved V5 content');

const publicPages = Object.freeze(V5_URLS.map((canonical) => {
  const path = new URL(canonical).pathname;
  return [path === '/' ? 'index.html' : `${path.slice(1)}index.html`, canonical];
}));

for (const [relativePath, canonical] of publicPages) {
  const contents = read(relativePath);
  if (contents === null) continue;
  const canonicalTags = [...contents.matchAll(/<link\b[^>]*\brel=["']canonical["'][^>]*>/gi)].map((match) => match[0]);
  if (canonicalTags.length !== 1 || !canonicalTags[0].includes(`href="${canonical}"`)) {
    fail(`page canonical mismatch: ${relativePath}`);
  }
  const h1Count = (contents.match(/<h1\b/gi) ?? []).length;
  if (h1Count !== 1) fail(`page must contain exactly one H1: ${relativePath}`);
  const jsonLdCount = (contents.match(/application\/ld\+json/gi) ?? []).length;
  if (jsonLdCount !== 1) fail(`page must contain exactly one JSON-LD block: ${relativePath}`);
  if (/name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(contents)) fail(`V5 page must remain indexable: ${relativePath}`);
  const hrefs = [...contents.matchAll(/\bhref=["']([^"']+)["']/gi)].map((match) => match[1]);
  for (const href of hrefs) {
    let pathname = null;
    if (href.startsWith('/')) pathname = href.split(/[?#]/)[0];
    else if (/^https:\/\/www\.zxrubbertech\.com\//.test(href)) pathname = new URL(href).pathname;
    if (pathname && [...legacyPaths].some((legacyPath) => pathname === legacyPath || pathname.startsWith(legacyPath))) {
      fail(`V5 page links to legacy path in ${relativePath}: ${href}`);
    }
  }
}

const allowedHtmlFiles = new Set([
  ...publicPages.map(([relativePath]) => relativePath),
  ...LEGACY_REDIRECTS.map(({ path }) => `${path.slice(1)}index.html`),
]);
const discoveredHtmlFiles = [];
const discoveredFiles = [];
const walkHtml = (directory) => {
  for (const name of readdirSync(directory).sort()) {
    const absolute = join(directory, name);
    const info = lstatSync(absolute);
    if (info.isSymbolicLink()) {
      fail(`symbolic link is not allowed in retirement root: ${relative(repositoryRoot, absolute)}`);
      continue;
    }
    if (info.isDirectory()) walkHtml(absolute);
    else if (info.isFile()) {
      const relativePath = relative(repositoryRoot, absolute).split(sep).join('/');
      discoveredFiles.push(relativePath);
      if (name.endsWith('.html')) discoveredHtmlFiles.push(relativePath);
    } else fail(`unsupported file type in retirement root: ${relative(repositoryRoot, absolute)}`);
  }
};
walkHtml(repositoryRoot);
for (const relativePath of discoveredHtmlFiles) {
  if (!allowedHtmlFiles.has(relativePath)) fail(`unexpected HTML page in retirement bundle: ${relativePath}`);
}
for (const relativePath of allowedHtmlFiles) {
  if (!discoveredHtmlFiles.includes(relativePath)) fail(`missing approved HTML page in retirement bundle: ${relativePath}`);
}
if (discoveredHtmlFiles.length !== expectedCounts.v5Urls + expectedCounts.legacyPaths) {
  fail(`retirement bundle must contain exactly ${expectedCounts.v5Urls + expectedCounts.legacyPaths} HTML pages; found ${discoveredHtmlFiles.length}`);
}
if (discoveredFiles.length !== expectedCounts.releaseFiles) {
  fail(`retirement bundle must contain exactly ${expectedCounts.releaseFiles} files; found ${discoveredFiles.length}`);
}

const quoteContents = read('quote/index.html');
if (quoteContents !== null) {
  for (const invariant of [
    'mrpzqado',
    '0x4AAAAAAENHOMMn_zK0WuNN',
    'www.zxrubbertech.com',
    'mailto:martin@zxrubbertech.com',
    'https://wa.me/8615256225135',
  ]) {
    if (!quoteContents.includes(invariant)) fail(`Quote invariant missing: ${invariant}`);
  }
}

const result = {
  status: failures.length ? 'FAIL' : 'PASS',
  profile: 'v5-only-production',
  failures,
  metrics: {
    v5Urls: V5_URLS.length,
    legacyPaths: LEGACY_REDIRECTS.length,
    fallbackPages,
    cloudflareEntries,
    sitemapUrls,
  },
};

(failures.length ? process.stderr : process.stdout).write(`${JSON.stringify(result, null, 2)}\n`);
if (failures.length) process.exit(1);
