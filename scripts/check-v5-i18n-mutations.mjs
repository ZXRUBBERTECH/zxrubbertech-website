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
  validatePreflightChecks,
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
      if (!info.isFile()) {
        hash.update(relative(root, file).split('\\').join('/'));
        hash.update(`\0SPECIAL:${info.mode}\0`);
        continue;
      }
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

function deleteValueAtPath(object, path) {
  const parent = path.slice(0, -1).reduce((current, key) => current[key], object);
  const key = path.at(-1);
  if (typeof parent?.[key] !== 'string') throw new Error(`Missing catalog mutation key: ${path.join('.')}`);
  delete parent[key];
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
    const expectedGreenMetrics = { locales: 9, pageRoles: 7, routes: 63, hreflangsPerPage: 10 };
    const greenMetrics = greenReport?.registry ?? null;
    const greenPassed = greenResult.status === 0
      && greenReport?.status === 'PASS'
      && JSON.stringify(greenMetrics) === JSON.stringify(expectedGreenMetrics);

    const configFile = join(fixture.fixtureScripts, 'v5-i18n-config.mjs');
    if (testCase.mutateConfig) {
      const source = readFileSync(configFile, 'utf8');
      writeFileSync(configFile, testCase.mutateConfig(source), 'utf8');
    }
    if (testCase.mutateChecker) {
      const checkerFile = join(fixture.fixtureScripts, 'check-v5-i18n.mjs');
      const source = readFileSync(checkerFile, 'utf8');
      writeFileSync(checkerFile, testCase.mutateChecker(source), 'utf8');
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
      name: 'duplicate-hreflang',
      expectedExit: 1,
      expectedSignal: 'Duplicate locale hreflang: fa',
      mutateConfig: (source) => replaceOnce(
        source,
        /ar: Object\.freeze\(\{([\s\S]*?)hreflang: 'ar'/g,
        "ar: Object.freeze({$1hreflang: 'fa'",
        'duplicate-hreflang',
      ),
    },
    {
      name: 'arabic-direction-ltr',
      expectedExit: 1,
      expectedSignal: 'Locale definition does not match the approved registry: ar',
      mutateConfig: (source) => replaceOnce(
        source,
        /ar: Object\.freeze\(\{([\s\S]*?)direction: 'rtl'/g,
        "ar: Object.freeze({$1direction: 'ltr'",
        'arabic-direction-ltr',
      ),
    },
    {
      name: 'arabic-og-locale',
      expectedExit: 1,
      expectedSignal: 'Locale definition does not match the approved registry: ar',
      mutateConfig: (source) => replaceOnce(source, /ogLocale: 'ar_SA'/g, "ogLocale: 'ar_AE'", 'arabic-og-locale'),
    },
    {
      name: 'x-default-not-english',
      expectedExit: 1,
      expectedSignal: 'x-default for demo-a must equal the English equivalent',
      mutateConfig: (source) => replaceOnce(source, /const english = localeEntries\[0\];/g, 'const english = localeEntries[1];', 'x-default-not-english'),
    },
    {
      name: 'misordered-registry',
      expectedExit: 1,
      expectedSignal: 'Locale registry must contain exactly: en, de, zh-CN, ru, tr, ja, ko, fa, ar',
      mutateConfig: (source) => replaceOnce(
        source,
        /(  fa: Object\.freeze\(\{[\s\S]*?\n  \}\),\n)(  ar: Object\.freeze\(\{[\s\S]*?\n  \}\),\n)/g,
        '$2$1',
        'misordered-registry',
      ),
    },
    {
      name: 'arabic-language-control-label',
      expectedExit: 1,
      expectedSignal: 'Language-control labels do not match the approved locale contract',
      mutateChecker: (source) => replaceOnce(
        source,
        /(const EXPECTED_LANGUAGE_CONTROL_LABELS = Object\.freeze\(\{[\s\S]*?fa: 'زبان', )ar: 'اللغة',/g,
        "$1ar: 'لغة',",
        'arabic-language-control-label',
      ),
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
      name: 'arabic-without-arabic-script', locale: 'ar', expectedSignal: 'ar: localized prose must contain Arabic text',
      mutate: (catalog) => Object.assign(catalog, mapCatalogStrings(catalog, (value, path) => {
        if (path[0] === 'meta') return value;
        const stripped = value.replace(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/gu, '').trim();
        return stripped || '123';
      })),
    },
    {
      name: 'arabic-without-arabic-yeh', locale: 'ar', expectedSignal: 'ar: catalog must use Arabic Yeh ي',
      mutate: (catalog) => Object.assign(catalog, mapCatalogStrings(catalog, (value) => value.replaceAll('\u064A', '\u0649'))),
    },
    {
      name: 'arabic-without-arabic-kaf', locale: 'ar', expectedSignal: 'ar: catalog must use Arabic Kaf ك',
      mutate: (catalog) => Object.assign(catalog, mapCatalogStrings(catalog, (value) => value.replaceAll('\u0643', '\u0642'))),
    },
    {
      name: 'arabic-without-arabic-indic-digits', locale: 'ar', expectedSignal: 'ar: catalog facts must use Arabic-Indic digits',
      mutate: (catalog) => Object.assign(catalog, mapCatalogStrings(catalog, (value) => (
        value.replace(/[\u0660-\u0669]/gu, (digit) => String(digit.codePointAt(0) - 0x0660))
      ))),
    },
    {
      name: 'arabic-persian-letters', locale: 'ar', expectedSignal: 'ar: Persian letters are not allowed',
      mutate: (catalog) => setValueAtPath(catalog, mutationValuePath, `${valueAtPath(catalog, mutationValuePath)} پچژگیک`),
    },
    {
      name: 'arabic-persian-digits', locale: 'ar', expectedSignal: 'ar: Persian digits are not allowed',
      mutate: (catalog) => setValueAtPath(catalog, mutationValuePath, `${valueAtPath(catalog, mutationValuePath)} ۰۱۲۳۴۵۶۷۸۹`),
    },
    {
      name: 'arabic-presentation-form-fe70-feff', locale: 'ar', expectedSignal: 'ar: Arabic presentation forms are not allowed',
      mutate: (catalog) => setValueAtPath(catalog, mutationValuePath, `${valueAtPath(catalog, mutationValuePath)}\uFE8E`),
    },
    {
      name: 'arabic-presentation-form-fb50-fdff', locale: 'ar', expectedSignal: 'ar: Arabic presentation forms are not allowed',
      mutate: (catalog) => setValueAtPath(catalog, mutationValuePath, `${valueAtPath(catalog, mutationValuePath)}\uFB50`),
    },
    {
      name: 'arabic-alm-control', locale: 'ar', expectedSignal: 'ar: hidden bidi controls are not allowed',
      mutate: (catalog) => setValueAtPath(catalog, mutationValuePath, `${valueAtPath(catalog, mutationValuePath)}\u061C`),
    },
    {
      name: 'arabic-lrm-control', locale: 'ar', expectedSignal: 'ar: hidden bidi controls are not allowed',
      mutate: (catalog) => setValueAtPath(catalog, mutationValuePath, `${valueAtPath(catalog, mutationValuePath)}\u200E`),
    },
    {
      name: 'arabic-rlm-control', locale: 'ar', expectedSignal: 'ar: hidden bidi controls are not allowed',
      mutate: (catalog) => setValueAtPath(catalog, mutationValuePath, `${valueAtPath(catalog, mutationValuePath)}\u200F`),
    },
    {
      name: 'arabic-embedding-control', locale: 'ar', expectedSignal: 'ar: hidden bidi controls are not allowed',
      mutate: (catalog) => setValueAtPath(catalog, mutationValuePath, `${valueAtPath(catalog, mutationValuePath)}\u202E`),
    },
    {
      name: 'arabic-isolate-control', locale: 'ar', expectedSignal: 'ar: hidden bidi controls are not allowed',
      mutate: (catalog) => setValueAtPath(catalog, mutationValuePath, `${valueAtPath(catalog, mutationValuePath)}\u2067`),
    },
    {
      name: 'arabic-zwj', locale: 'ar', expectedSignal: 'ar: ZWJ and ZWNJ are not allowed',
      mutate: (catalog) => setValueAtPath(catalog, mutationValuePath, `${valueAtPath(catalog, mutationValuePath)}\u200D`),
    },
    {
      name: 'arabic-zwnj', locale: 'ar', expectedSignal: 'ar: ZWJ and ZWNJ are not allowed',
      mutate: (catalog) => setValueAtPath(catalog, mutationValuePath, `${valueAtPath(catalog, mutationValuePath)}\u200C`),
    },
    {
      name: 'arabic-tatweel', locale: 'ar', expectedSignal: 'ar: tatweel is not allowed',
      mutate: (catalog) => setValueAtPath(catalog, mutationValuePath, `${valueAtPath(catalog, mutationValuePath)}\u0640`),
    },
    {
      name: 'arabic-foreign-script-cyrillic', locale: 'ar', expectedSignal: 'ar: unapproved foreign-script residue',
      mutate: (catalog) => setValueAtPath(catalog, mutationValuePath, `${valueAtPath(catalog, mutationValuePath)} Ж`),
    },
    {
      name: 'arabic-foreign-script-han', locale: 'ar', expectedSignal: 'ar: unapproved foreign-script residue',
      mutate: (catalog) => setValueAtPath(catalog, mutationValuePath, `${valueAtPath(catalog, mutationValuePath)} 漢`),
    },
    {
      name: 'arabic-foreign-script-hiragana', locale: 'ar', expectedSignal: 'ar: unapproved foreign-script residue',
      mutate: (catalog) => setValueAtPath(catalog, mutationValuePath, `${valueAtPath(catalog, mutationValuePath)} あ`),
    },
    {
      name: 'arabic-foreign-script-katakana', locale: 'ar', expectedSignal: 'ar: unapproved foreign-script residue',
      mutate: (catalog) => setValueAtPath(catalog, mutationValuePath, `${valueAtPath(catalog, mutationValuePath)} カ`),
    },
    {
      name: 'arabic-foreign-script-hangul', locale: 'ar', expectedSignal: 'ar: unapproved foreign-script residue',
      mutate: (catalog) => setValueAtPath(catalog, mutationValuePath, `${valueAtPath(catalog, mutationValuePath)} 한`),
    },
    {
      name: 'arabic-non-nfc', locale: 'ar', expectedSignal: 'ar: catalog value must use NFC normalization',
      mutate: (catalog) => setValueAtPath(catalog, mutationValuePath, `${valueAtPath(catalog, mutationValuePath)} ا\u0654`),
    },
    {
      name: 'arabic-invalid-utf8', locale: 'ar', expectedSignal: 'ar: catalog must be valid UTF-8', allowsEarlyFailure: true,
      mutateRaw: (file) => writeFileSync(file, Buffer.from([0xff, 0xfe, 0xfd])),
    },
    {
      name: 'arabic-utf8-bom', locale: 'ar', expectedSignal: 'ar: catalog must not contain a UTF-8 BOM', allowsEarlyFailure: true,
      mutateRaw: (file) => writeFileSync(file, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), readFileSync(file)])),
    },
    {
      name: 'arabic-missing-key', locale: 'ar', expectedSignal: 'ar: catalog key set differs from English',
      mutate: (catalog) => deleteValueAtPath(catalog, mutationValuePath),
    },
    {
      name: 'arabic-duplicate-key', locale: 'ar', expectedSignal: 'ar: duplicate catalog key at pages.demo-a.html_text.engineered-rubber-compounds-and-components', allowsEarlyFailure: true,
      mutateRaw: (file) => {
        const source = readFileSync(file, 'utf8');
        const pattern = /^(\s*"engineered-rubber-compounds-and-components":\s*"[^"\n]*(?:\\.[^"\n]*)*",)$/m;
        const match = source.match(pattern);
        if (!match) throw new Error('Arabic duplicate-key mutation target is missing');
        writeFileSync(file, source.replace(pattern, `${match[1]}\n${match[1]}`), 'utf8');
      },
    },
    {
      name: 'arabic-english-residue', locale: 'ar', expectedSignal: 'ar: unapproved English residue',
      mutate: (catalog) => setValueAtPath(catalog, mutationValuePath, `${valueAtPath(catalog, mutationValuePath)} industrial solution`),
    },
    {
      name: 'arabic-approved-ascii-suffix-boundary',
      locale: 'ar',
      expectedSignal: 'ar: unapproved English residue at pages.demo-a.html_text.engineered-rubber-compounds-and-components: whatsappx',
      mutate: (catalog) => setValueAtPath(catalog, mutationValuePath, `${valueAtPath(catalog, mutationValuePath)} WhatsAppx`),
    },
    {
      name: 'arabic-approved-ascii-prefix-boundary',
      locale: 'ar',
      expectedSignal: 'ar: unapproved English residue at pages.demo-a.html_text.engineered-rubber-compounds-and-components: xwhatsapp',
      mutate: (catalog) => setValueAtPath(catalog, mutationValuePath, `${valueAtPath(catalog, mutationValuePath)} xWhatsApp`),
    },
    {
      name: 'arabic-modified-protected-literal', locale: 'ar', expectedSignal: 'ar V5 catalog changed preserved value: shared.html_text.martin-zxrubbertech-com',
      mutate: (catalog) => Object.assign(catalog, replaceFirstCatalogLiteral(
        catalog,
        'martin@zxrubbertech.com',
        'martin@example.com',
      )),
    },
    {
      name: 'arabic-modified-verified-fact', locale: 'ar', expectedSignal: 'ar: verified fact annualCompoundCapacity',
      mutate: (catalog, fixture) => {
        const glossary = readJson(join(fixture.fixtureCatalogs, 'glossary.json'));
        const rendering = glossary.verifiedFactRenderings.ar.annualCompoundCapacity;
        const changed = rendering.replace('٣', '٤');
        if (changed === rendering) throw new Error('Arabic fact mutation requires the approved ٣٬٠٠٠ rendering');
        Object.assign(catalog, replaceFirstCatalogLiteral(catalog, rendering, changed));
      },
    },
    {
      name: 'arabic-missing-glossary-term', locale: 'ar', expectedSignal: 'V5 i18n glossary is missing ar term: tooling',
      mutateFixture: (fixture) => {
        const file = join(fixture.fixtureCatalogs, 'glossary.json');
        const glossary = readJson(file);
        delete glossary.terms.tooling.ar;
        writeJson(file, glossary);
      },
    },
    {
      name: 'arabic-batch-release-shipping-semantics',
      locale: 'ar',
      expectedSignal: 'ar: glossary term "batch release" is not rendered as "اعتماد الدفعة الإنتاجية"',
      mutate: (catalog) => Object.assign(catalog, replaceFirstCatalogLiteral(
        catalog,
        'اعتماد الدفعة الإنتاجية',
        'شحن الدفعة الإنتاجية',
      )),
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
      && JSON.stringify(greenMetrics.registry) === JSON.stringify({ locales: 9, pageRoles: 7, routes: 63, hreflangsPerPage: 10 })
      && greenMetrics.catalogKeys === 531
      && greenMetrics.operations === 508;

    const catalogFile = join(fixture.fixtureCatalogs, `${testCase.locale}.json`);
    if (testCase.mutate) mutateCatalogJson(fixture, testCase.locale, testCase.mutate);
    if (testCase.mutateRaw) testCase.mutateRaw(catalogFile);
    if (testCase.mutateFixture) testCase.mutateFixture(fixture);
    const result = runCatalogChecker(fixture, testCase.locale);
    const checkerReport = parseCheckerReport(result);
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    const checkerFailures = Array.isArray(checkerReport?.failures) ? checkerReport.failures : [];
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
    const signalFound = checkerFailures.some((failure) => failure.includes(testCase.expectedSignal));
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
      checkerFailures,
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
  } else if (checker === 'rtl') {
    file = join(scriptsRoot, 'check-v5-i18n.mjs');
    args = ['--gate=release', '--profile=release', `--root=${fixture.fixtureRoot}`];
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
    return report.metrics?.locales === 9
      && report.metrics?.publicPages === 63
      && report.metrics?.hreflangLinks === 630
      && report.metrics?.sitemapUrls === 63;
  }
  if (testCase.checker === 'controls') {
    return report.controls?.pages === 7
      && report.controls?.anchorsPerGroup === 9
      && report.controls?.anchorsPerPage === 27
      && report.controls?.totalAnchors === 189;
  }
  if (testCase.checker === 'form') {
    return report.form?.quotePages === 9
      && report.form?.formspreeTargets === 9
      && report.form?.turnstileWidgets === 9
      && report.form?.localeFields === 9
      && report.form?.runtimeMessages === 126
      && report.form?.runtimeMessageResults?.length === 126
      && report.form.runtimeMessageResults.every(({ passed }) => passed === true)
      && report.form?.realSubmissions === 0;
  }
  return report.release?.locales === 9
    && report.release?.publicPages === 63
    && report.release?.hreflangLinks === 630
    && report.release?.sitemapUrls === 63
    && report.release?.rtlPages === 14
    && JSON.stringify(report.release?.rtlPagesByLocale) === JSON.stringify({ fa: 7, ar: 7 });
}

function releaseCaseDefinitions() {
  const desktopFaAnchor = /<a\b(?=[^>]*\bdata-locale="fa")[^>]*>[\s\S]*?<\/a>/g;
  const desktopKoAnchor = /<a\b(?=[^>]*\bdata-locale="ko")[^>]*>[\s\S]*?<\/a>/g;
  return [
    {
      name: 'missing-language-anchor', checker: 'controls',
      expectedSignal: 'desktop language control must contain 9 real anchors; found 8',
      mutate: (fixture) => mutateReleasePage(fixture, 'fa', 'demo-a', (source) => mutateMarkedGroup(
        source,
        'DESKTOP',
        (group) => replaceOnce(group, desktopKoAnchor, '', 'missing-language-anchor'),
      )),
    },
    {
      name: 'duplicate-language-anchor', checker: 'controls',
      expectedSignal: 'desktop language control must contain 9 real anchors; found 10',
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
      name: 'wrong-arabic-dir', checker: 'seo',
      expectedSignal: 'ar/demo-a: html dir must be rtl',
      mutate: (fixture) => mutateReleasePage(fixture, 'ar', 'demo-a', (source) => replaceFirstExact(
        source,
        '<html lang="ar" dir="rtl">',
        '<html lang="ar" dir="ltr">',
        'wrong-arabic-dir',
      )),
    },
    {
      name: 'invalid-arabic-rtl-wrapper', checker: 'rtl',
      expectedSignal: 'ar/demo-a: RTL LTR literals must use exact nonempty non-nested bdi dir=ltr pairs',
      mutate: (fixture) => mutateReleasePage(fixture, 'ar', 'demo-a', (source) => replaceFirstExact(
        source,
        '<bdi dir="ltr">',
        '<bdi dir="rtl">',
        'invalid-arabic-rtl-wrapper',
      )),
    },
    {
      name: 'rtl-media-reflection', checker: 'rtl',
      expectedSignal: 'ar/demo-a: RTL CSS must not mirror media, Logo, map, or decorative elements',
      mutate: (fixture) => mutateReleasePage(fixture, 'ar', 'demo-a', (source) => replaceFirstExact(
        source,
        '/* V5:RTL END */',
        'html[dir="rtl"] img{transform:scaleX(-1)}\n/* V5:RTL END */',
        'rtl-media-reflection',
      )),
    },
    {
      name: 'rtl-decorative-reflection', checker: 'rtl',
      expectedSignal: 'ar/demo-a: RTL CSS must not mirror media, Logo, map, or decorative elements',
      mutate: (fixture) => mutateReleasePage(fixture, 'ar', 'demo-a', (source) => replaceFirstExact(
        source,
        '/* V5:RTL END */',
        'html[dir="rtl"] .tab-hero::before{-webkit-box-reflect:right}\n/* V5:RTL END */',
        'rtl-decorative-reflection',
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
      name: 'wrong-persian-input-direction', checker: 'form',
      expectedSignal: 'fa/quote: name direction must equal auto',
      mutate: (fixture) => mutateReleasePage(fixture, 'fa', 'quote', (source) => replaceOnce(
        source,
        /(<input\b(?=[^>]*\bname="name")[^>]*\b)dir="auto"/g,
        '$1dir="ltr"',
        'wrong-persian-input-direction',
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
      name: 'wrong-arabic-turnstile-language', checker: 'form',
      expectedSignal: 'ar/quote: Turnstile data-language must equal ar',
      mutate: (fixture) => mutateReleasePage(fixture, 'ar', 'quote', (source) => replaceFirstExact(
        source,
        ' data-language="ar"',
        ' data-language="en"',
        'wrong-arabic-turnstile-language',
      )),
    },
    {
      name: 'wrong-arabic-hidden-locale', checker: 'form',
      expectedSignal: 'ar/quote: hidden language field must equal locale ID ar',
      mutate: (fixture) => mutateReleasePage(fixture, 'ar', 'quote', (source) => replaceFirstExact(
        source,
        '<input type="hidden" name="language" value="ar">',
        '<input type="hidden" name="language" value="en">',
        'wrong-arabic-hidden-locale',
      )),
    },
    {
      name: 'wrong-arabic-input-direction', checker: 'form',
      expectedSignal: 'ar/quote: name direction must equal auto',
      mutate: (fixture) => mutateReleasePage(fixture, 'ar', 'quote', (source) => replaceOnce(
        source,
        /(<input\b(?=[^>]*\bname="name")[^>]*\b)dir="auto"/g,
        '$1dir="ltr"',
        'wrong-arabic-input-direction',
      )),
    },
    {
      name: 'changed-arabic-formspree-id', checker: 'form',
      expectedSignal: 'ar/quote: Formspree target must contain mrpzqado exactly once',
      mutate: (fixture) => mutateReleasePage(fixture, 'ar', 'quote', (source) => replaceFirstExact(
        source,
        'https://formspree.io/f/mrpzqado',
        'https://formspree.io/f/changedid',
        'changed-arabic-formspree-id',
      )),
    },
    {
      name: 'changed-arabic-turnstile-site-key', checker: 'form',
      expectedSignal: 'ar/quote: Turnstile Site Key must equal the approved key exactly once',
      mutate: (fixture) => mutateReleasePage(fixture, 'ar', 'quote', (source) => replaceFirstExact(
        source,
        '0x4AAAAAAENHOMMn_zK0WuNN',
        '0x4AAAAAAENHOMMn_zK0WuNX',
        'changed-arabic-turnstile-site-key',
      )),
    },
    {
      name: 'changed-arabic-backend-field', checker: 'form',
      expectedSignal: 'ar/quote: stable backend fields must equal name, company, email, phone, message plus hidden language',
      mutate: (fixture) => mutateReleasePage(fixture, 'ar', 'quote', (source) => replaceFirstExact(
        source,
        'name="company"',
        'name="organisation"',
        'changed-arabic-backend-field',
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
    const expectedCanonicalPages = Object.keys(V5_LOCALES).length * V5_PAGE_STEMS.length;
    const greenResult = runReleaseChecker(fixture, testCase.checker);
    const greenReport = parseCheckerReport(greenResult);
    const greenPassed = greenInventory.canonicalPages === expectedCanonicalPages
      && greenInventory.missingFiles.length === 0
      && releaseGreenPassed(testCase, greenResult, greenReport);

    testCase.mutate(fixture);
    const mutationInventory = releaseInventoryMetrics(fixture.fixtureRoot);
    const result = runReleaseChecker(fixture, testCase.checker);
    const checkerReport = parseCheckerReport(result);
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    const missingFileNoise = (output.match(/missing (?:file|page)|file does not exist/gi) ?? []).length;
    const actualSignalFound = output.includes(testCase.expectedSignal);
    const unaffectedMetricsMatch = mutationInventory.canonicalPages === expectedCanonicalPages
      && mutationInventory.missingFiles.length === 0;
    return {
      case: testCase.name,
      checker: testCase.checker,
      fixtureSha256: fixtureSha256(fixture.fixtureRoot),
      greenExitCode: greenResult.status,
      greenInventory,
      greenMetrics: greenReport?.metrics ?? greenReport?.controls ?? greenReport?.form ?? greenReport?.release ?? null,
      exitCode: result.status,
      expectedExitCode: 1,
      expectedSignal: testCase.expectedSignal,
      actualSignalFound,
      mutationInventory,
      mutationMetrics: checkerReport?.metrics ?? checkerReport?.controls ?? checkerReport?.form ?? checkerReport?.release ?? null,
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
  copyFileSync(join(scriptsRoot, 'build-v5-retirement.mjs'), join(fixtureScripts, 'build-v5-retirement.mjs'));
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

function runRetirementBuilder(fixture) {
  return spawnSync(process.execPath, [
    realpathSync(join(fixture.fixtureScripts, 'build-v5-retirement.mjs')),
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
      name: 'extra-arabic-legacy-fallback',
      expectedSignal: 'unexpected HTML page in retirement bundle: ar/products/rubber-wheel/index.html',
      mutate: (fixture) => {
        const destination = join(fixture.fixtureRoot, 'ar/products/rubber-wheel/index.html');
        mkdirSync(dirname(destination), { recursive: true });
        copyFileSync(join(fixture.fixtureRoot, 'products/rubber-wheel/index.html'), destination);
      },
    },
    {
      name: 'extra-arabic-cloudflare-row',
      expectedSignal: 'Cloudflare CSV SHA-256 mismatch',
      mutate: (fixture) => {
        const file = csvFile(fixture);
        const source = readFileSync(file, 'utf8');
        writeFileSync(
          file,
          `${source}www.zxrubbertech.com/ar/products/rubber-wheel/,https://www.zxrubbertech.com/ar/products/#c-industrial,301,true,false,false,false\n`,
          'utf8',
        );
      },
    },
    {
      name: 'single-arabic-release-rejected-before-retirement-write',
      runner: 'builder',
      requireFixtureUnchanged: true,
      expectedSignal: 'Retirement requires the complete ordered 63-page V5 release report',
      mutate: (fixture) => {
        const file = join(fixture.fixtureRoot, 'v5-release-report.json');
        const report = readJson(file);
        report.locales = 1;
        report.localeIds = ['ar'];
        report.publicPages = 7;
        report.hreflangLinks = 14;
        report.sitemapUrls = 7;
        report.pages = report.pages.filter(({ locale }) => locale === 'ar');
        writeJson(file, report);
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
      expectedSignal: 'retirement bundle must contain exactly 528 files; found 529',
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
    {
      name: 'release-special-file',
      expectedSignal: 'unsupported file type in retirement root',
      mutate: (fixture) => {
        const result = spawnSync('/usr/bin/mkfifo', [join(fixture.fixtureRoot, 'extra-fifo')], { encoding: 'utf8' });
        if (result.status !== 0) throw new Error(`Unable to create FIFO fixture: ${result.stderr}`);
      },
    },
  ];
}

function runRetirementCase(root, testCase) {
  const fixture = prepareRetirementFixture(root);
  try {
    const runner = testCase.runner === 'builder' ? runRetirementBuilder : runRetirementChecker;
    const greenResult = runner(fixture);
    const greenReport = parseCheckerReport(greenResult);
    const greenMetrics = testCase.runner === 'builder'
      ? greenReport && {
        v5Urls: greenReport.v5Urls,
        legacyPaths: LEGACY_REDIRECTS.length,
        fallbackPages: greenReport.fallbackPages,
        cloudflareEntries: greenReport.cloudflareEntries,
        sitemapUrls: greenReport.sitemapUrls,
      }
      : greenReport?.metrics;
    const greenPassed = greenResult.status === 0
      && greenReport?.status === 'PASS'
      && JSON.stringify(greenMetrics) === JSON.stringify({
        v5Urls: 63, legacyPaths: 25, fallbackPages: 25, cloudflareEntries: 50, sitemapUrls: 63,
      });
    testCase.mutate(fixture);
    const beforeRunSha256 = fixtureSha256(fixture.fixtureRoot);
    const result = runner(fixture);
    const afterRunSha256 = fixtureSha256(fixture.fixtureRoot);
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    const missingFileNoise = (output.match(/missing (?:file|page)|file does not exist/gi) ?? []).length;
    const signalFound = output.includes(testCase.expectedSignal);
    const fixtureUnchanged = testCase.requireFixtureUnchanged !== true || beforeRunSha256 === afterRunSha256;
    return {
      case: testCase.name,
      fixtureSha256: fixtureSha256(fixture.fixtureRoot),
      greenExitCode: greenResult.status,
      greenMetrics: greenMetrics ?? null,
      exitCode: result.status,
      expectedExitCode: 1,
      expectedSignal: testCase.expectedSignal,
      actualSignalFound: signalFound,
      fixtureUnchanged,
      missingFileNoise,
      status: greenPassed && result.status === 1 && signalFound && fixtureUnchanged && missingFileNoise === 0 ? 'PASS' : 'FAIL',
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
  const localeIds = Object.keys(V5_LOCALES);
  const httpResults = [
    ...localeIds.flatMap((locale) => V5_PAGE_STEMS.map((stem) => ({
      route: getLocalizedRoute(locale, stem), ok: true, status: 200,
    }))),
    ...LEGACY_REDIRECTS.map(({ path }) => ({ route: path, ok: true, status: 200 })),
  ];
  const browserResults = localeIds.flatMap((locale) => V5_PAGE_STEMS.flatMap((stem) => (
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
      hreflangCount: 10,
      internalNavigationValid: true,
      migrationConsoleErrors: [],
      ...(V5_LOCALES[locale].direction === 'rtl'
        ? { rtlValid: true, mediaMirrored: false, mapMirrored: false, decorativeMirrored: false }
        : {}),
    }))
  )));
  const browserKeys = browserResults.map(({ locale, stem, viewport }) => `${locale}\0${stem}\0${viewport}`);
  const quoteValidation = localeIds.map((locale) => ({
    locale,
    ok: true,
    empty: { invalid: 3, messages: ['required', 'required', 'required'] },
    badEmail: { invalid: true, message: 'invalid email' },
    withoutTurnstile: {
      status: 'verification required',
      state: 'error',
      values: {
        name: 'Acceptance Tester',
        company: '',
        email: 'acceptance@example.com',
        phone: '',
        message: 'Acceptance only; do not submit.',
      },
      hiddenLocale: locale,
      turnstileLanguage: V5_LOCALES[locale].turnstileLanguage,
      formAction: 'https://formspree.io/f/mrpzqado',
      directions: V5_LOCALES[locale].direction === 'rtl'
        ? { name: 'auto', company: 'auto', email: 'ltr', phone: 'ltr', message: 'auto' }
        : { name: null, company: null, email: null, phone: null, message: null },
      dirnameFields: 0,
    },
  }));
  return {
    status: 'PASS',
    releaseManifestSha256,
    manifestFiles: 528,
    httpRoutes: 88,
    httpPassed: 88,
    productionRedirectRows: 0,
    productionRedirectPassed: 0,
    redirectResults: [],
    browserPages: 63,
    pageViewportChecks: 126,
    pageViewportPassed: 126,
    persianRtlViewportChecks: 14,
    arabicRtlViewportChecks: 14,
    rtlViewportChecks: 28,
    realSubmissions: 0,
    formspreeAttemptedPostRequests: 0,
    formspreePostRequests: 0,
    formspreeInterceptedUrls: [],
    formSubmission: 'deferred',
    failures: [],
    httpResults,
    browserResults,
    interactionEvidence: {
      quoteValidation,
      exactHttpKeys: httpResults.map(({ route }) => route),
      exactBrowserKeys: browserKeys,
      exactPersianKeys: browserKeys.filter((key) => key.startsWith('fa\0')),
      exactArabicKeys: browserKeys.filter((key) => key.startsWith('ar\0')),
      exactRtlKeys: browserKeys.filter((key) => key.startsWith('fa\0') || key.startsWith('ar\0')),
    },
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
      arabicFocusOrder: true,
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

function syntheticPreflightChecks() {
  const english = readJson(join(scriptsRoot, 'v5-i18n', 'en.json'));
  const runtimeKeys = [
    ...Object.keys(english.runtime?.quote?.js_string ?? {}).map((key) => `js_string.${key}`),
    ...Object.keys(english.runtime?.quote?.validation ?? {}).map((key) => `validation.${key}`),
  ];
  return {
    releaseI18n: {
      status: 'PASS',
      form: {
        locales: 9,
        quotePages: 9,
        passedPages: 9,
        formspreeTargets: 9,
        turnstileWidgets: 9,
        localeFields: 9,
        runtimeMessages: 126,
        runtimeMessageResults: Object.keys(V5_LOCALES).flatMap((locale) => (
          runtimeKeys.map((key) => ({ locale, key, passed: true }))
        )),
        realSubmissions: 0,
      },
    },
  };
}

function archiveCaseDefinitions(bundle, root) {
  const acceptance = syntheticAcceptance(bundle.manifest.sha256);
  const preflight = syntheticPreflightChecks();
  const mutateAcceptance = (mutation) => {
    const copy = structuredClone(acceptance);
    mutation(copy);
    return validateAcceptanceData(copy, bundle.manifest.sha256);
  };
  const mutatePreflight = (mutation) => {
    const copy = structuredClone(preflight);
    mutation(copy);
    return validatePreflightChecks(copy);
  };
  return [
    {
      name: 'old-package-identity', expectedSignal: 'Archive package identity must equal',
      mutate: () => validateArchiveIdentity({ candidatePackageName: 'zxrubbertech-v5-ja-ko-fa-release-candidate-2026-08-16-rc1' }),
    },
    {
      name: 'old-rollback-revision', expectedSignal: 'Archive rollback revision must equal',
      mutate: () => validateArchiveIdentity({ candidateRollbackRevision: '6f84d51dac660ff1bdb5a38c7cf87dbb69a0812f' }),
    },
    {
      name: 'old-release-public-pages-56', expectedSignal: 'publicPages=56, expected 63',
      mutate: () => validateReleaseReportData({ ...bundle.report, publicPages: 56 }),
    },
    {
      name: 'old-release-hreflang-504', expectedSignal: 'hreflangLinks=504, expected 630',
      mutate: () => validateReleaseReportData({ ...bundle.report, hreflangLinks: 504 }),
    },
    {
      name: 'old-release-sitemap-56', expectedSignal: 'sitemapUrls=56, expected 63',
      mutate: () => validateReleaseReportData({ ...bundle.report, sitemapUrls: 56 }),
    },
    {
      name: 'single-arabic-release-report', expectedSignal: 'localeIds must equal en, de, zh-CN, ru, tr, ja, ko, fa, ar',
      mutate: () => runWithMutatedReleaseRoot(root, (fixtureRoot) => {
        const file = join(fixtureRoot, 'v5-release-report.json');
        const report = readJson(file);
        report.locales = 1;
        report.localeIds = ['ar'];
        report.publicPages = 7;
        report.hreflangLinks = 14;
        report.sitemapUrls = 7;
        report.pages = report.pages.filter(({ locale }) => locale === 'ar');
        writeJson(file, report);
      }),
    },
    {
      name: 'old-http-count-81', expectedSignal: 'httpRoutes must equal 88',
      mutate: () => mutateAcceptance((copy) => { copy.httpRoutes = 81; copy.httpPassed = 81; }),
    },
    {
      name: 'old-browser-pages-56', expectedSignal: 'browserPages must equal 63',
      mutate: () => mutateAcceptance((copy) => { copy.browserPages = 56; }),
    },
    {
      name: 'old-browser-viewport-count-112', expectedSignal: 'pageViewportChecks must equal 126',
      mutate: () => mutateAcceptance((copy) => { copy.pageViewportChecks = 112; copy.pageViewportPassed = 112; }),
    },
    {
      name: 'old-total-rtl-count-14', expectedSignal: 'rtlViewportChecks must equal 28',
      mutate: () => mutateAcceptance((copy) => { copy.rtlViewportChecks = 14; }),
    },
    {
      name: 'missing-arabic-rtl-count', expectedSignal: 'arabicRtlViewportChecks must equal 14',
      mutate: () => mutateAcceptance((copy) => { delete copy.arabicRtlViewportChecks; }),
    },
    {
      name: 'wrong-arabic-exact-key-order', expectedSignal: 'interactionEvidence.exactArabicKeys keys/order are not exact',
      mutate: () => mutateAcceptance((copy) => {
        [copy.interactionEvidence.exactArabicKeys[0], copy.interactionEvidence.exactArabicKeys[1]] = [
          copy.interactionEvidence.exactArabicKeys[1], copy.interactionEvidence.exactArabicKeys[0],
        ];
      }),
    },
    {
      name: 'false-arabic-focus-order', expectedSignal: 'clickPaths.arabicFocusOrder must equal true',
      mutate: () => mutateAcceptance((copy) => { copy.clickPaths.arabicFocusOrder = false; }),
    },
    {
      name: 'old-browser-hreflang-count-9', expectedSignal: 'failed browser invariant',
      mutate: () => mutateAcceptance((copy) => { copy.browserResults[0].hreflangCount = 9; }),
    },
    {
      name: 'browser-delete-and-duplicate-preserving-126', expectedSignal: 'browser result order mismatch',
      mutate: () => mutateAcceptance((copy) => {
        copy.browserResults = [...copy.browserResults.slice(0, -1), structuredClone(copy.browserResults[0])];
      }),
    },
    {
      name: 'browser-reordered-preserving-126', expectedSignal: 'browser result order mismatch',
      mutate: () => mutateAcceptance((copy) => {
        [copy.browserResults[0], copy.browserResults[1]] = [copy.browserResults[1], copy.browserResults[0]];
      }),
    },
    {
      name: 'wrong-arabic-browser-record', expectedSignal: 'browser result order mismatch',
      mutate: () => mutateAcceptance((copy) => {
        const index = copy.browserResults.findIndex(({ locale }) => locale === 'ar');
        copy.browserResults[index].locale = 'fa';
      }),
    },
    {
      name: 'persian-delete-and-duplicate-preserving-14', expectedSignal: 'browser result order mismatch',
      mutate: () => mutateAcceptance((copy) => {
        const index = copy.browserResults.findIndex(({ locale }) => locale === 'fa');
        copy.browserResults[index] = structuredClone(copy.browserResults[0]);
      }),
    },
    {
      name: 'quote-validation-delete-and-duplicate-preserving-9', expectedSignal: 'exact ordered nine-locale array',
      mutate: () => mutateAcceptance((copy) => {
        const records = copy.interactionEvidence.quoteValidation;
        copy.interactionEvidence.quoteValidation = [...records.slice(0, -1), structuredClone(records[0])];
      }),
    },
    {
      name: 'quote-validation-reordered-preserving-9', expectedSignal: 'exact ordered nine-locale array',
      mutate: () => mutateAcceptance((copy) => {
        const records = copy.interactionEvidence.quoteValidation;
        [records[0], records[1]] = [records[1], records[0]];
      }),
    },
    {
      name: 'wrong-arabic-quote-record', expectedSignal: 'Quote no-submit evidence failed for ar',
      mutate: () => mutateAcceptance((copy) => {
        const record = copy.interactionEvidence.quoteValidation.find(({ locale }) => locale === 'ar');
        record.withoutTurnstile.hiddenLocale = 'fa';
      }),
    },
    {
      name: 'preflight-form-missing', expectedSignal: 'releaseI18n.form.quotePages must equal 9',
      mutate: () => mutatePreflight((copy) => { delete copy.releaseI18n.form; }),
    },
    {
      name: 'preflight-form-wrong-quote-pages', expectedSignal: 'releaseI18n.form.quotePages must equal 9',
      mutate: () => mutatePreflight((copy) => { copy.releaseI18n.form.quotePages = 8; }),
    },
    {
      name: 'preflight-form-wrong-runtime-messages', expectedSignal: 'releaseI18n.form.runtimeMessages must equal 126',
      mutate: () => mutatePreflight((copy) => { copy.releaseI18n.form.runtimeMessages = 112; }),
    },
    {
      name: 'preflight-form-runtime-order', expectedSignal: 'runtimeMessageResults mismatch at index 0',
      mutate: () => mutatePreflight((copy) => {
        const results = copy.releaseI18n.form.runtimeMessageResults;
        [results[0], results[1]] = [results[1], results[0]];
      }),
    },
    {
      name: 'release-manifest-binding', expectedSignal: 'releaseManifestSha256 must bind',
      mutate: () => mutateAcceptance((copy) => { copy.releaseManifestSha256 = '0'.repeat(64); }),
    },
    {
      name: 'formspree-intercepted-urls-missing', expectedSignal: 'formspreeInterceptedUrls must be an array',
      mutate: () => mutateAcceptance((copy) => { delete copy.formspreeInterceptedUrls; }),
    },
    {
      name: 'formspree-intercepted-urls-nonarray', expectedSignal: 'formspreeInterceptedUrls must be an array',
      mutate: () => mutateAcceptance((copy) => { copy.formspreeInterceptedUrls = {}; }),
    },
    {
      name: 'formspree-intercepted-urls-nonempty', expectedSignal: 'formspreeInterceptedUrls must be exactly empty',
      mutate: () => mutateAcceptance((copy) => { copy.formspreeInterceptedUrls = ['https://formspree.io/f/mrpzqado']; }),
    },
    {
      name: 'formspree-attempted-post-one', expectedSignal: 'formspreeAttemptedPostRequests must equal 0',
      mutate: () => mutateAcceptance((copy) => { copy.formspreeAttemptedPostRequests = 1; }),
    },
    {
      name: 'formspree-actual-post-one', expectedSignal: 'formspreePostRequests must equal 0',
      mutate: () => mutateAcceptance((copy) => { copy.formspreePostRequests = 1; }),
    },
    {
      name: 'archive-release-page-manifest-drift', expectedSignal: 'release page hash mismatch',
      mutate: () => runWithMutatedReleaseRoot(root, (fixtureRoot) => {
        const file = join(fixtureRoot, 'ar', 'index.html');
        writeFileSync(file, `${readFileSync(file, 'utf8')}\n`, 'utf8');
      }),
    },
    {
      name: 'archive-extra-release-file', expectedSignal: 'exactly 528 files; found 529',
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
    {
      name: 'archive-release-special-file', expectedSignal: 'unsupported file type',
      mutate: () => runWithMutatedReleaseRoot(root, (fixtureRoot) => {
        const result = spawnSync('/usr/bin/mkfifo', [join(fixtureRoot, 'extra-fifo')], { encoding: 'utf8' });
        if (result.status !== 0) throw new Error(`Unable to create archive FIFO fixture: ${result.stderr}`);
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
    greenMetrics: { releaseFiles: 528, publicPages: 63, hreflangLinks: 630, sitemapUrls: 63 },
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
    const missing = catalogLocales.filter((locale) => !existsSync(join(scriptsRoot, 'v5-i18n', `${locale}.json`)));
    if (missing.length) {
      const state = missing.includes('ar') ? ' deferred/missing-ar' : '';
      throw new CliError(`Catalog mutation suite${state}: complete registry catalogs required; missing: ${missing.join(', ')}`);
    }
    return catalogCaseDefinitions().map(runCatalogCase);
  }
  if (suite === 'release') {
    if (!root) throw new CliError('Release mutation suite requires --root=<complete-green-release>');
    const inventory = releaseInventoryMetrics(root);
    const expectedCanonicalPages = Object.keys(V5_LOCALES).length * V5_PAGE_STEMS.length;
    if (inventory.canonicalPages !== expectedCanonicalPages || inventory.missingFiles.length) {
      throw new CliError(`Release mutation suite requires all ${expectedCanonicalPages} canonical pages; found ${inventory.canonicalPages}`);
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
    validatePreflightChecks(syntheticPreflightChecks());
    return archiveCaseDefinitions(bundle, root).map((testCase) => runArchiveCase(bundle, testCase));
  }
  if (suite === 'all') {
    if (!root) throw new CliError('All mutation suites require --root=<complete-green-release>');
    const missing = catalogLocales.filter((locale) => !existsSync(join(scriptsRoot, 'v5-i18n', `${locale}.json`)));
    if (missing.length) {
      const state = missing.includes('ar') ? ' deferred/missing-ar' : '';
      throw new CliError(`All mutation suites${state}: complete registry catalogs required; missing: ${missing.join(', ')}`);
    }
    const bundle = validateReleaseBundle(root);
    validatePreflightChecks(syntheticPreflightChecks());
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
