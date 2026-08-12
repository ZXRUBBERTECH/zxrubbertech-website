import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const defaultRoot = join(repo, 'design-demos');

const SUPPORTED_GATES = new Set([
  'registry',
  'catalog',
  'controls',
  'release',
  'form',
  'retirement',
  'all',
]);
const SUPPORTED_PROFILES = new Set(['preview', 'release']);
const SUPPORTED_LOCALES = new Set(['en', 'de', 'zh-CN', 'ru', 'tr']);
const SUPPORTED_FLAGS = new Set(['gate', 'profile', 'root', 'locale']);

class V5I18nCliError extends Error {
  constructor(message) {
    super(message);
    this.name = 'V5I18nCliError';
    this.exitCode = 2;
  }
}

function parseCliArgs(argv) {
  const options = {};
  for (const argument of argv) {
    if (!argument.startsWith('--')) {
      throw new V5I18nCliError(`Unexpected positional argument: ${argument}`);
    }
    const equalsIndex = argument.indexOf('=');
    if (equalsIndex === -1) {
      throw new V5I18nCliError(`Flag requires a value: ${argument}`);
    }
    const name = argument.slice(2, equalsIndex);
    const value = argument.slice(equalsIndex + 1);
    if (!SUPPORTED_FLAGS.has(name)) {
      throw new V5I18nCliError(`Unknown flag: --${name}`);
    }
    if (Object.hasOwn(options, name)) {
      throw new V5I18nCliError(`Duplicate flag: --${name}`);
    }
    if (value.length === 0) {
      throw new V5I18nCliError(`Flag requires a non-empty value: --${name}`);
    }
    options[name] = value;
  }
  return options;
}

function normalizeOptions(options) {
  const { gate, profile, locale } = options;
  if (!gate) throw new V5I18nCliError('Missing required flag: --gate=<value>');
  if (!profile) throw new V5I18nCliError('Missing required flag: --profile=<value>');
  if (!SUPPORTED_GATES.has(gate)) throw new V5I18nCliError(`Unknown gate: ${gate}`);
  if (!SUPPORTED_PROFILES.has(profile)) throw new V5I18nCliError(`Unknown profile: ${profile}`);
  if (locale !== undefined && !SUPPORTED_LOCALES.has(locale)) {
    throw new V5I18nCliError(`Unknown locale: ${locale}`);
  }

  const root = resolve(options.root ?? defaultRoot);
  if (!existsSync(root)) throw new V5I18nCliError(`Root does not exist: ${root}`);
  let rootStat;
  try {
    rootStat = lstatSync(root);
  } catch (error) {
    throw new V5I18nCliError(`Cannot inspect root ${root}: ${error.message}`);
  }
  if (!rootStat.isDirectory()) throw new V5I18nCliError(`Root is not a directory: ${root}`);

  return { gate, profile, root, locale: locale ?? null };
}

function listFiles(root) {
  const files = [];
  const visit = (directory) => {
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch (error) {
      throw new V5I18nCliError(`Cannot read root inventory at ${directory}: ${error.message}`);
    }
    for (const entry of entries) {
      const absolutePath = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '.git' && entry.name !== 'node_modules') visit(absolutePath);
      } else if (entry.isFile()) {
        files.push(absolutePath);
      }
    }
  };
  visit(root);
  return files;
}

function validateJsonFiles(files, root) {
  for (const file of files.filter((candidate) => candidate.endsWith('.json'))) {
    try {
      JSON.parse(readFileSync(file, 'utf8'));
    } catch (error) {
      throw new V5I18nCliError(`Malformed JSON at ${relative(root, file)}: ${error.message}`);
    }
  }
}

