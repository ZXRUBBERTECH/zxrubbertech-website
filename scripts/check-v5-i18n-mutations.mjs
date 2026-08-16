import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { V5_LOCALES, V5_PAGE_STEMS, getLocalizedRoute } from './v5-i18n-config.mjs';
import { CLOUDFLARE_HOSTS, LEGACY_REDIRECTS, V5_URLS } from './v5-retirement-map.mjs';
import {
  packageName as archivePackageName,
  rollbackRevision as archiveRollbackRevision,
  validateAcceptanceData,
  validateArchiveIdentity,
  validateReleaseBundle,
  validateReleaseReportData,
} from './archive-v5.mjs';

const scriptsRoot = dirname(fileURLToPath(import.meta.url));
const repo = resolve(scriptsRoot, '..');
const supportedSuites = new Set(['registry', 'catalog', 'release', 'retirement', 'archive', 'all']);
const previewFiles = V5_PAGE_STEMS.map((stem) => `${stem}-v5.html`);
const registryDependencies = [
  'check-v5-i18n.mjs',
  'v5-i18n-config.mjs',
  'v5-seo-config.mjs',
  'v5-route-map.json',
];
const catalogDependencies = [
  ...registryDependencies,
  'v5-i18n-operations.mjs',
  'v5-i18n-transform.mjs',
  'v5-language-controls.mjs',
  'v5-i18n-baseline.json',
];
const catalogLocales = Object.keys(V5_LOCALES);
const mutationValuePath = ['pages', 'demo-a', 'html_text', 'engineered-rubber-compounds-and-components'];

class CliError extends Error {}

function parseArgs(argv) {
  const options = {};
  for (const argument of argv) {
    const match = argument.match(/^--([a-z-]+)=(.+)$/);
    if (!match) throw new CliError(`Malformed argument: ${argument}`);
    const [, key, value] = match;
    if (!['suite', 'report', 'root'].includes(key)) throw new CliError(`Unknown argument: --${key}`);
    if (Object.hasOwn(options, key)) throw new CliError(`Duplicate argument: --${key}`);
    options[key] = value;
  }
  if (!options.suite) throw new CliError('Missing required argument: --suite');
  if (!supportedSuites.has(options.suite)) throw new CliError(`Unknown mutation suite: ${options.suite}`);
  if (!options.report) throw new CliError('Missing required argument: --report');
  const report = resolve(options.report);
  const rel = relative(repo, report);
  if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) {
    throw new CliError('Mutation report must be outside the repository');
  }
  let emptyOwnedReport = false;
  if (existsSync(report)) {
    const info = lstatSync(report);
    if (info.isSymbolicLink() || !info.isFile() || info.size !== 0) {
      throw new CliError(`Refusing to overwrite mutation report: ${report}`);
    }
    emptyOwnedReport = true;
  }
  const root = options.root ? realpathSync(resolve(options.root)) : null;
  return { suite: options.suite, report, root, emptyOwnedReport };
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function fixtureSha256(root) {
  const hash = createHash('sha256');
  const visit = (directory) => {
    for (const name of readdirSync(directory).sort()) {
      const file = join(directory, name);
      const info = lstatSync(file);
      if (info.isSymbolicLink()) {
        hash.update(relative(root, file).split('\\').join('/'));
        hash.update('\0SYMLINK\0');
        continue;
      }
      if (info.isDirectory()) {
        visit(file);
        continue;
      }
      if (!info.isFile()) throw new Error(`Unsupported mutation fixture entry: ${file}`);
      hash.update(relative(root, file).split('\\').join('/'));
      hash.update('\0');
      hash.update(readFileSync(file));
      hash.update('\0');
    }
  };
  visit(root);
  return hash.digest('hex');
}

function copyTreeSafe(source, destination) {
  const info = lstatSync(source);
  if (info.isSymbolicLink()) throw new Error(`Mutation fixture source contains a symbolic link: ${source}`);
  if (info.isDirectory()) {
    mkdirSync(destination, { recursive: false });
    for (const name of readdirSync(source).sort()) {
      copyTreeSafe(join(source, name), join(destination, name));
    }
    return;
  }
  if (!info.isFile()) throw new Error(`Mutation fixture source contains an unsupported entry: ${source}`);
  copyFileSync(source, destination);
}

function replaceOnce(source, pattern, replacement, label) {
  const matches = source.match(pattern);
  if (!matches || matches.length !== 1) {
    throw new Error(`${label}: expected exactly one mutation target; found ${matches?.length ?? 0}`);
  }
  return source.replace(pattern, replacement);
}

function replaceFirstExact(source, from, to, label) {
  const index = source.indexOf(from);
  if (index === -1) throw new Error(`${label}: mutation target is missing`);
  return `${source.slice(0, index)}${to}${source.slice(index + from.length)}`;
}

function mutateMarkedGroup(source, name, mutation) {
  const start = `<!-- V5:LANGUAGE ${name} START -->`;
  const end = `<!-- V5:LANGUAGE ${name} END -->`;
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  if (startIndex === -1 || endIndex === -1 || source.indexOf(start, startIndex + 1) !== -1) {
    throw new Error(`${name}: expected one language-control group`);
  }
  const contentStart = startIndex + start.length;
  const group = source.slice(contentStart, endIndex);
  return `${source.slice(0, contentStart)}${mutation(group)}${source.slice(endIndex)}`;
}

function prepareRegistryFixture() {
  const parent = mkdtempSync(join(tmpdir(), 'zxrubbertech-v5-registry-mutation.'));
  const fixtureRepo = join(parent, 'zxrubbertech-website');
  const fixtureScripts = join(fixtureRepo, 'scripts');
  const fixturePreview = join(fixtureRepo, 'design-demos');
  mkdirSync(fixtureScripts, { recursive: true });
  mkdirSync(fixturePreview, { recursive: true });
  for (const file of registryDependencies) {
    copyFileSync(join(scriptsRoot, file), join(fixtureScripts, file));
  }
  for (const file of previewFiles) {
    copyFileSync(join(repo, 'design-demos', file), join(fixturePreview, file));
  }
  return { parent, fixtureRepo, fixtureScripts, fixturePreview };
}

function parseCheckerReport(result) {
  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function valueAtPath(object, path) {
  return path.reduce((value, key) => value?.[key], object);
}

function setValueAtPath(object, path, value) {
  const parent = path.slice(0, -1).reduce((current, key) => current[key], object);
  const key = path.at(-1);
  if (typeof parent?.[key] !== 'string') throw new Error(`Missing catalog mutation key: ${path.join('.')}`);
  parent[key] = value;
}

function mapCatalogStrings(value, mapper, path = []) {
  if (typeof value === 'string') return mapper(value, path);
  if (Array.isArray(value) || !value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [
    key,
    mapCatalogStrings(child, mapper, [...path, key]),
  ]));
}

