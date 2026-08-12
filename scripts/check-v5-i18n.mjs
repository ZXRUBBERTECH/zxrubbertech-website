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

const REQUIRED_GLOSSARY_TERMS = Object.freeze([
  'rubber compound', 'molded rubber parts', 'rubber-to-metal bonding',
  'compression molding', 'injection molding', 'extrusion', 'tooling',
  'traceability', 'batch release', 'drawing', 'sample', 'project requirements',
]);

// Russian technical nouns inflect by number and grammatical case. Validate
// stable lexeme stems rather than forcing an ungrammatical nominative phrase
// into every sentence that contains the corresponding English source term.
const RUSSIAN_GLOSSARY_ROOTS = Object.freeze({
  'rubber compound': ['резинов', 'смес'],
  'molded rubber parts': ['формован', 'резинов'],
  'rubber-to-metal bonding': ['соединен', 'резин', 'металл'],
  'compression molding': ['компрессион', 'формован'],
  'injection molding': ['лить', 'давлен'],
  extrusion: ['экструз'],
  tooling: ['оснаст'],
  traceability: ['прослеживаем'],
  'batch release': ['при', 'парти'],
  drawing: ['черт'],
  sample: ['образ'],
  'project requirements': ['требован', 'проект'],
});

// Turkish is agglutinative, so glossary terms may receive case and possessive
// suffixes in natural sentences. Validate stable technical roots instead of
// requiring the exact dictionary form everywhere.
const TURKISH_GLOSSARY_ROOTS = Object.freeze({
  'rubber compound': ['kauçuk', 'karışım'],
  'molded rubber parts': ['kalıplanmış', 'kauçuk'],
  'rubber-to-metal bonding': ['kauçuk', 'metal', 'yapış'],
  'compression molding': ['sıkıştırma', 'kalıplama'],
  'injection molding': ['enjeksiyon', 'kalıplama'],
  extrusion: ['ekstrüzyon'],
  tooling: ['kalıp'],
  traceability: ['izlenebilir'],
  'batch release': ['parti', 'serbest'],
  drawing: ['teknik', 'resim'],
  sample: ['numune'],
  'project requirements': ['proje', 'gereksinim'],
});

// Explicit mainland Simplified Chinese guardrail. These variants are rejected
// only in the zh-CN catalog; other locales keep their existing QA rules.
const TRADITIONAL_CHINESE_VARIANTS = Object.freeze([
  '臺', '灣', '體', '製', '產', '業', '應', '對', '發', '佈', '圖', '樣',
  '項', '報', '驗', '證', '檢', '規', '範', '參', '數', '轉', '動', '門',
  '開', '關', '聯', '繫', '質', '線', '頁', '導', '與', '為', '從', '個',
  '機', '電', '車', '廠', '國', '華', '實', '際', '確', '認', '標',
  '準', '選', '擇', '詢', '價', '將', '內', '時', '間', '後', '處', '顯',
  '資', '訊', '輸', '錯', '誤', '請', '聯', '絡', '郵', '萬', '噸', '膠',
  '壓', '縮', '擠', '鋁', '鋼', '鐵', '環', '墊', '軸', '總', '專', '層',
  '單', '雙', '無', '復', '雜', '維', '護', '測', '試', '據', '備',
  '啟', '閉', '僅', '獲', '儲', '檔', '號', '碼', '統', '編', '輯', '刪',
]);