function routeToReleaseFile(root, route) {
  const relativeRoute = route.replace(/^\//, '');
  return join(root, relativeRoute, 'index.html');
}

function discoverPageInventory({ profile, root }, config) {
  const pages = [];
  if (profile === 'preview') {
    for (const stem of config.V5_PAGE_STEMS) {
      const file = join(root, `${stem}-v5.html`);
      if (existsSync(file) && lstatSync(file).isFile()) pages.push(file);
    }
  } else {
    for (const locale of Object.keys(config.V5_LOCALES)) {
      for (const stem of config.V5_PAGE_STEMS) {
        const file = routeToReleaseFile(root, config.getLocalizedRoute(locale, stem));
        if (existsSync(file) && lstatSync(file).isFile()) pages.push(file);
      }
    }
  }
  if (pages.length === 0) {
    throw new V5I18nCliError(`Empty ${profile} page inventory under root: ${root}`);
  }
  return pages;
}

async function loadRegistry() {
  try {
    return await import('./v5-i18n-config.mjs');
  } catch (error) {
    throw new Error(`V5 locale registry is missing or invalid: ${error.message}`);
  }
}

function validateRegistry(config) {
  const failures = [];
  const expectedLocales = ['en', 'de', 'zh-CN', 'ru', 'tr'];
  const expectedStems = ['demo-a', 'products', 'compounds', 'industries', 'capabilities', 'faq', 'quote'];
  const expectedLocaleDefinitions = {
    en: { prefix: '', htmlLang: 'en', hreflang: 'en', ogLocale: 'en_US', label: 'English', shortLabel: 'EN', turnstileLanguage: 'en' },
    de: { prefix: 'de', htmlLang: 'de', hreflang: 'de', ogLocale: 'de_DE', label: 'Deutsch', shortLabel: 'DE', turnstileLanguage: 'de' },
    'zh-CN': { prefix: 'zh', htmlLang: 'zh-CN', hreflang: 'zh-CN', ogLocale: 'zh_CN', label: '简体中文', shortLabel: '中文', turnstileLanguage: 'zh-cn' },
    ru: { prefix: 'ru', htmlLang: 'ru', hreflang: 'ru', ogLocale: 'ru_RU', label: 'Русский', shortLabel: 'RU', turnstileLanguage: 'ru' },
    tr: { prefix: 'tr', htmlLang: 'tr', hreflang: 'tr', ogLocale: 'tr_TR', label: 'Türkçe', shortLabel: 'TR', turnstileLanguage: 'tr' },
  };
  const expectedEnglishRoutes = {
    'demo-a': '/',
    products: '/products/',
    compounds: '/rubber-compounds/',
    industries: '/industries/',
    capabilities: '/capabilities/',
    faq: '/faq/',
    quote: '/quote/',
  };
  const localeKeys = Object.keys(config.V5_LOCALES ?? {});
  const stems = Array.from(config.V5_PAGE_STEMS ?? []);

  if (JSON.stringify(localeKeys) !== JSON.stringify(expectedLocales)) {
    failures.push(`Locale registry must contain exactly: ${expectedLocales.join(', ')}`);
  }
  if (JSON.stringify(stems) !== JSON.stringify(expectedStems)) {
    failures.push(`Page registry must contain exactly: ${expectedStems.join(', ')}`);
  }
  if (!Object.isFrozen(config.V5_LOCALES) || !Object.isFrozen(config.V5_PAGE_STEMS)) {
    failures.push('Locale and page registries must be frozen');
  }

  const prefixes = new Set();
  for (const locale of localeKeys) {
    const definition = config.V5_LOCALES[locale];
    const expectedDefinition = expectedLocaleDefinitions[locale];
    if (!Object.isFrozen(definition)) failures.push(`Locale definition must be frozen: ${locale}`);
    if (!expectedDefinition || JSON.stringify(definition) !== JSON.stringify(expectedDefinition)) {
      failures.push(`Locale definition does not match the approved registry: ${locale}`);
    }
    const prefix = definition?.prefix;
    if (typeof prefix !== 'string') {
      failures.push(`Locale ${locale} has a malformed prefix`);
      continue;
    }
    if (prefixes.has(prefix)) failures.push(`Duplicate locale prefix: ${prefix}`);
    prefixes.add(prefix);
  }

  const routeSet = new Set();
  for (const locale of localeKeys) {
    for (const stem of stems) {
      let route;
      try {
        route = config.getLocalizedRoute(locale, stem);
      } catch (error) {
        failures.push(error.message);
        continue;
      }
      if (!/^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*\/)*$/.test(route)) {
        failures.push(`Noncanonical localized route for ${locale}/${stem}: ${String(route)}`);
      }
      const localePrefix = expectedLocaleDefinitions[locale]?.prefix;
      const expectedRoute = localePrefix === ''
        ? expectedEnglishRoutes[stem]
        : `/${localePrefix}${expectedEnglishRoutes[stem]}`;
      if (route !== expectedRoute) {
        failures.push(`Localized route for ${locale}/${stem} must equal ${expectedRoute}; got ${route}`);
      }
      try {
        const expectedUrl = new URL(expectedRoute, 'https://www.zxrubbertech.com').href;
        const url = config.getLocalizedUrl(locale, stem);
        if (url !== expectedUrl) {
          failures.push(`Localized URL for ${locale}/${stem} must equal ${expectedUrl}; got ${url}`);
        }
      } catch (error) {
        failures.push(error.message);
      }
      if (routeSet.has(route)) failures.push(`Duplicate localized route: ${route}`);
      routeSet.add(route);
    }
  }

  for (const stem of stems) {
    let cluster;
    try {
      cluster = config.getHreflangCluster(stem);
    } catch (error) {
      failures.push(error.message);
      continue;
    }
    if (!Array.isArray(cluster) || cluster.length !== 6) {
      failures.push(`Hreflang cluster for ${stem} must contain exactly 6 entries`);
      continue;
    }
    const hreflangs = cluster.map((entry) => entry.hreflang);
    const expectedHreflangs = ['en', 'de', 'zh-CN', 'ru', 'tr', 'x-default'];
    if (JSON.stringify(hreflangs) !== JSON.stringify(expectedHreflangs)) {
      failures.push(`Hreflang cluster for ${stem} must equal ${expectedHreflangs.join(', ')}`);
    }
    const english = cluster.find((entry) => entry.hreflang === 'en');
    const xDefault = cluster.find((entry) => entry.hreflang === 'x-default');
    if (!english || !xDefault || xDefault.url !== english.url || xDefault.route !== english.route) {
      failures.push(`x-default for ${stem} must equal the English equivalent`);
    }
  }

  const metrics = {
    locales: localeKeys.length,
    pageRoles: stems.length,
    routes: routeSet.size,
    hreflangsPerPage: stems.length > 0 ? config.getHreflangCluster(stems[0]).length : 0,
  };
  const exactMetrics = { locales: 5, pageRoles: 7, routes: 35, hreflangsPerPage: 6 };
  for (const [key, expected] of Object.entries(exactMetrics)) {
    if (metrics[key] !== expected) failures.push(`${key} must equal ${expected}; got ${metrics[key]}`);
  }

  return { failures, metrics };
}