function replaceFirstCatalogLiteral(value, from, to) {
  let replaced = false;
  const next = mapCatalogStrings(value, (text) => {
    if (replaced || !text.includes(from)) return text;
    replaced = true;
    return text.replace(from, to);
  });
  if (!replaced) throw new Error(`Catalog mutation literal is unused: ${from}`);
  return next;
}

function runRegistryChecker(fixture, extraArgs = []) {
  return spawnSync(process.execPath, [
    realpathSync(join(fixture.fixtureScripts, 'check-v5-i18n.mjs')),
    '--gate=registry',
    '--profile=preview',
    `--root=${fixture.fixturePreview}`,
    ...extraArgs,
  ], {
    cwd: fixture.fixtureRepo,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
}

function runRegistryCase(testCase) {
  const fixture = prepareRegistryFixture();
  try {
    const greenResult = runRegistryChecker(fixture);
    const greenReport = parseCheckerReport(greenResult);
    const expectedGreenMetrics = { locales: 8, pageRoles: 7, routes: 56, hreflangsPerPage: 9 };
    const greenMetrics = greenReport?.registry ?? null;
    const greenPassed = greenResult.status === 0
      && greenReport?.status === 'PASS'
      && JSON.stringify(greenMetrics) === JSON.stringify(expectedGreenMetrics);

    const configFile = join(fixture.fixtureScripts, 'v5-i18n-config.mjs');
    if (testCase.mutateConfig) {
      const source = readFileSync(configFile, 'utf8');
      writeFileSync(configFile, testCase.mutateConfig(source), 'utf8');
    }
    if (testCase.emptyInventory) {
      for (const file of previewFiles) rmSync(join(fixture.fixturePreview, file));
    }
    const result = runRegistryChecker(fixture, testCase.extraArgs ?? []);
    const checkerReport = parseCheckerReport(result);
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    const signalFound = output.includes(testCase.expectedSignal);
    const exitMatches = result.status === testCase.expectedExit;
    const missingFileNoise = (output.match(/missing (?:file|page)|file does not exist/gi) ?? []).length;
    return {
      case: testCase.name,
      fixtureSha256: fixtureSha256(fixture.fixtureRepo),
      greenExitCode: greenResult.status,
      greenMetrics,
      expectedGreenMetrics,
      unaffectedMetricsMatch: greenPassed,
      exitCode: result.status,
      expectedExitCode: testCase.expectedExit,
      expectedSignal: testCase.expectedSignal,
      actualSignalFound: signalFound,
      mutationMetrics: checkerReport?.registry ?? null,
      missingFileNoise,
      status: greenPassed && exitMatches && signalFound && missingFileNoise === 0 ? 'PASS' : 'FAIL',
      greenStdoutSha256: sha256(greenResult.stdout ?? ''),
      greenStderrSha256: sha256(greenResult.stderr ?? ''),
      stdoutSha256: sha256(result.stdout ?? ''),
      stderrSha256: sha256(result.stderr ?? ''),
      output: output.trim(),
    };
  } finally {
    rmSync(fixture.parent, { recursive: true, force: true });
  }
}

function registryCases() {
  return [
    {
      name: 'unknown-locale',
      expectedExit: 2,
      expectedSignal: 'Unknown locale: xx',
      extraArgs: ['--locale=xx'],
    },
    {
      name: 'duplicate-prefix',
      expectedExit: 1,
      expectedSignal: 'Duplicate locale prefix: de',
      mutateConfig: (source) => replaceOnce(
        source,
        /ja: Object\.freeze\(\{\n\s+prefix: 'ja'/g,
        "ja: Object.freeze({\n    prefix: 'de'",
        'duplicate-prefix',
      ),
    },
    {
      name: 'persian-direction-ltr',
      expectedExit: 1,
      expectedSignal: 'Locale definition does not match the approved registry: fa',
      mutateConfig: (source) => replaceOnce(
        source,
        /fa: Object\.freeze\(\{([\s\S]*?)direction: 'rtl'/g,
        "fa: Object.freeze({$1direction: 'ltr'",
        'persian-direction-ltr',
      ),
    },
    {
      name: 'japanese-og-locale',
      expectedExit: 1,
      expectedSignal: 'Locale definition does not match the approved registry: ja',
      mutateConfig: (source) => replaceOnce(source, /ogLocale: 'ja_JP'/g, "ogLocale: 'ja_US'", 'japanese-og-locale'),
    },
    {
      name: 'x-default-not-english',
      expectedExit: 1,
      expectedSignal: 'x-default for demo-a must equal the English equivalent',
      mutateConfig: (source) => replaceOnce(source, /const english = localeEntries\[0\];/g, 'const english = localeEntries[1];', 'x-default-not-english'),
    },
    {
      name: 'empty-preview-inventory',
      expectedExit: 2,
      expectedSignal: 'Empty preview page inventory',
      emptyInventory: true,
    },
    {
      name: 'malformed-registry-module',
      expectedExit: 1,
      expectedSignal: 'V5 locale registry is missing or invalid',
      mutateConfig: () => 'export {\n',
    },
  ];
}

function prepareCatalogFixture() {
  const parent = mkdtempSync(join(tmpdir(), 'zxrubbertech-v5-catalog-mutation.'));
  const fixtureRepo = join(parent, 'zxrubbertech-website');
  const fixtureScripts = join(fixtureRepo, 'scripts');
  const fixtureCatalogs = join(fixtureScripts, 'v5-i18n');
  const fixturePreview = join(fixtureRepo, 'design-demos');
  mkdirSync(fixtureCatalogs, { recursive: true });
  mkdirSync(fixturePreview, { recursive: true });
  for (const file of catalogDependencies) copyFileSync(join(scriptsRoot, file), join(fixtureScripts, file));
  for (const locale of catalogLocales) {
    copyFileSync(join(scriptsRoot, 'v5-i18n', `${locale}.json`), join(fixtureCatalogs, `${locale}.json`));
  }
  copyFileSync(join(scriptsRoot, 'v5-i18n', 'glossary.json'), join(fixtureCatalogs, 'glossary.json'));
  for (const file of previewFiles) copyFileSync(join(repo, 'design-demos', file), join(fixturePreview, file));
  return { parent, fixtureRepo, fixtureScripts, fixtureCatalogs, fixturePreview };
}

function runCatalogChecker(fixture, locale) {
  return spawnSync(process.execPath, [
    realpathSync(join(fixture.fixtureScripts, 'check-v5-i18n.mjs')),
    '--gate=catalog',
    '--profile=preview',
    `--root=${fixture.fixtureRepo}`,
    `--locale=${locale}`,
  ], {
    cwd: fixture.fixtureRepo,
    encoding: 'utf8',
    maxBuffer: 30 * 1024 * 1024,
  });
}

function mutateCatalogJson(fixture, locale, mutation) {
  const file = join(fixture.fixtureCatalogs, `${locale}.json`);
  const catalog = readJson(file);
  mutation(catalog, fixture);
  writeJson(file, catalog);
}

function catalogCaseDefinitions() {
  return [
    {
      name: 'japanese-without-kana', locale: 'ja', expectedSignal: 'ja: catalog must contain Japanese kana',
      mutate: (catalog) => Object.assign(catalog, mapCatalogStrings(catalog, (value, path) => {
        if (path[0] === 'meta') return value;
        const stripped = value.replace(/[\u3041-\u3096\u30A1-\u30FA]/gu, '').trim();
        return stripped || '123';
      })),
    },
    {
      name: 'japanese-half-width-katakana', locale: 'ja', expectedSignal: 'ja: half-width Katakana is not allowed',
      mutate: (catalog) => setValueAtPath(catalog, mutationValuePath, `${valueAtPath(catalog, mutationValuePath)} ｶﾀｶﾅ`),
    },
    {
      name: 'japanese-non-nfc', locale: 'ja', expectedSignal: 'ja: catalog value must use NFC normalization',
      mutate: (catalog) => setValueAtPath(catalog, mutationValuePath, `${valueAtPath(catalog, mutationValuePath)} カ\u3099`),
    },
    {
      name: 'japanese-invalid-utf8', locale: 'ja', expectedSignal: 'ja: catalog must be valid UTF-8', allowsEarlyFailure: true,
      mutateRaw: (file) => writeFileSync(file, Buffer.from([0xff, 0xfe, 0xfd])),
    },
    {
      name: 'korean-without-hangul', locale: 'ko', expectedSignal: 'ko: catalog must contain Hangul',
      mutate: (catalog) => Object.assign(catalog, mapCatalogStrings(catalog, (value, path) => {
        if (path[0] === 'meta') return value;
        const stripped = value.replace(/[\u1100-\u11FF\uA960-\uA97F\uAC00-\uD7A3\uD7B0-\uD7FF]/gu, '').trim();
        return stripped || '123';
      })),
    },
    {
      name: 'korean-decomposed-jamo', locale: 'ko', expectedSignal: 'ko: decomposed Hangul Jamo is not allowed',
      mutate: (catalog) => setValueAtPath(catalog, mutationValuePath, `${valueAtPath(catalog, mutationValuePath)} 가`),
    },
    {
      name: 'persian-without-arabic-script', locale: 'fa', expectedSignal: 'fa: localized prose must contain Arabic-script Persian text',
      mutate: (catalog) => Object.assign(catalog, mapCatalogStrings(catalog, (value, path) => {
        if (path[0] === 'meta') return value;
        const stripped = value.replace(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/gu, '').trim();
        return stripped || '123';
      })),
    },
    {
      name: 'persian-arabic-yeh-kaf', locale: 'fa', expectedSignal: 'fa: Arabic ي/ك variants are not allowed',
      mutate: (catalog) => setValueAtPath(catalog, mutationValuePath, `${valueAtPath(catalog, mutationValuePath)} يك`),
    },
    {
      name: 'persian-hidden-bidi-control', locale: 'fa', expectedSignal: 'fa: hidden bidi controls are not allowed',
      mutate: (catalog) => setValueAtPath(catalog, mutationValuePath, `${valueAtPath(catalog, mutationValuePath)}\u202E`),
    },
    {
      name: 'persian-presentation-form', locale: 'fa', expectedSignal: 'fa: Arabic presentation forms are not allowed',
      mutate: (catalog) => setValueAtPath(catalog, mutationValuePath, `${valueAtPath(catalog, mutationValuePath)}\uFB8E`),
    },
    {
      name: 'persian-isolated-zwj', locale: 'fa', expectedSignal: 'fa: isolated ZWJ is not allowed',
      mutate: (catalog) => setValueAtPath(catalog, mutationValuePath, `${valueAtPath(catalog, mutationValuePath)}\u200D`),
    },
    {
      name: 'persian-utf8-bom', locale: 'fa', expectedSignal: 'fa: catalog must not contain a UTF-8 BOM', allowsEarlyFailure: true,
      mutateRaw: (file) => writeFileSync(file, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), readFileSync(file)])),
    },
    {
      name: 'modified-protected-literal', locale: 'fa', expectedSignal: 'fa V5 catalog changed preserved value: shared.html_text.martin-zxrubbertech-com',
      mutate: (catalog) => Object.assign(catalog, replaceFirstCatalogLiteral(
        catalog,
        'martin@zxrubbertech.com',
        'martin@example.com',
      )),
    },
    {
      name: 'modified-verified-fact', locale: 'ja', expectedSignal: 'ja: verified fact annualCompoundCapacity',
      mutate: (catalog, fixture) => {
        const glossary = readJson(join(fixture.fixtureCatalogs, 'glossary.json'));
        const rendering = glossary.verifiedFactRenderings.ja.annualCompoundCapacity;
        const changed = rendering.replace('3', '4');
        if (changed === rendering) throw new Error('Japanese fact mutation requires the approved 3,000 rendering');
        Object.assign(catalog, replaceFirstCatalogLiteral(catalog, rendering, changed));
      },
    },
    {
      name: 'missing-glossary-term', locale: 'ja', expectedSignal: 'V5 i18n glossary is missing ja term: tooling',
      mutateFixture: (fixture) => {
        const file = join(fixture.fixtureCatalogs, 'glossary.json');
        const glossary = readJson(file);
        delete glossary.terms.tooling.ja;
        writeJson(file, glossary);
      },
    },
  ];
}

function runCatalogCase(testCase) {
  const fixture = prepareCatalogFixture();
  try {
    const greenResult = runCatalogChecker(fixture, testCase.locale);
    const greenReport = parseCheckerReport(greenResult);
    const greenMetrics = {
      registry: greenReport?.registry ?? null,
      catalogKeys: greenReport?.catalog?.catalogKeys ?? null,
      operations: greenReport?.catalog?.operations ?? null,
    };
    const greenPassed = greenResult.status === 0
      && greenReport?.status === 'PASS'
      && JSON.stringify(greenMetrics.registry) === JSON.stringify({ locales: 8, pageRoles: 7, routes: 56, hreflangsPerPage: 9 })
      && greenMetrics.catalogKeys === 531
      && greenMetrics.operations === 508;

    const catalogFile = join(fixture.fixtureCatalogs, `${testCase.locale}.json`);
    if (testCase.mutate) mutateCatalogJson(fixture, testCase.locale, testCase.mutate);
    if (testCase.mutateRaw) testCase.mutateRaw(catalogFile);
    if (testCase.mutateFixture) testCase.mutateFixture(fixture);
    const result = runCatalogChecker(fixture, testCase.locale);
    const checkerReport = parseCheckerReport(result);
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    const mutationMetrics = {
      registry: checkerReport?.registry ?? null,
      catalogKeys: checkerReport?.catalog?.catalogKeys ?? null,
      operations: checkerReport?.catalog?.operations ?? null,
    };
    const unaffectedMetricsMatch = checkerReport === null
      ? testCase.allowsEarlyFailure === true
      : JSON.stringify(mutationMetrics.registry) === JSON.stringify(greenMetrics.registry)
        && (mutationMetrics.catalogKeys === null || mutationMetrics.catalogKeys === 531)
        && (mutationMetrics.operations === null || mutationMetrics.operations === 508);
    const missingFileNoise = (output.match(/missing (?:file|page)|file does not exist/gi) ?? []).length;
    const signalFound = output.includes(testCase.expectedSignal);
    return {
      case: testCase.name,
      locale: testCase.locale,
      fixtureSha256: fixtureSha256(fixture.fixtureRepo),
      greenExitCode: greenResult.status,
      greenMetrics,
      exitCode: result.status,
      expectedExitCode: 1,
      expectedSignal: testCase.expectedSignal,
      actualSignalFound: signalFound,
      mutationMetrics,
      unaffectedMetricsMatch,
      missingFileNoise,
      status: greenPassed && result.status === 1 && signalFound && unaffectedMetricsMatch && missingFileNoise === 0 ? 'PASS' : 'FAIL',
      greenStdoutSha256: sha256(greenResult.stdout ?? ''),
      greenStderrSha256: sha256(greenResult.stderr ?? ''),
      stdoutSha256: sha256(result.stdout ?? ''),
      stderrSha256: sha256(result.stderr ?? ''),
      output: output.trim(),
    };
  } finally {
    rmSync(fixture.parent, { recursive: true, force: true });
  }
}

function releaseInventoryMetrics(root) {
  const expected = Object.keys(V5_LOCALES).flatMap((locale) => V5_PAGE_STEMS.map((stem) => ({
    locale,
    stem,
    file: join(root, getLocalizedRoute(locale, stem).slice(1), 'index.html'),
  })));
  const missing = expected.filter(({ file }) => !existsSync(file) || !lstatSync(file).isFile());
  return {
    locales: Object.keys(V5_LOCALES).length,
    pageRoles: V5_PAGE_STEMS.length,
    canonicalPages: expected.length - missing.length,
    expectedCanonicalPages: expected.length,
    missingFiles: missing.map(({ locale, stem }) => `${locale}/${stem}`),
  };
}

function prepareReleaseFixture(root) {
  const parent = mkdtempSync(join(tmpdir(), 'zxrubbertech-v5-release-mutation.'));
  const fixtureRoot = join(parent, 'release');
  copyTreeSafe(root, fixtureRoot);
  return { parent, fixtureRoot };
}

function releasePage(root, locale, stem) {
  return join(root, getLocalizedRoute(locale, stem).slice(1), 'index.html');
}

function mutateReleasePage(fixture, locale, stem, mutation) {
  const file = releasePage(fixture.fixtureRoot, locale, stem);
  const source = readFileSync(file, 'utf8');
  const mutated = mutation(source);
  writeFileSync(file, mutated, 'utf8');
  const reportFile = join(fixture.fixtureRoot, 'v5-release-report.json');
  const report = readJson(reportFile);
  const reportPages = (report.pages ?? []).filter((page) => page.locale === locale && page.stem === stem);
  if (reportPages.length !== 1) throw new Error(`${locale}/${stem}: expected one release report page to synchronize`);
  reportPages[0].sha256 = sha256(mutated);
  writeJson(reportFile, report);
}

function runReleaseChecker(fixture, checker) {
  let file;
  let args;
  if (checker === 'seo') {
    file = join(scriptsRoot, 'check-v5-seo.mjs');
    args = ['--gate=all', '--profile=release', `--root=${fixture.fixtureRoot}`];
  } else if (checker === 'controls') {
    file = join(scriptsRoot, 'check-v5-i18n.mjs');
    args = ['--gate=controls', '--profile=release', `--root=${fixture.fixtureRoot}`, '--locale=fa'];
  } else if (checker === 'form') {
    file = join(scriptsRoot, 'check-v5-i18n.mjs');
    args = ['--gate=form', '--profile=release', `--root=${fixture.fixtureRoot}`];
  } else {
    throw new Error(`Unknown release mutation checker: ${checker}`);
  }
  return spawnSync(process.execPath, [realpathSync(file), ...args], {
    cwd: repo,
    encoding: 'utf8',
    maxBuffer: 30 * 1024 * 1024,
  });
}

function releaseGreenPassed(testCase, result, report) {
  if (result.status !== 0 || report?.status !== 'PASS') return false;
  if (testCase.checker === 'seo') {
    return report.metrics?.locales === 8
      && report.metrics?.publicPages === 56
      && report.metrics?.hreflangLinks === 504
      && report.metrics?.sitemapUrls === 56;
  }
  if (testCase.checker === 'controls') {
    return report.controls?.pages === 7
      && report.controls?.anchorsPerGroup === 8
      && report.controls?.anchorsPerPage === 24
      && report.controls?.totalAnchors === 168;
  }
  return report.form?.quotePages === 8
    && report.form?.formspreeTargets === 8
    && report.form?.turnstileWidgets === 8
    && report.form?.localeFields === 8
    && report.form?.runtimeMessages === 112
    && report.form?.realSubmissions === 0;
}

function releaseCaseDefinitions() {
  const desktopFaAnchor = /<a\b(?=[^>]*\bdata-locale="fa")[^>]*>[\s\S]*?<\/a>/g;
  const desktopKoAnchor = /<a\b(?=[^>]*\bdata-locale="ko")[^>]*>[\s\S]*?<\/a>/g;
  return [
    {
      name: 'missing-language-anchor', checker: 'controls',
      expectedSignal: 'desktop language control must contain 8 real anchors; found 7',
      mutate: (fixture) => mutateReleasePage(fixture, 'fa', 'demo-a', (source) => mutateMarkedGroup(
        source,
        'DESKTOP',
        (group) => replaceOnce(group, desktopKoAnchor, '', 'missing-language-anchor'),
      )),
    },
    {
      name: 'duplicate-language-anchor', checker: 'controls',
      expectedSignal: 'desktop language control must contain 8 real anchors; found 9',
      mutate: (fixture) => mutateReleasePage(fixture, 'fa', 'demo-a', (source) => mutateMarkedGroup(
        source,
        'DESKTOP',
        (group) => replaceOnce(group, desktopKoAnchor, (anchor) => `${anchor}\n${anchor}`, 'duplicate-language-anchor'),
      )),
    },
    {
      name: 'wrong-aria-current', checker: 'controls',
      expectedSignal: 'desktop fa aria-current state is incorrect',
      mutate: (fixture) => mutateReleasePage(fixture, 'fa', 'demo-a', (source) => mutateMarkedGroup(
        source,
        'DESKTOP',
        (group) => replaceOnce(
          group,
          desktopFaAnchor,
          (anchor) => anchor.replace(' aria-current="page"', ''),
          'wrong-aria-current',
        ),
      )),
    },
    {
      name: 'cross-language-canonical', checker: 'seo',
      expectedSignal: 'fa/demo-a: canonical must equal https://www.zxrubbertech.com/fa/',
      mutate: (fixture) => mutateReleasePage(fixture, 'fa', 'demo-a', (source) => replaceFirstExact(
        source,
        '<link rel="canonical" href="https://www.zxrubbertech.com/fa/">',
        '<link rel="canonical" href="https://www.zxrubbertech.com/ja/">',
        'cross-language-canonical',
      )),
    },
    {
      name: 'missing-hreflang', checker: 'seo',
      expectedSignal: 'fa/demo-a: reciprocal hreflang cluster mismatch',
      mutate: (fixture) => mutateReleasePage(fixture, 'fa', 'demo-a', (source) => replaceFirstExact(
        source,
        '<link rel="alternate" hreflang="ja" href="https://www.zxrubbertech.com/ja/">\n',
        '',
        'missing-hreflang',
      )),
    },
    {
      name: 'extra-hreflang', checker: 'seo',
      expectedSignal: 'fa/demo-a: reciprocal hreflang cluster mismatch',
      mutate: (fixture) => mutateReleasePage(fixture, 'fa', 'demo-a', (source) => replaceFirstExact(
        source,
        '<link rel="alternate" hreflang="x-default" href="https://www.zxrubbertech.com/">',
        '<link rel="alternate" hreflang="x-default" href="https://www.zxrubbertech.com/">\n<link rel="alternate" hreflang="xx" href="https://www.zxrubbertech.com/fa/">',
        'extra-hreflang',
      )),
    },
    {
      name: 'wrong-persian-dir', checker: 'seo',
      expectedSignal: 'fa/demo-a: html dir must be rtl',
      mutate: (fixture) => mutateReleasePage(fixture, 'fa', 'demo-a', (source) => replaceFirstExact(
        source,
        '<html lang="fa" dir="rtl">',
        '<html lang="fa" dir="ltr">',
        'wrong-persian-dir',
      )),
    },
    {
      name: 'wrong-turnstile-language', checker: 'form',
      expectedSignal: 'fa/quote: Turnstile data-language must equal fa',
      mutate: (fixture) => mutateReleasePage(fixture, 'fa', 'quote', (source) => replaceFirstExact(
        source,
        ' data-language="fa"',
        ' data-language="en"',
        'wrong-turnstile-language',
      )),
    },
    {
      name: 'wrong-hidden-locale', checker: 'form',
      expectedSignal: 'fa/quote: hidden language field must equal locale ID fa',
      mutate: (fixture) => mutateReleasePage(fixture, 'fa', 'quote', (source) => replaceFirstExact(
        source,
        '<input type="hidden" name="language" value="fa">',
        '<input type="hidden" name="language" value="en">',
        'wrong-hidden-locale',
      )),
    },
    {
      name: 'changed-formspree-id', checker: 'form',
      expectedSignal: 'fa/quote: Formspree target must contain mrpzqado exactly once',
      mutate: (fixture) => mutateReleasePage(fixture, 'fa', 'quote', (source) => replaceFirstExact(
        source,
        'https://formspree.io/f/mrpzqado',
        'https://formspree.io/f/changedid',
        'changed-formspree-id',
      )),
    },
    {
      name: 'changed-turnstile-site-key', checker: 'form',
      expectedSignal: 'fa/quote: Turnstile Site Key must equal the approved key exactly once',
      mutate: (fixture) => mutateReleasePage(fixture, 'fa', 'quote', (source) => replaceFirstExact(
        source,
        '0x4AAAAAAENHOMMn_zK0WuNN',
        '0x4AAAAAAENHOMMn_zK0WuNX',
        'changed-turnstile-site-key',
      )),
    },
    {
      name: 'changed-backend-field', checker: 'form',
      expectedSignal: 'fa/quote: stable backend fields must equal name, company, email, phone, message plus hidden language',
      mutate: (fixture) => mutateReleasePage(fixture, 'fa', 'quote', (source) => replaceFirstExact(
        source,
        'name="company"',
        'name="organisation"',
        'changed-backend-field',
      )),
    },
    {
      name: 'english-internal-link-leakage', checker: 'seo',
      expectedSignal: 'fa/products: internal href leaves active locale routes: /quote/',
      mutate: (fixture) => mutateReleasePage(fixture, 'fa', 'products', (source) => replaceFirstExact(
        source,
        'href="/fa/quote/"',
        'href="/quote/"',
        'english-internal-link-leakage',
      )),
    },
    {
      name: 'extra-dom-structure', checker: 'seo',
      expectedSignal: 'fa/demo-a: localized body structure/media differs from English demo-a',
      mutate: (fixture) => mutateReleasePage(fixture, 'fa', 'demo-a', (source) => replaceFirstExact(
        source,
        '<body>',
        '<body><span data-n5-extra="true"></span>',
        'extra-dom-structure',
      )),
    },
  ];
}

function runReleaseCase(root, testCase) {
  const fixture = prepareReleaseFixture(root);
  try {
    const greenInventory = releaseInventoryMetrics(fixture.fixtureRoot);
    const greenResult = runReleaseChecker(fixture, testCase.checker);
    const greenReport = parseCheckerReport(greenResult);
    const greenPassed = greenInventory.canonicalPages === 56
      && greenInventory.missingFiles.length === 0
      && releaseGreenPassed(testCase, greenResult, greenReport);

    testCase.mutate(fixture);
    const mutationInventory = releaseInventoryMetrics(fixture.fixtureRoot);
    const result = runReleaseChecker(fixture, testCase.checker);
    const checkerReport = parseCheckerReport(result);
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    const missingFileNoise = (output.match(/missing (?:file|page)|file does not exist/gi) ?? []).length;
    const actualSignalFound = output.includes(testCase.expectedSignal);
    const unaffectedMetricsMatch = mutationInventory.canonicalPages === 56
      && mutationInventory.missingFiles.length === 0;
    return {
      case: testCase.name,
      checker: testCase.checker,
      fixtureSha256: fixtureSha256(fixture.fixtureRoot),
      greenExitCode: greenResult.status,
      greenInventory,
      greenMetrics: greenReport?.metrics ?? greenReport?.controls ?? greenReport?.form ?? null,
      exitCode: result.status,
      expectedExitCode: 1,
      expectedSignal: testCase.expectedSignal,
      actualSignalFound,
      mutationInventory,
      mutationMetrics: checkerReport?.metrics ?? checkerReport?.controls ?? checkerReport?.form ?? null,
      unaffectedMetricsMatch,
      missingFileNoise,
      status: greenPassed && result.status === 1 && actualSignalFound && unaffectedMetricsMatch && missingFileNoise === 0
        ? 'PASS'
        : 'FAIL',
      greenStdoutSha256: sha256(greenResult.stdout ?? ''),
      greenStderrSha256: sha256(greenResult.stderr ?? ''),
      stdoutSha256: sha256(result.stdout ?? ''),
      stderrSha256: sha256(result.stderr ?? ''),
      output: output.trim(),
    };
  } finally {
    rmSync(fixture.parent, { recursive: true, force: true });
  }
}

function writeRetirementMap(file, redirects = LEGACY_REDIRECTS) {
  writeFileSync(file, [
    `export const V5_URLS = Object.freeze(${JSON.stringify(V5_URLS)});`,
    `export const CLOUDFLARE_HOSTS = Object.freeze(${JSON.stringify(CLOUDFLARE_HOSTS)});`,
    `export const LEGACY_REDIRECTS = Object.freeze(${JSON.stringify(redirects)}.map((entry) => Object.freeze(entry)));`,
    '',
  ].join('\n'), 'utf8');
}

function prepareRetirementFixture(root) {
  const parent = mkdtempSync(join(tmpdir(), 'zxrubbertech-v5-retirement-mutation.'));
  const fixtureRepo = join(parent, 'zxrubbertech-website');
  const fixtureScripts = join(fixtureRepo, 'scripts');
  const fixtureRoot = join(parent, 'release');
  mkdirSync(fixtureScripts, { recursive: true });
  for (const file of registryDependencies) copyFileSync(join(scriptsRoot, file), join(fixtureScripts, file));
  copyFileSync(join(scriptsRoot, 'check-v5-retirement.mjs'), join(fixtureScripts, 'check-v5-retirement.mjs'));
  writeRetirementMap(join(fixtureScripts, 'v5-retirement-map.mjs'));
  copyTreeSafe(root, fixtureRoot);
  return { parent, fixtureRepo, fixtureScripts, fixtureRoot };
}

function runRetirementChecker(fixture) {
  return spawnSync(process.execPath, [
    realpathSync(join(fixture.fixtureScripts, 'check-v5-retirement.mjs')),
    `--root=${fixture.fixtureRoot}`,
  ], {
    cwd: fixture.fixtureRepo,
    encoding: 'utf8',
    maxBuffer: 30 * 1024 * 1024,
  });
}

function retirementCaseDefinitions() {
  const csvFile = (fixture) => join(fixture.fixtureRoot, 'cloudflare', 'zxrubbertech-v5-legacy-redirects.csv');
  return [
    {
      name: 'replace-historical-locale-with-japanese',
      expectedSignal: 'missing approved legacy mapping',
      mutate: (fixture) => {
        const redirects = LEGACY_REDIRECTS.map((entry) => ({ ...entry }));
        const previous = redirects[0];
        redirects[0] = {
          locale: 'ja', htmlLang: 'ja', path: '/ja/products/suspension-bushing/',
          target: 'https://www.zxrubbertech.com/ja/products/#c-automotive',
        };
        writeRetirementMap(join(fixture.fixtureScripts, 'v5-retirement-map.mjs'), redirects);
        const source = join(fixture.fixtureRoot, previous.path.slice(1), 'index.html');
        const destination = join(fixture.fixtureRoot, redirects[0].path.slice(1), 'index.html');
        mkdirSync(dirname(destination), { recursive: true });
        copyFileSync(source, destination);
        rmSync(source);
      },
    },
    {
      name: 'extra-japanese-legacy-fallback',
      expectedSignal: 'unexpected HTML page in retirement bundle: ja/products/rubber-wheel/index.html',
      mutate: (fixture) => {
        const destination = join(fixture.fixtureRoot, 'ja/products/rubber-wheel/index.html');
        mkdirSync(dirname(destination), { recursive: true });
        copyFileSync(join(fixture.fixtureRoot, 'products/rubber-wheel/index.html'), destination);
      },
    },
    {
      name: 'fallback-target-swap',
      expectedSignal: 'fallback token count must be 1',
      mutate: (fixture) => {
        const file = join(fixture.fixtureRoot, 'de/products/rubber-wheel/index.html');
        const source = readFileSync(file, 'utf8');
        writeFileSync(file, source.replaceAll('#c-industrial', '#c-automotive'), 'utf8');
      },
    },
    {
      name: 'cloudflare-csv-crlf',
      expectedSignal: 'Cloudflare CSV SHA-256 mismatch',
      mutate: (fixture) => writeFileSync(csvFile(fixture), readFileSync(csvFile(fixture), 'utf8').replaceAll('\n', '\r\n'), 'utf8'),
    },
    {
      name: 'cloudflare-csv-missing-final-lf',
      expectedSignal: 'Cloudflare CSV SHA-256 mismatch',
      mutate: (fixture) => writeFileSync(csvFile(fixture), readFileSync(csvFile(fixture), 'utf8').replace(/\n$/, ''), 'utf8'),
    },
    {
      name: 'cloudflare-csv-swapped-lines',
      expectedSignal: 'Cloudflare CSV SHA-256 mismatch',
      mutate: (fixture) => {
        const rows = readFileSync(csvFile(fixture), 'utf8').trimEnd().split('\n');
        [rows[0], rows[1]] = [rows[1], rows[0]];
        writeFileSync(csvFile(fixture), `${rows.join('\n')}\n`, 'utf8');
      },
    },
    {
      name: 'extra-release-file',
      expectedSignal: 'retirement bundle must contain exactly 521 files; found 522',
      mutate: (fixture) => writeFileSync(join(fixture.fixtureRoot, 'extra.txt'), 'unexpected\n', 'utf8'),
    },
    {
      name: 'release-symlink',
      expectedSignal: 'symbolic link is not allowed in retirement root',
      mutate: (fixture) => {
        const target = join(fixture.fixtureRoot, 'extra-link');
        const result = spawnSync('/bin/ln', ['-s', 'robots.txt', target], { encoding: 'utf8' });
        if (result.status !== 0) throw new Error(`Unable to create symlink fixture: ${result.stderr}`);
      },
    },
  ];
}

function runRetirementCase(root, testCase) {
  const fixture = prepareRetirementFixture(root);
  try {
    const greenResult = runRetirementChecker(fixture);
    const greenReport = parseCheckerReport(greenResult);
    const greenPassed = greenResult.status === 0
      && greenReport?.status === 'PASS'
      && JSON.stringify(greenReport.metrics) === JSON.stringify({
        v5Urls: 56, legacyPaths: 25, fallbackPages: 25, cloudflareEntries: 50, sitemapUrls: 56,
      });
    testCase.mutate(fixture);
    const result = runRetirementChecker(fixture);
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    const missingFileNoise = (output.match(/missing (?:file|page)|file does not exist/gi) ?? []).length;
    const signalFound = output.includes(testCase.expectedSignal);
    return {
      case: testCase.name,
      fixtureSha256: fixtureSha256(fixture.fixtureRoot),
      greenExitCode: greenResult.status,
      greenMetrics: greenReport?.metrics ?? null,
      exitCode: result.status,
      expectedExitCode: 1,
      expectedSignal: testCase.expectedSignal,
      actualSignalFound: signalFound,
      missingFileNoise,
      status: greenPassed && result.status === 1 && signalFound && missingFileNoise === 0 ? 'PASS' : 'FAIL',
      greenStdoutSha256: sha256(greenResult.stdout ?? ''),
      greenStderrSha256: sha256(greenResult.stderr ?? ''),
      stdoutSha256: sha256(result.stdout ?? ''),
      stderrSha256: sha256(result.stderr ?? ''),
      output: output.trim(),
    };
  } finally {
    rmSync(fixture.parent, { recursive: true, force: true });
  }
}

export function syntheticAcceptance(releaseManifestSha256) {
  const httpResults = [
    ...Object.keys(V5_LOCALES).flatMap((locale) => V5_PAGE_STEMS.map((stem) => ({
      route: getLocalizedRoute(locale, stem), ok: true, status: 200,
    }))),
    ...LEGACY_REDIRECTS.map(({ path }) => ({ route: path, ok: true, status: 200 })),
  ];
  const browserResults = Object.keys(V5_LOCALES).flatMap((locale) => V5_PAGE_STEMS.flatMap((stem) => (
    ['1280x900', '390x844'].map((viewport) => ({
      locale,
      stem,
      viewport,
      ok: true,
      h1Count: 1,
      horizontalOverflow: false,
      localOverflow: false,
      brokenImages: 0,
      failedVideos: 0,
      controlsValid: true,
      canonicalValid: true,
      hreflangCount: 9,
      internalNavigationValid: true,
      migrationConsoleErrors: [],
      ...(locale === 'fa' ? { rtlValid: true, mediaMirrored: false, mapMirrored: false } : {}),
    }))
  )));
  return {
    status: 'PASS',
    releaseManifestSha256,
    httpRoutes: 81,
    httpPassed: 81,
    browserPages: 56,
    pageViewportChecks: 112,
    pageViewportPassed: 112,
    persianRtlViewportChecks: 14,
    realSubmissions: 0,
    formspreePostRequests: 0,
    formSubmission: 'deferred',
    failures: [],
    httpResults,
    browserResults,
    clickPaths: {
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
    },
  };
}

function runWithMutatedReleaseRoot(root, mutation) {
  const parent = mkdtempSync(join(tmpdir(), 'zxrubbertech-v5-archive-mutation.'));
  const fixtureRoot = join(parent, 'release');
  try {
    copyTreeSafe(root, fixtureRoot);
    mutation(fixtureRoot);
    const realFixtureRoot = realpathSync(fixtureRoot);
    try {
      return validateReleaseBundle(realFixtureRoot);
    } catch (error) {
      const message = (error instanceof Error ? error.message : String(error)).replaceAll(realFixtureRoot, '<fixture-root>');
      throw new Error(message);
    }
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
}

function archiveCaseDefinitions(bundle, root) {
  const acceptance = syntheticAcceptance(bundle.manifest.sha256);
  return [
    {
      name: 'old-package-identity', expectedSignal: 'Archive package identity must equal',
      mutate: () => validateArchiveIdentity({ candidatePackageName: 'zxrubbertech-v5-language-routing-release-candidate-2026-08-15-rc1' }),
    },
    {
      name: 'old-rollback-revision', expectedSignal: 'Archive rollback revision must equal',
      mutate: () => validateArchiveIdentity({ candidateRollbackRevision: '17c079572603759a7c96dd3d2fbf7f756a7aea3e' }),
    },
    {
      name: 'old-release-public-pages-35', expectedSignal: 'publicPages=35, expected 56',
      mutate: () => validateReleaseReportData({ ...bundle.report, publicPages: 35 }),
    },
    {
      name: 'old-release-hreflang-210', expectedSignal: 'hreflangLinks=210, expected 504',
      mutate: () => validateReleaseReportData({ ...bundle.report, hreflangLinks: 210 }),
    },
    {
      name: 'old-http-count-60', expectedSignal: 'httpRoutes must equal 81',
      mutate: () => validateAcceptanceData({ ...acceptance, httpRoutes: 60, httpPassed: 60 }, bundle.manifest.sha256),
    },
    {
      name: 'old-browser-count-70', expectedSignal: 'pageViewportChecks must equal 112',
      mutate: () => validateAcceptanceData({ ...acceptance, pageViewportChecks: 70, pageViewportPassed: 70 }, bundle.manifest.sha256),
    },
    {
      name: 'old-hreflang-count-6', expectedSignal: 'failed browser invariant',
      mutate: () => validateAcceptanceData({
        ...acceptance,
        browserResults: acceptance.browserResults.map((result, index) => index === 0 ? { ...result, hreflangCount: 6 } : result),
      }, bundle.manifest.sha256),
    },
    {
      name: 'browser-delete-and-duplicate-preserving-112', expectedSignal: 'browser result order mismatch',
      mutate: () => validateAcceptanceData({
        ...acceptance,
        browserResults: [...acceptance.browserResults.slice(0, -1), acceptance.browserResults[0]],
      }, bundle.manifest.sha256),
    },
    {
      name: 'persian-delete-and-duplicate-preserving-14', expectedSignal: 'browser result order mismatch',
      mutate: () => {
        const results = acceptance.browserResults.map((result) => ({ ...result }));
        const faIndex = results.findIndex((result) => result.locale === 'fa');
        results[faIndex] = { ...results[0] };
        return validateAcceptanceData({ ...acceptance, browserResults: results }, bundle.manifest.sha256);
      },
    },
    {
      name: 'release-manifest-binding', expectedSignal: 'releaseManifestSha256 must bind',
      mutate: () => validateAcceptanceData({ ...acceptance, releaseManifestSha256: '0'.repeat(64) }, bundle.manifest.sha256),
    },
    {
      name: 'archive-extra-release-file', expectedSignal: 'exactly 521 files; found 522',
      mutate: () => runWithMutatedReleaseRoot(root, (fixtureRoot) => {
        writeFileSync(join(fixtureRoot, 'extra.txt'), 'unexpected\n', 'utf8');
      }),
    },
    {
      name: 'archive-release-symlink', expectedSignal: 'symbolic link',
      mutate: () => runWithMutatedReleaseRoot(root, (fixtureRoot) => {
        const result = spawnSync('/bin/ln', ['-s', 'robots.txt', join(fixtureRoot, 'extra-link')], { encoding: 'utf8' });
        if (result.status !== 0) throw new Error(`Unable to create archive symlink fixture: ${result.stderr}`);
      }),
    },
  ];
}

function runArchiveCase(bundle, testCase) {
  let actualSignalFound = false;
  let output = '';
  try {
    testCase.mutate();
  } catch (error) {
    output = error instanceof Error ? error.message : String(error);
    actualSignalFound = output.includes(testCase.expectedSignal);
  }
  return {
    case: testCase.name,
    fixtureSha256: bundle.manifest.sha256,
    greenExitCode: 0,
    greenMetrics: { releaseFiles: 521, publicPages: 56, hreflangLinks: 504, sitemapUrls: 56 },
    exitCode: actualSignalFound ? 1 : 0,
    expectedExitCode: 1,
    expectedSignal: testCase.expectedSignal,
    actualSignalFound,
    missingFileNoise: 0,
    status: actualSignalFound ? 'PASS' : 'FAIL',
    output,
  };
}

function runSuite({ suite, root }) {
  if (suite === 'registry') return registryCases().map(runRegistryCase);
  if (suite === 'catalog') {
    const missing = ['ja', 'ko', 'fa'].filter((locale) => !existsSync(join(scriptsRoot, 'v5-i18n', `${locale}.json`)));
    if (missing.length) throw new CliError(`Catalog mutation suite requires complete catalogs; missing: ${missing.join(', ')}`);
    return catalogCaseDefinitions().map(runCatalogCase);
  }
  if (suite === 'release') {
    if (!root) throw new CliError('Release mutation suite requires --root=<complete-green-release>');
    const inventory = releaseInventoryMetrics(root);
    if (inventory.canonicalPages !== 56 || inventory.missingFiles.length) {
      throw new CliError(`Release mutation suite requires all 56 canonical pages; found ${inventory.canonicalPages}`);
    }
    return releaseCaseDefinitions().map((testCase) => runReleaseCase(root, testCase));
  }
  if (suite === 'retirement') {
    if (!root) throw new CliError('Retirement mutation suite requires --root=<complete-green-release>');
    return retirementCaseDefinitions().map((testCase) => runRetirementCase(root, testCase));
  }
  if (suite === 'archive') {
    if (!root) throw new CliError('Archive mutation suite requires --root=<complete-green-release>');
    const bundle = validateReleaseBundle(root);
    validateArchiveIdentity({ candidatePackageName: archivePackageName, candidateRollbackRevision: archiveRollbackRevision });
    validateReleaseReportData(bundle.report);
    validateAcceptanceData(syntheticAcceptance(bundle.manifest.sha256), bundle.manifest.sha256);
    return archiveCaseDefinitions(bundle, root).map((testCase) => runArchiveCase(bundle, testCase));
  }
  if (suite === 'all') {
    if (!root) throw new CliError('All mutation suites require --root=<complete-green-release>');
    const bundle = validateReleaseBundle(root);
    return [
      ...registryCases().map(runRegistryCase),
      ...catalogCaseDefinitions().map(runCatalogCase),
      ...releaseCaseDefinitions().map((testCase) => runReleaseCase(root, testCase)),
      ...retirementCaseDefinitions().map((testCase) => runRetirementCase(root, testCase)),
      ...archiveCaseDefinitions(bundle, root).map((testCase) => runArchiveCase(bundle, testCase)),
    ];
  }
  throw new CliError(`Mutation suite is registered but not implemented yet: ${suite}${root ? ` (${root})` : ''}`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const cases = runSuite(options);
  const failures = cases.filter((testCase) => testCase.status !== 'PASS').map((testCase) => testCase.case);
  const report = {
    checker: 'v5-i18n-mutations',
    status: failures.length === 0 ? 'PASS' : 'FAIL',
    suite: options.suite,
    cases,
    failures,
  };
  mkdirSync(dirname(options.report), { recursive: true });
  writeFileSync(options.report, `${JSON.stringify(report, null, 2)}\n`, {
    encoding: 'utf8',
    flag: options.emptyOwnedReport ? 'w' : 'wx',
  });
  process.stdout.write(`${JSON.stringify(report)}\n`);
  if (failures.length > 0) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    main();
  } catch (error) {
    const report = { checker: 'v5-i18n-mutations', status: 'FAIL', error: error.message };
    process.stderr.write(`${JSON.stringify(report)}\n`);
    process.exitCode = error instanceof CliError ? 2 : 1;
  }
}