// Proper names, protected values and internationally established technical
// abbreviations may legitimately remain unchanged in a localized catalog.
// Everything else is subject to the residue comparison below.
const ENGLISH_RESIDUE_ALLOWLIST = Object.freeze([
  'ZHIXIN', 'ZHIXIN RUBBER MATERIAL', 'RUBBER MATERIAL',
  'ANHUI ZHIXIN MATERIAL TECHNOLOGY CO., LTD',
  'martin@zxrubbertech.com', 'https://wa.me/8615256225135',
  'WhatsApp', 'Formspree', 'Cloudflare', 'Turnstile', 'Google Maps',
  'Google', 'Amap', 'OpenStreetMap', 'ODbL',
  'Anhui', 'China', 'Ningguo', 'Xuancheng', 'Helixi', 'Waihuan',
  'East Road', 'Street',
  'English', 'Deutsch', '简体中文', 'Русский', 'Türkçe',
  'NR', 'SBR', 'CR', 'NBR', 'HNBR', 'EPDM', 'FKM', 'ACM', 'AEM',
  'MQ', 'NV', 'OEM', 'ODM', 'MOQ', 'CAE', 'CAD', 'NVH', 'LSR', 'PTFE',
  'HVAC', 'PPAP', 'NDA', 'EXW', 'FOB', 'ISO 9001:2015', 'TC', 'PVC',
  '3D', 'FAQ', 'HTTP', 'Extrusion', 'Material', 'Polymer', 'Navigation',
  'Engineering', 'Workstation', 'Name', 'Team', 'Links', 'flexible', 'Standard',
  'Pigment',
]);

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
  const pageRoot = profile === 'preview' && existsSync(join(root, 'design-demos'))
    ? join(root, 'design-demos')
    : root;
  if (profile === 'preview') {
    for (const stem of config.V5_PAGE_STEMS) {
      const file = join(pageRoot, `${stem}-v5.html`);
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

async function loadCatalogContract() {
  try {
    const [operations, transform] = await Promise.all([
      import('./v5-i18n-operations.mjs'),
      import('./v5-i18n-transform.mjs'),
    ]);
    return { operations, transform };
  } catch (error) {
    throw new Error(`V5 catalog contract is missing or invalid: ${error.message}`);
  }
}

function readJsonFile(file, label) {
  let parsed;
  try {
    if (!existsSync(file)) throw new Error('file does not exist');
    const info = lstatSync(file);
    if (info.isSymbolicLink() || !info.isFile()) throw new Error('expected a regular file');
    const source = new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(file));
    parsed = JSON.parse(source);
  } catch (error) {
    throw new Error(`${label} is missing or malformed at ${file}: ${error.message}`);
  }
  return parsed;
}

function catalogPaths(root, locale) {
  const fixtureCatalogRoot = join(root, 'scripts', 'v5-i18n');
  const fixtureBaseline = join(root, 'scripts', 'v5-i18n-baseline.json');
  const scriptsRoot = dirname(fileURLToPath(import.meta.url));
  const catalogRoot = existsSync(fixtureCatalogRoot) ? fixtureCatalogRoot : join(scriptsRoot, 'v5-i18n');
  return {
    catalogRoot,
    catalogFile: existsSync(fixtureCatalogRoot)
      ? join(fixtureCatalogRoot, `${locale}.json`)
      : join(scriptsRoot, 'v5-i18n', `${locale}.json`),
    glossaryFile: existsSync(join(fixtureCatalogRoot, 'glossary.json'))
      ? join(fixtureCatalogRoot, 'glossary.json')
      : join(scriptsRoot, 'v5-i18n', 'glossary.json'),
    baselineFile: existsSync(fixtureBaseline)
      ? fixtureBaseline
      : join(scriptsRoot, 'v5-i18n-baseline.json'),
  };
}

function validateGlossary(glossary, locale) {
  const failures = [];
  if (!glossary || typeof glossary !== 'object' || Array.isArray(glossary)) return ['V5 i18n glossary must be an object'];
  if (glossary.schemaVersion !== 1 || glossary.sourceLocale !== 'en') failures.push('V5 i18n glossary must use schemaVersion 1 and sourceLocale en');
  const requiredLiterals = [
    'ZHIXIN RUBBER MATERIAL',
    'ANHUI ZHIXIN MATERIAL TECHNOLOGY CO., LTD',
    'martin@zxrubbertech.com',
    '+86 152 5622 5135',
    'https://wa.me/8615256225135',
    'mrpzqado',
    '0x4AAAAAAENHOMMn_zK0WuNN',
    'NR', 'SBR', 'CR', 'NBR', 'HNBR', 'EPDM', 'FKM', 'ACM', 'AEM', 'OEM', 'ODM', 'MOQ',
  ];
  if (!Array.isArray(glossary.preservedLiterals)
      || glossary.preservedLiterals.some((value) => typeof value !== 'string' || !value)
      || new Set(glossary.preservedLiterals).size !== glossary.preservedLiterals.length) {
    failures.push('V5 i18n glossary preservedLiterals must be unique nonempty strings');
  } else {
    for (const literal of requiredLiterals) {
      if (!glossary.preservedLiterals.includes(literal)) failures.push(`V5 i18n glossary is missing preserved literal: ${literal}`);
    }
  }
  if (!glossary.terms || typeof glossary.terms !== 'object' || Array.isArray(glossary.terms)) {
    failures.push('V5 i18n glossary terms must be an object');
  } else {
    for (const term of REQUIRED_GLOSSARY_TERMS) {
      const definition = glossary.terms[term];
      if (!definition || typeof definition !== 'object' || Array.isArray(definition)
          || typeof definition.en !== 'string' || !definition.en.trim()) {
        failures.push(`V5 i18n glossary is missing English term: ${term}`);
      } else if (locale !== 'en'
          && (typeof definition[locale] !== 'string' || !definition[locale].trim())) {
        failures.push(`V5 i18n glossary is missing ${locale} term: ${term}`);
      }
    }
  }
  return failures;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function countLiteral(value, literal) {
  return value.split(literal).length - 1;
}

function normalizeCatalogText(value) {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&apos;', "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function maskResidueAllowlist(value, glossary) {
  let masked = normalizeCatalogText(value)
    .replace(/https?:\/\/\S+|\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, ' ');
  const phrases = [...ENGLISH_RESIDUE_ALLOWLIST, ...(glossary.preservedLiterals ?? [])]
    .sort((left, right) => right.length - left.length);
  for (const phrase of phrases) {
    masked = masked.replace(new RegExp(escapeRegExp(phrase), 'giu'), ' ');
  }
  return masked.replace(/\s+/g, ' ').trim();
}

function asciiWordSet(value) {
  return new Set([...value.matchAll(/[A-Za-z][A-Za-z'-]{2,}/g)].map((match) => match[0].toLowerCase()));
}

function validateEnglishResidue(locale, english, localized, glossary, operations) {
  if (locale === 'en') return [];
  const failures = [];
  const preservedOperationKeys = new Set(operations.filter(({ preserve }) => preserve).map(({ key }) => key));
  for (const [key, englishValue] of Object.entries(english)) {
    const localizedValue = localized[key];
    if (preservedOperationKeys.has(key)) continue;
    const maskedEnglish = maskResidueAllowlist(englishValue, glossary);
    const maskedLocalized = maskResidueAllowlist(localizedValue, glossary);
    if (!maskedEnglish || !maskedLocalized) continue;
    const englishWords = asciiWordSet(maskedEnglish);
    const localizedWords = asciiWordSet(maskedLocalized);
    if (!englishWords.size || !localizedWords.size) continue;
    if (maskedEnglish.toLocaleLowerCase('en') === maskedLocalized.toLocaleLowerCase('en')) {
      failures.push(`${locale}: unapproved unchanged English value: ${key}`);
      continue;
    }
    const residues = [...localizedWords].filter((word) => englishWords.has(word)).sort();
    if (residues.length) {
      failures.push(`${locale}: unapproved English residue at ${key}: ${residues.join(', ')}`);
    }
  }
  return failures;
}

function validateSimplifiedChineseCatalog(locale, english, localized, glossary, operations) {
  if (locale !== 'zh-CN') return {
    failures: [], cjkChecks: 0, traditionalFindings: 0, residueFindings: 0,
  };
  const failures = [];
  let cjkChecks = 0;
  let traditionalFindings = 0;
  let residueFindings = 0;
  const preservedOperationKeys = new Set(operations.filter(({ preserve }) => preserve).map(({ key }) => key));
  for (const [key, localizedValue] of Object.entries(localized)) {
    const text = normalizeCatalogText(localizedValue);
    for (const variant of TRADITIONAL_CHINESE_VARIANTS) {
      if (!text.includes(variant)) continue;
      traditionalFindings += countLiteral(text, variant);
      failures.push(`zh-CN: Traditional Chinese variant ${JSON.stringify(variant)} at ${key}`);
    }
    if (preservedOperationKeys.has(key)) continue;
    const englishText = maskResidueAllowlist(english[key], glossary);
    if (asciiWordSet(englishText).size < 2) continue;
    cjkChecks += 1;
    const localizedText = maskResidueAllowlist(localizedValue, glossary);
    if (!/\p{Script=Han}/u.test(localizedText)) {
      failures.push(`zh-CN: localized prose must contain Simplified Chinese characters at ${key}`);
    }
    const residues = [...asciiWordSet(localizedText)].sort();
    if (residues.length) {
      residueFindings += residues.length;
      failures.push(`zh-CN: unapproved ASCII residue at ${key}: ${residues.join(', ')}`);
    }
  }
  return { failures, cjkChecks, traditionalFindings, residueFindings };
}

function validateRussianCatalog(locale, english, localized, glossary, operations) {
  if (locale !== 'ru') return { failures: [], cyrillicChecks: 0, residueFindings: 0 };
  const failures = [];
  let cyrillicChecks = 0;
  let residueFindings = 0;
  const preservedOperationKeys = new Set(operations.filter(({ preserve }) => preserve).map(({ key }) => key));
  for (const [key, localizedValue] of Object.entries(localized)) {
    if (preservedOperationKeys.has(key)) continue;
    const englishText = maskResidueAllowlist(english[key], glossary);
    if (asciiWordSet(englishText).size < 2) continue;
    cyrillicChecks += 1;
    const localizedText = maskResidueAllowlist(localizedValue, glossary);
    if (!/\p{Script=Cyrillic}/u.test(localizedText)) {
      failures.push(`ru: localized prose must contain Cyrillic characters at ${key}`);
    }
    const residues = [...asciiWordSet(localizedText)].sort();
    if (residues.length) {
      residueFindings += residues.length;
      failures.push(`ru: unapproved ASCII residue at ${key}: ${residues.join(', ')}`);
    }
  }
  return { failures, cyrillicChecks, residueFindings };
}

function validateTurkishCatalog(locale, english, localized, glossary, operations) {
  if (locale !== 'tr') return {
    failures: [], latinChecks: 0, turkishCharacterOccurrences: 0, foreignScriptFindings: 0,
  };
  const failures = [];
  let latinChecks = 0;
  let turkishCharacterOccurrences = 0;
  let foreignScriptFindings = 0;
  const preservedOperationKeys = new Set(operations.filter(({ preserve }) => preserve).map(({ key }) => key));
  for (const [key, localizedValue] of Object.entries(localized)) {
    if (preservedOperationKeys.has(key)) continue;
    const englishText = maskResidueAllowlist(english[key], glossary);
    if (asciiWordSet(englishText).size < 2) continue;
    latinChecks += 1;
    const localizedText = maskResidueAllowlist(localizedValue, glossary);
    if (!/\p{Script=Latin}/u.test(localizedText)) {
      failures.push(`tr: localized prose must contain Latin-script Turkish text at ${key}`);
    }
    const foreignScripts = localizedText.match(/[\p{Script=Han}\p{Script=Cyrillic}]/gu) ?? [];
    if (foreignScripts.length) {
      foreignScriptFindings += foreignScripts.length;
      failures.push(`tr: foreign-script residue at ${key}: ${foreignScripts.join('')}`);
    }
    turkishCharacterOccurrences += (localizedText.match(/[\u00e7\u011f\u0131\u0130\u00f6\u015f\u00fc]/giu) ?? []).length;
  }
  if (latinChecks > 0 && turkishCharacterOccurrences === 0) {
    failures.push('tr: catalog contains no Turkish-specific UTF-8 characters');
  }
  return { failures, latinChecks, turkishCharacterOccurrences, foreignScriptFindings };
}

function validateVerifiedFacts(locale, english, localized, glossary) {
  if (!['zh-CN', 'ru', 'tr'].includes(locale)) return { failures: [], checks: 0 };
  const failures = [];
  let checks = 0;
  const facts = glossary.verifiedFacts;
  const renderings = glossary.verifiedFactRenderings?.[locale];
  if (!facts || typeof facts !== 'object' || Array.isArray(facts)
      || !renderings || typeof renderings !== 'object' || Array.isArray(renderings)) {
    return { failures: [`${locale}: glossary must define verified facts and localized renderings`], checks };
  }
  for (const [fact, englishNeedle] of Object.entries(facts)) {
    const localizedNeedle = renderings[fact];
    if (typeof englishNeedle !== 'string' || !englishNeedle
        || typeof localizedNeedle !== 'string' || !localizedNeedle) {
      failures.push(`${locale}: malformed verified fact rendering: ${fact}`);
      continue;
    }
    let occurrences = 0;
    for (const [key, englishValue] of Object.entries(english)) {
      const expected = countLiteral(englishValue, englishNeedle);
      if (!expected) continue;
      occurrences += expected;
      checks += expected;
      const actual = countLiteral(localized[key], localizedNeedle);
      if (actual !== expected) {
        failures.push(`${locale}: verified fact ${fact} at ${key} expected ${expected} renderings, found ${actual}`);
      }
    }
    if (!occurrences) failures.push(`${locale}: verified fact source text is unused: ${fact}`);
  }
  const unknown = Object.keys(renderings).filter((fact) => !Object.hasOwn(facts, fact));
  if (unknown.length) failures.push(`${locale}: unknown verified fact rendering: ${unknown[0]}`);
  return { failures, checks };
}

function validatePreservedCatalogLiterals(locale, english, localized, glossary, operations) {
  if (locale === 'en') return { failures: [], occurrences: 0 };
  const failures = [];
  let occurrences = 0;
  for (const literal of glossary.preservedLiterals ?? []) {
    for (const [key, englishValue] of Object.entries(english)) {
      const expected = countLiteral(englishValue, literal);
      const actual = countLiteral(localized[key], literal);
      occurrences += expected;
      if (actual !== expected) {
        failures.push(`${locale}: preserved literal ${JSON.stringify(literal)} at ${key} expected ${expected} occurrences, found ${actual}`);
      }
    }
  }
  for (const operation of operations.filter(({ preserve }) => preserve)) {
    if (localized[operation.key] !== english[operation.key]) {
      failures.push(`${locale}: operation-preserved value changed at ${operation.key}`);
    }
  }
  return { failures, occurrences };
}

function validateGlossaryConformance(locale, english, localized, glossary) {
  if (locale === 'en') return { failures: [], checks: 0 };
  const failures = [];
  let checks = 0;
  for (const term of REQUIRED_GLOSSARY_TERMS) {
    const preferred = glossary.terms?.[term]?.[locale];
    if (typeof preferred !== 'string' || !preferred.trim()) continue;
    const englishNeedle = term.toLocaleLowerCase('en');
    const localizedNeedle = normalizeCatalogText(preferred).toLocaleLowerCase(locale);
    for (const [key, englishValue] of Object.entries(english)) {
      if (!normalizeCatalogText(englishValue).toLocaleLowerCase('en').includes(englishNeedle)) continue;
      checks += 1;
      const localizedText = normalizeCatalogText(localized[key]).toLocaleLowerCase(locale);
      const matchesPreferred = locale === 'ru'
        ? RUSSIAN_GLOSSARY_ROOTS[term].every((root) => localizedText.includes(root))
        : locale === 'tr'
          ? TURKISH_GLOSSARY_ROOTS[term].every((root) => localizedText.includes(root))
          : localizedText.includes(localizedNeedle);
      if (!matchesPreferred) {
        failures.push(`${locale}: glossary term ${JSON.stringify(term)} is not rendered as ${JSON.stringify(preferred)} at ${key}`);
      }
    }
  }
  return { failures, checks };
}

function normalizeEnglishSerialization(value) {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&apos;', "'");
}

function validateCatalogGate(normalized, config, inventory, operationsModule, transformModule) {
  const failures = [];
  const locale = normalized.locale;
  if (!locale) {
    return {
      failures: ['Catalog gate requires --locale=<approved-locale>'],
      metrics: null,
    };
  }
  const { catalogRoot, catalogFile, glossaryFile, baselineFile } = catalogPaths(normalized.root, locale);
  let catalog;
  let flattened;
  let glossary = null;
  try {
    catalog = readJsonFile(catalogFile, `${locale} V5 catalog`);
    flattened = transformModule.validateV5Catalog(locale, catalog);
  } catch (error) {
    return { failures: [error.message], metrics: null };
  }
  try {
    glossary = readJsonFile(glossaryFile, 'V5 i18n glossary');
    failures.push(...validateGlossary(glossary, locale));
  } catch (error) {
    failures.push(error.message);
  }
  for (const [key, value] of Object.entries(flattened)) {
    if (/\b(?:TODO|TBD|TRANSLATE_ME)\b/i.test(value)) failures.push(`Unfinished V5 catalog value: ${key}`);
  }

  const operations = operationsModule.V5_I18N_OPERATIONS;
  const operationKeys = operations.map(({ key }) => key);
  const uniqueOperationKeys = new Set(operationKeys);
  if (uniqueOperationKeys.size !== operationKeys.length) failures.push('V5 i18n operation keys must be unique');
  for (const kind of operationsModule.V5_I18N_OPERATION_KINDS) {
    if (!['html-text', 'html-fragment', 'attribute', 'js-string'].includes(kind)) {
      failures.push(`Unsupported V5 i18n operation kind: ${kind}`);
    }
  }
  for (const operation of operations) {
    if (!Object.hasOwn(flattened, operation.key)) failures.push(`Operation references unknown catalog key: ${operation.key}`);
    if (locale === 'en' && flattened[operation.key] !== operation.english) {
      failures.push(`English catalog/source mismatch: ${operation.key}`);
    }
    if (!['html-text', 'html-fragment', 'attribute', 'js-string'].includes(operation.kind)) {
      failures.push(`${operation.key}: invalid operation kind ${operation.kind}`);
    }
    if (!Array.isArray(operation.stems) || !operation.stems.length) failures.push(`${operation.key}: empty stem coverage`);
    for (const stem of operation.stems ?? []) {
      if (!config.V5_PAGE_STEMS.includes(stem)) failures.push(`${operation.key}: unknown stem ${stem}`);
      if (!Number.isInteger(operation.expectedByStem?.[stem]) || operation.expectedByStem[stem] < 1) {
        failures.push(`${operation.key}: invalid expected count for ${stem}`);
      }
    }
  }

  const consumedBodyKeys = new Set(operationKeys);
  for (const key of Object.keys(flattened)) {
    if (key.startsWith('seo.')) continue;
    if (!consumedBodyKeys.has(key)) failures.push(`Unconsumed V5 catalog key: ${key}`);
  }
  for (const key of consumedBodyKeys) {
    if (!Object.hasOwn(flattened, key)) failures.push(`Missing V5 catalog key: ${key}`);
  }

  for (const stem of config.V5_PAGE_STEMS) {
    const seoKeys = Object.keys(catalog.seo[stem] ?? {});
    if (JSON.stringify(seoKeys) !== JSON.stringify(['title', 'description', 'breadcrumb'])) {
      failures.push(`seo.${stem} must contain exactly title, description, breadcrumb`);
    }
  }

  let currentBaseline;
  try {
    const acceptedBaseline = readJsonFile(baselineFile, 'V5 i18n baseline');
    const englishCatalog = locale === 'en'
      ? catalog
      : readJsonFile(join(catalogRoot, 'en.json'), 'English V5 catalog');
    transformModule.validateV5Catalog('en', englishCatalog);
    currentBaseline = transformModule.buildV5I18nBaseline(englishCatalog, operations);
    if (JSON.stringify(currentBaseline) !== JSON.stringify(acceptedBaseline)) {
      const acceptedKeys = new Set(acceptedBaseline.keys ?? []);
      const currentKeys = new Set(currentBaseline.keys ?? []);
      const missing = [...acceptedKeys].filter((key) => !currentKeys.has(key));
      const added = [...currentKeys].filter((key) => !acceptedKeys.has(key));
      if (missing.length) failures.push(`Baseline catalog key missing: ${missing[0]}`);
      if (added.length) failures.push(`Unexpected baseline catalog key: ${added[0]}`);
      if (!missing.length && !added.length) failures.push('V5 i18n baseline hashes or operation inventory changed');
    }
  } catch (error) {
    failures.push(error.message);
  }

  let englishRoundTrip = null;
  let glossaryChecks = 0;
  let preservedOccurrences = 0;
  let englishResidueFindings = 0;
  let cjkChecks = 0;
  let traditionalVariantFindings = 0;
  let cyrillicChecks = 0;
  let turkishLatinChecks = 0;
  let turkishCharacterOccurrences = 0;
  let foreignScriptFindings = 0;
  let verifiedFactChecks = 0;
  if (locale === 'en') {
    englishRoundTrip = true;
    for (const stem of config.V5_PAGE_STEMS) {
      const file = inventory.find((candidate) => candidate.endsWith(`/${stem}-v5.html`));
      if (!file) {
        failures.push(`Missing accepted English preview for semantic round-trip: ${stem}`);
        englishRoundTrip = false;
        continue;
      }
      try {
        const source = readFileSync(file, 'utf8');
        const localized = transformModule.applyV5LocalizationOperations(source, { stem, locale, catalog });
        if (normalizeEnglishSerialization(localized) !== normalizeEnglishSerialization(source)) {
          failures.push(`${stem}: English localization changed approved text semantics`);
          englishRoundTrip = false;
        }
      } catch (error) {
        failures.push(error.message);
        englishRoundTrip = false;
      }
    }
  } else {
    const english = readJsonFile(join(catalogRoot, 'en.json'), 'English V5 catalog');
    const flattenedEnglish = transformModule.validateV5Catalog('en', english);
    const englishKeys = Object.keys(flattenedEnglish).sort();
    const localeKeys = Object.keys(flattened).sort();
    if (JSON.stringify(localeKeys) !== JSON.stringify(englishKeys)) failures.push(`${locale}: catalog key set differs from English`);
    if (glossary) {
      const glossaryResult = validateGlossaryConformance(locale, flattenedEnglish, flattened, glossary);
      glossaryChecks = glossaryResult.checks;
      failures.push(...glossaryResult.failures);

      const preservedResult = validatePreservedCatalogLiterals(
        locale,
        flattenedEnglish,
        flattened,
        glossary,
        operations,
      );
      preservedOccurrences = preservedResult.occurrences;
      failures.push(...preservedResult.failures);

      const residueFailures = validateEnglishResidue(locale, flattenedEnglish, flattened, glossary, operations);
      englishResidueFindings = residueFailures.length;
      failures.push(...residueFailures);

      const chineseResult = validateSimplifiedChineseCatalog(
        locale,
        flattenedEnglish,
        flattened,
        glossary,
        operations,
      );
      cjkChecks = chineseResult.cjkChecks;
      traditionalVariantFindings = chineseResult.traditionalFindings;
      englishResidueFindings += chineseResult.residueFindings;
      failures.push(...chineseResult.failures);

      const russianResult = validateRussianCatalog(
        locale,
        flattenedEnglish,
        flattened,
        glossary,
        operations,
      );
      cyrillicChecks = russianResult.cyrillicChecks;
      englishResidueFindings += russianResult.residueFindings;
      failures.push(...russianResult.failures);

      const turkishResult = validateTurkishCatalog(
        locale,
        flattenedEnglish,
        flattened,
        glossary,
        operations,
      );
      turkishLatinChecks = turkishResult.latinChecks;
      turkishCharacterOccurrences = turkishResult.turkishCharacterOccurrences;
      foreignScriptFindings = turkishResult.foreignScriptFindings;
      failures.push(...turkishResult.failures);

      const factResult = validateVerifiedFacts(locale, flattenedEnglish, flattened, glossary);
      verifiedFactChecks = factResult.checks;
      failures.push(...factResult.failures);
    }
  }

  return {
    failures,
    metrics: currentBaseline ? {
      locale,
      catalogKeys: currentBaseline.keyCount,
      operations: currentBaseline.operationCount,
      operationsByKind: currentBaseline.operationCountsByKind,
      operationsByStem: currentBaseline.operationCountsByStem,
      englishRoundTrip,
      catalogRoot,
      glossaryTerms: REQUIRED_GLOSSARY_TERMS.length,
      glossaryChecks,
      preservedLiterals: glossary?.preservedLiterals?.length ?? 0,
      preservedOccurrences,
      englishResidueAllowlist: ENGLISH_RESIDUE_ALLOWLIST.length,
      englishResidueFindings,
      cjkChecks,
      traditionalChineseVariantList: TRADITIONAL_CHINESE_VARIANTS.length,
      traditionalVariantFindings,
      cyrillicChecks,
      turkishLatinChecks,
      turkishCharacterOccurrences,
      foreignScriptFindings,
      verifiedFactChecks,
    } : null,
  };
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

function decodeControlText(value) {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>');
}

function markerCount(html, marker) {
  return html.split(marker).length - 1;
}

function extractControlGroup(html, name, label, failures) {
  const start = `<!-- V5:LANGUAGE ${name} START -->`;
  const end = `<!-- V5:LANGUAGE ${name} END -->`;
  const starts = markerCount(html, start);
  const ends = markerCount(html, end);
  if (starts !== 1 || ends !== 1) {
    failures.push(`${label}: expected one ${name.toLowerCase()} language-control group; found ${starts}/${ends} markers`);
    return null;
  }
  const startIndex = html.indexOf(start) + start.length;
  const endIndex = html.indexOf(end, startIndex);
  if (endIndex < startIndex) {
    failures.push(`${label}: malformed ${name.toLowerCase()} language-control markers`);
    return null;
  }
  return html.slice(startIndex, endIndex);
}

function parseControlAnchors(group) {
  return [...group.matchAll(/<a\s+([^>]*\bdata-language-link\b[^>]*)>([\s\S]*?)<\/a>/gi)].map((match) => {
    const attributes = {};
    for (const attribute of match[1].matchAll(/([:\w-]+)(?:="([^"]*)")?/g)) {
      attributes[attribute[1]] = attribute[2] ?? true;
    }
    return { attributes, text: decodeControlText(match[2].replace(/<[^>]+>/g, '').trim()) };
  });
}

function validateControlGroup(group, groupName, locale, stem, config, label, failures) {
  if (!group) return 0;
  const rootSignatures = {
    DESKTOP: '<div class="v5-language-switcher"',
    MOBILE: '<nav class="v5-language-mobile"',
    FOOTER: '<nav class="v5-language-footer"',
  };
  if (!group.includes(rootSignatures[groupName])) {
    failures.push(`${label}: ${groupName.toLowerCase()} language-control root is missing`);
  }
  const anchors = parseControlAnchors(group);
  if (anchors.length !== 5) {
    failures.push(`${label}: ${groupName.toLowerCase()} language control must contain 5 real anchors; found ${anchors.length}`);
    return anchors.length;
  }
  const expectedLocales = Object.keys(config.V5_LOCALES);
  if (JSON.stringify(anchors.map(({ attributes }) => attributes['data-locale'])) !== JSON.stringify(expectedLocales)) {
    failures.push(`${label}: ${groupName.toLowerCase()} language anchors are not in registry order`);
  }
  for (let index = 0; index < expectedLocales.length; index += 1) {
    const expectedLocale = expectedLocales[index];
    const definition = config.V5_LOCALES[expectedLocale];
    const { attributes, text } = anchors[index];
    const expectedRoute = config.getLocalizedRoute(expectedLocale, stem);
    if (attributes.href !== expectedRoute) {
      failures.push(`${label}: ${groupName.toLowerCase()} ${expectedLocale} href must equal ${expectedRoute}; got ${String(attributes.href)}`);
    }
    if (attributes.hreflang !== definition.hreflang || attributes.lang !== definition.htmlLang) {
      failures.push(`${label}: ${groupName.toLowerCase()} ${expectedLocale} language attributes do not match the registry`);
    }
    if (text !== definition.label) {
      failures.push(`${label}: ${groupName.toLowerCase()} ${expectedLocale} label must equal ${definition.label}; got ${text}`);
    }
    const isCurrent = attributes['aria-current'] === 'page';
    if (isCurrent !== (expectedLocale === locale)) {
      failures.push(`${label}: ${groupName.toLowerCase()} ${expectedLocale} aria-current state is incorrect`);
    }
    if (groupName === 'DESKTOP' && attributes.role !== 'menuitem') {
      failures.push(`${label}: desktop ${expectedLocale} anchor must use role=menuitem`);
    }
  }
  if (anchors.filter(({ attributes }) => attributes['aria-current'] === 'page').length !== 1) {
    failures.push(`${label}: ${groupName.toLowerCase()} control must expose exactly one aria-current=page`);
  }
  return anchors.length;
}

function releaseFileFor(root, route) {
  return routeToReleaseFile(root, route);
}

function validateControlsGate(normalized, config, inventory) {
  const failures = [];
  if (!normalized.locale) {
    return { failures: ['Controls gate requires --locale=<approved-locale>'], metrics: null };
  }
  const locale = normalized.locale;
  if (inventory.length !== config.V5_PAGE_STEMS.length) {
    failures.push(`Controls inventory must contain exactly ${config.V5_PAGE_STEMS.length} pages for ${locale}; found ${inventory.length}`);
  }

  let totalAnchors = 0;
  let passedPages = 0;
  for (const stem of config.V5_PAGE_STEMS) {
    const expectedFile = normalized.profile === 'preview'
      ? join(normalized.root, `${stem}-v5.html`)
      : releaseFileFor(normalized.root, config.getLocalizedRoute(locale, stem));
    const label = `${locale}/${stem}`;
    if (!inventory.includes(expectedFile)) {
      failures.push(`${label}: expected page is missing from controls inventory: ${relative(normalized.root, expectedFile)}`);
      continue;
    }
    const pageFailuresBefore = failures.length;
    const html = readFileSync(expectedFile, 'utf8');
    const desktop = extractControlGroup(html, 'DESKTOP', label, failures);
    const mobile = extractControlGroup(html, 'MOBILE', label, failures);
    const footer = extractControlGroup(html, 'FOOTER', label, failures);
    totalAnchors += validateControlGroup(desktop, 'DESKTOP', locale, stem, config, label, failures);
    totalAnchors += validateControlGroup(mobile, 'MOBILE', locale, stem, config, label, failures);
    totalAnchors += validateControlGroup(footer, 'FOOTER', locale, stem, config, label, failures);

    if (desktop && (!desktop.includes('aria-expanded="false"')
      || !desktop.includes('aria-controls="v5-language-menu"')
      || !desktop.includes('aria-haspopup="menu"')
      || !desktop.includes('role="menu"'))) {
      failures.push(`${label}: desktop language menu is missing its accessible button/menu contract`);
    }
    if (mobile && !mobile.includes('aria-label="Language"')) failures.push(`${label}: mobile language control needs an accessible label`);
    if (footer && (!footer.includes('aria-label="Language"') || !footer.includes('<span>Language:</span>'))) {
      failures.push(`${label}: Footer language row is missing its accessible label`);
    }
    if (markerCount(html, '/* V5:LANGUAGE CONTROLS START */') !== 1
      || markerCount(html, '/* V5:LANGUAGE CONTROLS END */') !== 1) {
      failures.push(`${label}: scoped language-control CSS is missing or duplicated`);
    }
    if (markerCount(html, '<!-- V5:LANGUAGE SCRIPT START -->') !== 1
      || markerCount(html, '<!-- V5:LANGUAGE SCRIPT END -->') !== 1) {
      failures.push(`${label}: progressive-enhancement language script is missing or duplicated`);
    }
    if (/class="(?:lang|mlang)"|Preview — English only/.test(html)) {
      failures.push(`${label}: accepted nonfunctional language placeholder remains`);
    }
    const stateScript = html.match(/<!-- V5:LANGUAGE SCRIPT START -->([\s\S]*?)<!-- V5:LANGUAGE SCRIPT END -->/)?.[1] ?? '';
    for (const fragment of ['c-automotive', 'c-sealing', 'c-appliance', 'c-industrial', 'c-industrial-diaphragms', 'compound-primary', 'contact']) {
      if (!stateScript.includes(`"${fragment}"`)) failures.push(`${label}: state script is missing approved fragment ${fragment}`);
    }
    if (!stateScript.includes("searchParams.get('industry')")) failures.push(`${label}: state script is missing approved industry query preservation`);
    if (/document\.cookie|localStorage|sessionStorage|location\.(?:assign|replace)\s*\(|(?:window\.)?location(?:\.href)?\s*=|window\.open\s*\(/.test(stateScript)) {
      failures.push(`${label}: language controls must not persist state or navigate automatically`);
    }
    if (failures.length === pageFailuresBefore) passedPages += 1;
  }

  const expectedTotalAnchors = config.V5_PAGE_STEMS.length * 15;
  if (totalAnchors !== expectedTotalAnchors) {
    failures.push(`Controls bundle must contain ${expectedTotalAnchors} language anchors; found ${totalAnchors}`);
  }
  return {
    failures,
    metrics: {
      locale,
      pages: config.V5_PAGE_STEMS.length,
      passedPages,
      controlGroupsPerPage: 3,
      anchorsPerGroup: 5,
      anchorsPerPage: 15,
      totalAnchors,
    },
  };
}

export async function runV5I18nChecks(options) {
  const normalized = normalizeOptions(options);
  const files = listFiles(normalized.root);
  validateJsonFiles(files, normalized.root);
  const config = await loadRegistry();
  const inventory = discoverPageInventory(normalized, config);

  if (!['registry', 'catalog', 'controls'].includes(normalized.gate)) {
    return {
      checker: 'v5-i18n',
      status: 'FAIL',
      gate: normalized.gate,
      profile: normalized.profile,
      root: normalized.root,
      locale: normalized.locale,
      inventoryPages: inventory.length,
      registry: null,
      failures: [`Gate ${normalized.gate} is not implemented through Gate M3`],
    };
  }

  let failures;
  let metrics;
  let catalog = null;
  let controls = null;
  if (normalized.gate === 'registry') {
    ({ failures, metrics } = validateRegistry(config));
  } else if (normalized.gate === 'catalog') {
    const contract = await loadCatalogContract();
    const result = validateCatalogGate(normalized, config, inventory, contract.operations, contract.transform);
    const registryResult = validateRegistry(config);
    failures = [...registryResult.failures, ...result.failures];
    metrics = registryResult.metrics;
    catalog = result.metrics;
  } else {
    const registryResult = validateRegistry(config);
    const result = validateControlsGate(normalized, config, inventory);
    failures = [...registryResult.failures, ...result.failures];
    metrics = registryResult.metrics;
    controls = result.metrics;
  }
  return {
    checker: 'v5-i18n',
    status: failures.length === 0 ? 'PASS' : 'FAIL',
    gate: normalized.gate,
    profile: normalized.profile,
    root: normalized.root,
    locale: normalized.locale,
    inventoryPages: inventory.length,
    registry: metrics,
    catalog,
    controls,
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