export async function runV5I18nChecks(options) {
  const normalized = normalizeOptions(options);
  const files = listFiles(normalized.root);
  validateJsonFiles(files, normalized.root);
  const config = await loadRegistry();
  const inventory = discoverPageInventory(normalized, config);

  if (normalized.gate !== 'registry') {
    return {
      checker: 'v5-i18n',
      status: 'FAIL',
      gate: normalized.gate,
      profile: normalized.profile,
      root: normalized.root,
      locale: normalized.locale,
      inventoryPages: inventory.length,
      registry: null,
      failures: [`Gate ${normalized.gate} is not implemented in Gate M1`],
    };
  }

  const { failures, metrics } = validateRegistry(config);
  return {
    checker: 'v5-i18n',
    status: failures.length === 0 ? 'PASS' : 'FAIL',
    gate: normalized.gate,
    profile: normalized.profile,
    root: normalized.root,
    locale: normalized.locale,
    inventoryPages: inventory.length,
    registry: metrics,
    failures,
  };
}

async function main() {
  try {
    const options = parseCliArgs(process.argv.slice(2));
    const report = await runV5I18nChecks(options);
    process.stdout.write(`${JSON.stringify(report)}\n`);
    if (report.status !== 'PASS') process.exitCode = 1;
  } catch (error) {
    const exitCode = error instanceof V5I18nCliError ? 2 : 1;
    process.stderr.write(`${error.message}\n`);
    process.exitCode = exitCode;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
