import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { V5_LOCALES, V5_PAGE_STEMS } from './v5-i18n-config.mjs';
import { V5_I18N_OPERATION_KINDS, V5_I18N_OPERATIONS } from './v5-i18n-operations.mjs';
import { injectV5LanguageControls } from './v5-language-controls.mjs';

const scriptsRoot = dirname(fileURLToPath(import.meta.url));
const catalogRoot = join(scriptsRoot, 'v5-i18n');
const CATALOG_GROUPS = Object.freeze(['shared', 'pages', 'seo', 'runtime']);

function assertPlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be a plain object`);
  }
}

export function flattenV5Catalog(catalog) {
  assertPlainObject(catalog, 'V5 catalog');
  const flattened = {};
  const walk = (value, path) => {
    assertPlainObject(value, `V5 catalog group ${path}`);
    for (const [key, child] of Object.entries(value)) {
      if (!key || key.includes('.')) throw new Error(`Malformed V5 catalog key at ${path || '(root)'}`);
      const childPath = path ? `${path}.${key}` : key;
      if (typeof child === 'string') {
        if (!child.trim()) throw new Error(`V5 catalog value must be nonempty: ${childPath}`);
        flattened[childPath] = child;
      } else {
        if (child === null || Array.isArray(child) || typeof child !== 'object') {
          throw new Error(`V5 catalog value must be a string or object: ${childPath}`);
        }
        walk(child, childPath);
      }
    }
  };
  for (const group of CATALOG_GROUPS) {
    if (!Object.hasOwn(catalog, group)) throw new Error(`V5 catalog is missing group: ${group}`);
    walk(catalog[group], group);
  }
  return flattened;
}

export function loadV5Catalog(locale, { root = catalogRoot } = {}) {
  if (!Object.hasOwn(V5_LOCALES, locale)) throw new Error(`Unsupported V5 catalog locale: ${String(locale)}`);
  const file = join(root, `${locale}.json`);
  if (!existsSync(file)) throw new Error(`Missing V5 catalog: ${file}`);
  const info = lstatSync(file);
  if (info.isSymbolicLink() || !info.isFile()) throw new Error(`V5 catalog must be a regular file: ${file}`);
  let catalog;
  try {
    catalog = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`Malformed V5 catalog ${file}: ${error.message}`);
  }
  validateV5Catalog(locale, catalog);
  return catalog;
}

export function validateV5Catalog(locale, catalog) {
  if (!Object.hasOwn(V5_LOCALES, locale)) throw new Error(`Unsupported V5 catalog locale: ${String(locale)}`);
  assertPlainObject(catalog, `${locale} V5 catalog`);
  const exactTopLevel = ['meta', ...CATALOG_GROUPS];
  if (JSON.stringify(Object.keys(catalog)) !== JSON.stringify(exactTopLevel)) {
    throw new Error(`${locale} V5 catalog must contain exactly: ${exactTopLevel.join(', ')}`);
  }
  assertPlainObject(catalog.meta, `${locale} V5 catalog meta`);
  const expectedMeta = { locale, sourceLocale: 'en', schemaVersion: 1 };
  if (JSON.stringify(catalog.meta) !== JSON.stringify(expectedMeta)) {
    throw new Error(`${locale} V5 catalog meta must equal ${JSON.stringify(expectedMeta)}`);
  }
  assertPlainObject(catalog.pages, `${locale} V5 pages`);
  if (JSON.stringify(Object.keys(catalog.pages)) !== JSON.stringify(V5_PAGE_STEMS)) {
    throw new Error(`${locale} V5 catalog pages must contain exactly: ${V5_PAGE_STEMS.join(', ')}`);
  }
  for (const stem of V5_PAGE_STEMS) {
    assertPlainObject(catalog.pages[stem], `${locale} pages.${stem}`);
    if (Object.keys(catalog.pages[stem]).length === 0) throw new Error(`${locale} pages.${stem} must be nonempty`);
  }
  assertPlainObject(catalog.seo, `${locale} V5 SEO`);
  if (JSON.stringify(Object.keys(catalog.seo)) !== JSON.stringify(V5_PAGE_STEMS)) {
    throw new Error(`${locale} V5 SEO must contain exactly: ${V5_PAGE_STEMS.join(', ')}`);
  }
  for (const stem of V5_PAGE_STEMS) {
    assertPlainObject(catalog.seo[stem], `${locale} seo.${stem}`);
    const keys = Object.keys(catalog.seo[stem]);
    if (JSON.stringify(keys) !== JSON.stringify(['title', 'description', 'breadcrumb'])) {
      throw new Error(`${locale} seo.${stem} must contain exactly title, description, breadcrumb`);
    }
  }
  const flattened = flattenV5Catalog(catalog);
  if (locale !== 'en') {
    for (const operation of V5_I18N_OPERATIONS) {
      if (operation.preserve && flattened[operation.key] !== operation.english) {
        throw new Error(`${locale} V5 catalog changed preserved value: ${operation.key}`);
      }
    }
  }
  return flattened;
}

function escapeHtmlText(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function escapeHtmlAttribute(value) {
  return escapeHtmlText(value).replaceAll('"', '&quot;');
}

function escapeJsString(value, quote) {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll(quote, `\\${quote}`)
    .replaceAll('\r', '\\r')
    .replaceAll('\n', '\\n')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029')
    .replaceAll('<', '\\x3C');
}

export function validateV5HtmlFragment(value, key = 'V5 localized HTML fragment') {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${key}: localized HTML fragment must be nonempty`);
  if (/<!--[\s\S]*?-->|<\/?(?:script|style|iframe|object|embed|form|input|button|a)\b/i.test(value)) {
    throw new Error(`${key}: unsafe localized HTML fragment`);
  }
  const withoutAllowed = value.replace(/<br\s*\/?>|<\/?(?:em|strong)>|<span(?:\s+(?:class|aria-hidden)="[A-Za-z0-9 _:-]+")*\s*>|<\/span>/gi, '');
  if (/[<>]/.test(withoutAllowed) || /\son[a-z]+\s*=/i.test(value)) {
    throw new Error(`${key}: localized HTML fragment permits only br, em, strong, and safe span tags`);
  }
  return value;
}

