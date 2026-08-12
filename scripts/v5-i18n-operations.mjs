import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { seoPages, SEO_BREADCRUMB_NAMES } from './v5-seo-config.mjs';
import { V5_PAGE_STEMS } from './v5-i18n-config.mjs';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const previewRoot = join(repo, 'design-demos');

export const V5_I18N_OPERATION_KINDS = Object.freeze([
  'html-text',
  'html-fragment',
  'attribute',
  'js-string',
]);

const TRANSLATABLE_ATTRIBUTES = Object.freeze([
  'alt',
  'aria-label',
  'placeholder',
  'title',
  'data-wheel',
]);

export const V5_QUOTE_BACKEND_FIELDS = Object.freeze([
  'name', 'company', 'email', 'phone', 'message', 'language',
]);

export const V5_QUOTE_VALIDATION_KEYS = Object.freeze({
  required: 'runtime.quote.validation.required-field',
  invalidEmail: 'runtime.quote.validation.invalid-email',
});

export const V5_QUOTE_RUNTIME_LITERALS = Object.freeze([
  'Verification complete. You can send your request.',
  'Verification is unavailable. Please try again or use the email or WhatsApp links below.',
  'Verification expired. Please complete it again.',
  'Complete the verification before sending your request. You can also use email or WhatsApp below.',
  'Sending…',
  'Request could not be sent (Formspree HTTP ',
  '). Please try again or email us directly. Your entered details have been kept.',
  'Please complete the verification again before retrying.',
  'Thank you! Your inquiry has been sent. We will reply within 24 hours.',
  'Verification reset after successful submission.',
  'Request could not reach Formspree (network error). Please try again or email us directly. Your entered details have been kept.',
  'Send Request',
]);

const RUNTIME_LITERALS = Object.freeze([
  'Section navigation',
  ' reserved expansion area',
  'Open in Amap',
  'Open in Google Maps',
  ...V5_QUOTE_RUNTIME_LITERALS,
]);

const PRESERVED_CATALOG_VALUES = new Set([
  'ZHIXIN',
  'RUBBER MATERIAL',
  'ANHUI ZHIXIN MATERIAL TECHNOLOGY CO., LTD',
  'martin@zxrubbertech.com',
  'NR', 'SBR', 'CR', 'NBR', 'HNBR', 'EPDM', 'MQ', 'FKM', 'AEM / ACM', 'NV',
  'CAE', 'OEM', '/ODM', 'M+', 't',
]);

function decodeHtml(value) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (entity, token) => {
    const normalized = token.toLowerCase();
    if (normalized === 'amp') return '&';
    if (normalized === 'lt') return '<';
    if (normalized === 'gt') return '>';
    if (normalized === 'quot') return '"';
    if (normalized === 'apos') return "'";
    if (normalized === 'nbsp') return '\u00a0';
    const radix = normalized.startsWith('#x') ? 16 : 10;
    const digits = normalized.slice(radix === 16 ? 2 : 1);
    return String.fromCodePoint(Number.parseInt(digits, radix));
  });
}

function meaningful(value) {
  return value.length > 0 && /[\p{L}]/u.test(value);
}

function withoutNonVisibleBlocks(body) {
  return body
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|svg|template|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
}

function countMatches(source, fragment) {
  return source.split(fragment).length - 1;
}

function stableSlug(value) {
  const ascii = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&(?:amp;)?/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 52);
  return ascii || 'localized-copy';
}

