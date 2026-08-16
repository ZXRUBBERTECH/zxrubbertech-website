import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { V5_LOCALES, V5_PAGE_STEMS } from './v5-i18n-config.mjs';
import {
  V5_I18N_OPERATION_KINDS,
  V5_I18N_OPERATIONS,
  V5_QUOTE_BACKEND_FIELDS,
  V5_QUOTE_VALIDATION_KEYS,
} from './v5-i18n-operations.mjs';
import { injectV5LanguageControls } from './v5-language-controls.mjs';

const scriptsRoot = dirname(fileURLToPath(import.meta.url));
const catalogRoot = join(scriptsRoot, 'v5-i18n');
const CATALOG_GROUPS = Object.freeze(['shared', 'pages', 'seo', 'runtime']);
export const V5_PERSIAN_APPROVED_LTR_LITERALS = Object.freeze([
  'ANHUI ZHIXIN MATERIAL TECHNOLOGY CO., LTD',
  'ZHIXIN RUBBER MATERIAL',
  'martin@zxrubbertech.com',
  'https://wa.me/8615256225135',
  '+86 152 5622 5135',
  'ISO 9001:2015',
  'WhatsApp',
  'ZHIXIN',
  'HNBR', 'EPDM', 'FKM', 'ACM', 'AEM', 'OEM', 'ODM', 'MOQ',
  'SBR', 'NBR', 'CAE', 'CAD', 'NVH', 'LSR', 'PTFE', 'HVAC', 'PPAP',
  'NDA', 'EXW', 'FOB', 'PVC', 'NR', 'CR', 'MQ', 'TC',
]);
const PERSIAN_RTL_STYLE = `
/* V5:PERSIAN RTL START */
html[dir="rtl"] body{direction:rtl}
html[dir="rtl"] :is(.tab-hero,.cap-txt,.panel,.footv5-group,.footv5-legal-row,.v5-language-switcher__menu,.v5-language-mobile,.v5-language-footer){text-align:start}
html[dir="rtl"] :is(input,textarea,select){text-align:start}
html[dir="rtl"] :is(.eyebrow,.tab-hero .th-note,.stat>span,.panel h4,.hcat .go,.pstep b,.pcat .go,.pcat-src,.dl-card .go,.tags span,.prod3 figcaption,.compound-primary-code,.compound-primary-status,.capv5-route span,.capv5-quality-step b,.capv5-capacity-stat>span,.footv5-group h3,.footv5-legal-row){letter-spacing:normal;text-transform:none}
/* V5:PERSIAN RTL END */
`;

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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const PERSIAN_LTR_PATTERN = new RegExp(
  `(?<![A-Za-z0-9])(?:${[...V5_PERSIAN_APPROVED_LTR_LITERALS]
    .sort((left, right) => right.length - left.length)
    .map(escapeRegExp)
    .join('|')})(?![A-Za-z0-9])`,
  'g',
);

function isolatePersianVisibleLtrTokens(html, stem) {
  const bodyOpen = [...html.matchAll(/<body\b[^>]*>/gi)];
  const bodyClose = [...html.matchAll(/<\/body\s*>/gi)];
  if (bodyOpen.length !== 1 || bodyClose.length !== 1 || bodyClose[0].index <= bodyOpen[0].index) {
    throw new Error(`${stem}/fa: expected one valid body element for bidi isolation`);
  }
  const start = bodyOpen[0].index + bodyOpen[0][0].length;
  const end = bodyClose[0].index;
  const source = html.slice(start, end);
  const excluded = [];
  let transformed = '';
  for (const match of source.matchAll(/<!--[\s\S]*?-->|<[^>]+>|[^<]+/g)) {
    const token = match[0];
    if (token.startsWith('<')) {
      const tag = token.match(/^<\s*(\/?)\s*([a-z0-9-]+)/i);
      if (tag) {
        const closing = tag[1] === '/';
        const name = tag[2].toLowerCase();
        if (closing && excluded.at(-1) === name) excluded.pop();
        else if (!closing && ['script', 'style', 'noscript'].includes(name) && !/\/\s*>$/.test(token)) excluded.push(name);
      }
      transformed += token;
      continue;
    }
    transformed += excluded.length
      ? token
      : token.replace(PERSIAN_LTR_PATTERN, (literal) => `<bdi dir="ltr">${literal}</bdi>`);
  }
  return `${html.slice(0, start)}${transformed}${html.slice(end)}`;
}