export function replaceExactCount(html, from, to, expected, label) {
  const count = html.split(from).length - 1;
  if (count !== expected) throw new Error(`${label}: expected ${expected} matches, found ${count}`);
  return html.replaceAll(from, to);
}

function replacementFor(operation, value) {
  if (operation.kind === 'html-text') {
    return `>${operation.leading ?? ''}${escapeHtmlText(value)}${operation.trailing ?? ''}<`;
  }
  if (operation.kind === 'attribute') {
    return `${operation.attribute}="${escapeHtmlAttribute(value)}"`;
  }
  if (operation.kind === 'js-string') {
    return `${operation.quote}${escapeJsString(value, operation.quote)}${operation.quote}`;
  }
  if (operation.kind === 'html-fragment') {
    validateV5HtmlFragment(value, operation.key);
    return `>${operation.leading ?? ''}${value}${operation.trailing ?? ''}<`;
  }
  throw new Error(`${operation.key}: unsupported V5 i18n operation kind ${operation.kind}`);
}

export function applyV5LocalizationOperations(html, { stem, locale, catalog = null } = {}) {
  if (typeof html !== 'string' || !html.trim()) throw new Error(`${stem ?? '(missing)'}: V5 HTML must be nonempty`);
  if (!V5_PAGE_STEMS.includes(stem)) throw new Error(`Unknown V5 page stem: ${String(stem)}`);
  const activeCatalog = catalog ?? loadV5Catalog(locale);
  const flattened = validateV5Catalog(locale, activeCatalog);
  let localized = html;
  for (const operation of V5_I18N_OPERATIONS) {
    if (!operation.stems.includes(stem)) continue;
    if (!V5_I18N_OPERATION_KINDS.includes(operation.kind)) {
      throw new Error(`${operation.key}: invalid V5 i18n operation kind`);
    }
    const value = flattened[operation.key];
    if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing V5 catalog key: ${operation.key}`);
    localized = replaceExactCount(
      localized,
      operation.source,
      replacementFor(operation, value),
      operation.expectedByStem[stem],
      `${stem}/${locale}/${operation.key}`,
    );
  }
  return localized;
}

export function applyV5LocalizationAndControls(html, { stem, locale, catalog = null } = {}) {
  const localized = applyV5LocalizationOperations(html, { stem, locale, catalog });
  return injectV5LanguageControls(localized, { stem, locale });
}

export function buildV5I18nBaseline(englishCatalog, operations) {
  const flattened = flattenV5Catalog(englishCatalog);
  const keys = Object.keys(flattened).sort();
  const sourceSha256ByKey = Object.fromEntries(keys.map((key) => [
    key,
    createHash('sha256').update(flattened[key]).digest('hex'),
  ]));
  if (new Set(operations.map(({ key }) => key)).size !== operations.length) {
    throw new Error('V5 i18n operation keys must be unique');
  }
  const operationCountsByKind = Object.fromEntries(V5_I18N_OPERATION_KINDS.map((kind) => [
    kind,
    operations.filter((operation) => operation.kind === kind).length,
  ]));
  const operationCountsByStem = Object.fromEntries(V5_PAGE_STEMS.map((stem) => [
    stem,
    operations.filter((operation) => operation.stems.includes(stem)).length,
  ]));
  const operationSha256 = createHash('sha256').update(JSON.stringify(operations)).digest('hex');
  return {
    schemaVersion: 1,
    locale: 'en',
    keyCount: keys.length,
    keys,
    sourceSha256ByKey,
    operationCount: operations.length,
    operationCountsByKind,
    operationCountsByStem,
    operationSha256,
  };
}