function collectRawOperations() {
  const htmlByStem = Object.fromEntries(V5_PAGE_STEMS.map((stem) => [
    stem,
    readFileSync(join(previewRoot, `${stem}-v5.html`), 'utf8'),
  ]));
  const records = new Map();

  function add({ kind, source, value, stem, attribute = null, quote = null, leading = '', trailing = '' }) {
    const identity = JSON.stringify([kind, source]);
    const existing = records.get(identity) ?? {
      kind,
      source,
      value,
      attribute,
      quote,
      leading,
      trailing,
      stems: [],
      expectedByStem: {},
    };
    if (existing.value !== value || existing.attribute !== attribute || existing.quote !== quote) {
      throw new Error(`Ambiguous V5 i18n source fragment: ${source}`);
    }
    if (!existing.stems.includes(stem)) existing.stems.push(stem);
    existing.expectedByStem[stem] = countMatches(htmlByStem[stem], source);
    if (existing.expectedByStem[stem] < 1) throw new Error(`${stem}: missing collected V5 i18n source ${source}`);
    records.set(identity, existing);
  }

  for (const stem of V5_PAGE_STEMS) {
    const html = htmlByStem[stem];
    const bodyMatch = html.match(/<body\b[^>]*>([\s\S]*?)<\/body\s*>/i);
    if (!bodyMatch) throw new Error(`${stem}: accepted preview must contain one body`);
    const visibleBody = withoutNonVisibleBlocks(bodyMatch[1]);

    for (const match of visibleBody.matchAll(/>([^<]+)</g)) {
      const raw = match[1];
      const leading = raw.match(/^\s*/)?.[0] ?? '';
      const trailing = raw.match(/\s*$/)?.[0] ?? '';
      const core = raw.slice(leading.length, raw.length - trailing.length);
      const value = decodeHtml(core);
      if (!meaningful(value)) continue;
      add({
        kind: 'html-text',
        source: `>${raw}<`,
        value,
        stem,
        leading,
        trailing,
      });
    }

    const attributePattern = new RegExp(`\\b(${TRANSLATABLE_ATTRIBUTES.join('|')})="([^"]*)"`, 'gi');
    for (const match of visibleBody.matchAll(attributePattern)) {
      const [, attribute, raw] = match;
      const value = decodeHtml(raw);
      if (!meaningful(value)) continue;
      add({
        kind: 'attribute',
        source: `${attribute}="${raw}"`,
        value,
        stem,
        attribute,
      });
    }

    for (const value of RUNTIME_LITERALS) {
      for (const quote of ["'", '"']) {
        const source = `${quote}${value}${quote}`;
        if (!html.includes(source)) continue;
        add({ kind: 'js-string', source, value, stem, quote });
      }
    }
  }

  return [...records.values()];
}

function assignKeys(records) {
  const used = new Map();
  return records.map((record) => {
    const isShared = record.stems.length === V5_PAGE_STEMS.length;
    const owner = record.stems[0];
    const group = record.kind === 'js-string'
      ? `runtime.${isShared ? 'shared' : owner}`
      : isShared ? 'shared' : `pages.${owner}`;
    const kindLabel = record.kind.replace('-', '_');
    const base = `${group}.${kindLabel}.${stableSlug(record.value)}`;
    const sequence = (used.get(base) ?? 0) + 1;
    used.set(base, sequence);
    const key = sequence === 1 ? base : `${base}-${sequence}`;
    const stems = Object.freeze([...record.stems]);
    const expectedByStem = Object.freeze({ ...record.expectedByStem });
    return Object.freeze({
      key,
      stems,
      kind: record.kind,
      source: record.source,
      expectedByStem,
      english: record.value,
      ...(PRESERVED_CATALOG_VALUES.has(record.value) ? { preserve: true } : {}),
      ...(record.attribute ? { attribute: record.attribute } : {}),
      ...(record.quote ? { quote: record.quote } : {}),
      ...(record.leading ? { leading: record.leading } : {}),
      ...(record.trailing ? { trailing: record.trailing } : {}),
    });
  });
}

export const V5_I18N_OPERATIONS = Object.freeze(assignKeys(collectRawOperations()));

export function createV5EnglishCatalog() {
  const catalog = {
    meta: { locale: 'en', sourceLocale: 'en', schemaVersion: 1 },
    shared: {},
    pages: Object.fromEntries(V5_PAGE_STEMS.map((stem) => [stem, {}])),
    seo: {},
    runtime: {},
  };
  for (const operation of V5_I18N_OPERATIONS) {
    const segments = operation.key.split('.');
    let target = catalog;
    for (const segment of segments.slice(0, -1)) target = target[segment] ??= {};
    target[segments.at(-1)] = operation.english;
  }
  for (const stem of V5_PAGE_STEMS) {
    catalog.seo[stem] = {
      title: seoPages[stem].title,
      description: seoPages[stem].description,
      breadcrumb: stem === 'demo-a' ? 'Home' : SEO_BREADCRUMB_NAMES[stem],
    };
  }
  return catalog;
}