function addDirectionToNamedControl(html, { name, direction, stem }) {
  const pattern = new RegExp(`<(?:input|textarea)\\b(?=[^>]*\\bname=["']${escapeRegExp(name)}["'])[^>]*>`, 'gi');
  const matches = html.match(pattern) ?? [];
  if (matches.length !== 1) throw new Error(`${stem}/fa: expected one ${name} form control, found ${matches.length}`);
  const control = matches[0];
  if (/\bdirname\s*=/i.test(control)) throw new Error(`${stem}/fa: dirname is not allowed on ${name}`);
  if (/\bdir\s*=/i.test(control)) throw new Error(`${stem}/fa: ${name} form control already has dir`);
  return html.replace(control, control.replace(/>$/, ` dir="${direction}">`));
}

export function applyV5LocaleDirectionality(html, { stem, locale } = {}) {
  if (typeof html !== 'string' || !html.trim()) throw new Error(`${stem ?? '(missing)'}/${locale ?? '(missing)'}: directionality HTML must be nonempty`);
  if (!V5_PAGE_STEMS.includes(stem)) throw new Error(`Unknown V5 page stem: ${String(stem)}`);
  if (!Object.hasOwn(V5_LOCALES, locale)) throw new Error(`Unsupported V5 directionality locale: ${String(locale)}`);
  if (locale !== 'fa') return html;
  if (/V5:PERSIAN RTL (?:START|END)/.test(html)) throw new Error(`${stem}/fa: Persian RTL stylesheet already exists`);
  let transformed = replaceExactCount(
    html,
    '</style>',
    `${PERSIAN_RTL_STYLE}\n</style>`,
    1,
    `${stem}/fa Persian RTL stylesheet insertion`,
  );
  transformed = isolatePersianVisibleLtrTokens(transformed, stem);
  if (stem === 'quote') {
    for (const [name, direction] of [
      ['name', 'auto'],
      ['company', 'auto'],
      ['message', 'auto'],
      ['email', 'ltr'],
      ['phone', 'ltr'],
    ]) {
      transformed = addDirectionToNamedControl(transformed, { name, direction, stem });
    }
  }
  return transformed;
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

export function applyV5QuoteRuntimeContract(html, { locale, flattenedCatalog = null } = {}) {
  const definition = V5_LOCALES[locale];
  if (!definition) throw new Error(`Unsupported V5 Quote locale: ${String(locale)}`);
  if (typeof html !== 'string' || !html.trim()) throw new Error('V5 Quote HTML must be nonempty');
  if (!flattenedCatalog || typeof flattenedCatalog !== 'object' || Array.isArray(flattenedCatalog)) {
    throw new Error(`${locale}/quote: flattened catalog is required`);
  }
  const requiredMessage = flattenedCatalog[V5_QUOTE_VALIDATION_KEYS.required];
  const invalidEmailMessage = flattenedCatalog[V5_QUOTE_VALIDATION_KEYS.invalidEmail];
  if (typeof requiredMessage !== 'string' || !requiredMessage.trim()
      || typeof invalidEmailMessage !== 'string' || !invalidEmailMessage.trim()) {
    throw new Error(`${locale}/quote: validation messages are missing from the catalog`);
  }
  const visibleBackendFields = ['name', 'company', 'email', 'phone', 'message'];
  const expectedBackendFields = [...visibleBackendFields, 'language'];
  if (JSON.stringify(V5_QUOTE_BACKEND_FIELDS) !== JSON.stringify(expectedBackendFields)) {
    throw new Error(`${locale}/quote: backend field contract must equal ${expectedBackendFields.join(', ')}`);
  }
  if (/\bname=["']language["']/i.test(html)) throw new Error(`${locale}/quote: language field already exists`);
  if (/\bdata-language\s*=/i.test(html.match(/<div\b[^>]*\bclass=["'][^"']*\bcf-turnstile\b[^"']*["'][^>]*>/i)?.[0] ?? '')) {
    throw new Error(`${locale}/quote: Turnstile language already exists`);
  }

  const formMarker = /(<form\b[^>]*\bid=["']contact-form["'][^>]*>)/i;
  const widgetMarker = /(<div\b[^>]*\bclass=["'][^"']*\bcf-turnstile\b[^"']*["'][^>]*)(>)/i;
  const validationAnchor = "  const verificationStatus = document.getElementById('quote-verification-status');";
  const formCount = (html.match(new RegExp(formMarker.source, 'gi')) ?? []).length;
  const widgetCount = (html.match(new RegExp(widgetMarker.source, 'gi')) ?? []).length;
  if (formCount !== 1) throw new Error(`${locale}/quote: expected one contact form, found ${formCount}`);
  if (widgetCount !== 1) throw new Error(`${locale}/quote: expected one Turnstile widget, found ${widgetCount}`);
  if (html.split(validationAnchor).length - 1 !== 1) {
    throw new Error(`${locale}/quote: expected one Quote validation insertion anchor`);
  }
  const sourceForm = html.match(/<form\b[^>]*\bid=["']contact-form["'][^>]*>[\s\S]*?<\/form\s*>/i)?.[0] ?? '';
  const sourceBackendFields = [...sourceForm.matchAll(/<(?:input|textarea)\b[^>]*\bname=(?:"([^"]+)"|'([^']+)')[^>]*>/gi)]
    .map((match) => match[1] ?? match[2]);
  if (JSON.stringify(sourceBackendFields) !== JSON.stringify(visibleBackendFields)) {
    throw new Error(`${locale}/quote: source backend fields must equal ${visibleBackendFields.join(', ')}`);
  }

  let transformed = html.replace(
    formMarker,
    `$1\n      <input type="hidden" name="language" value="${locale}">`,
  );
  transformed = transformed.replace(
    widgetMarker,
    `$1 data-language="${definition.turnstileLanguage}"$2`,
  );
  const validationScript = `

  /* V5:QUOTE VALIDATION START */
  const quoteValidationMessages = Object.freeze({
    required: '${escapeJsString(requiredMessage, "'")}',
    invalidEmail: '${escapeJsString(invalidEmailMessage, "'")}',
  });
  const quoteValidationFields = [...(quoteForm?.querySelectorAll('[data-fs-field]') ?? [])];
  const setQuoteValidationMessage = (field) => {
    field.setCustomValidity('');
    if (field.validity.valueMissing) field.setCustomValidity(quoteValidationMessages.required);
    else if (field.type === 'email' && field.validity.typeMismatch) field.setCustomValidity(quoteValidationMessages.invalidEmail);
  };
  quoteValidationFields.forEach((field) => {
    field.addEventListener('invalid', () => setQuoteValidationMessage(field));
    field.addEventListener('input', () => field.setCustomValidity(''));
  });
  /* V5:QUOTE VALIDATION END */`;
  transformed = transformed.replace(validationAnchor, `${validationAnchor}${validationScript}`);
  return transformed;
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
  const withRuntime = stem === 'quote'
    ? applyV5QuoteRuntimeContract(localized, { locale, flattenedCatalog: flattened })
    : localized;
  return applyV5LocaleDirectionality(withRuntime, { stem, locale });
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
