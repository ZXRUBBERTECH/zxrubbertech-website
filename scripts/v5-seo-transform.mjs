import {
  SEO_SITE_NAME,
  SEO_SOCIAL_IMAGE,
  SEO_SOCIAL_LOCALE,
  getSeoCanonicalUrl,
  getLocalizedSeoPage,
  getLocalizedV5StructuredData,
  getV5StructuredData,
  seoPages,
} from './v5-seo-config.mjs';
import {
  V5_LOCALES,
  getHreflangCluster,
  getLocalizedUrl,
} from './v5-i18n-config.mjs';

const SEO_BLOCK_START = '<!-- V5:SEO HEAD START -->';
const SEO_BLOCK_END = '<!-- V5:SEO HEAD END -->';
const metaTagPattern = /<meta\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi;
const linkTagPattern = /<link\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi;
const titleTagPattern = /<title\b(?:[^>"']|"[^"]*"|'[^']*')*>[\s\S]*?<\/title\s*>/gi;
const scriptTagPattern = /<script\b(?:[^>"']|"[^"]*"|'[^']*')*>[\s\S]*?<\/script\s*>/gi;

function escapeText(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function escapeAttribute(value) {
  return escapeText(value).replaceAll('"', '&quot;');
}

function attribute(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>]+))`, 'i'));
  return match ? (match[1] ?? match[2] ?? match[3] ?? '') : null;
}

function removeMatchingTags(source, pattern, predicate) {
  return source.replace(pattern, (tag) => (predicate(tag) ? '' : tag));
}

function removeExistingSeoHead(head) {
  const withoutNormalizedBlock = head.replace(
    new RegExp(`\\n?${SEO_BLOCK_START}[\\s\\S]*?${SEO_BLOCK_END}\\n?`, 'g'),
    '\n',
  );
  const withoutTitles = withoutNormalizedBlock.replace(titleTagPattern, '');
  const withoutSeoMeta = removeMatchingTags(withoutTitles, metaTagPattern, (tag) => {
    const name = (attribute(tag, 'name') ?? '').toLowerCase();
    const property = (attribute(tag, 'property') ?? '').toLowerCase();
    return name === 'description'
      || name === 'robots'
      || name.startsWith('twitter:')
      || property.startsWith('og:')
      || property.startsWith('twitter:');
  });
  const withoutCanonicalOrIcon = removeMatchingTags(withoutSeoMeta, linkTagPattern, (tag) => {
    const rel = (attribute(tag, 'rel') ?? '').toLowerCase().split(/\s+/);
    return rel.includes('canonical') || rel.includes('icon') || attribute(tag, 'hreflang') !== null;
  });
  return removeMatchingTags(withoutCanonicalOrIcon, scriptTagPattern, (tag) =>
    (attribute(tag, 'type') ?? '').toLowerCase() === 'application/ld+json');
}

function metadataBlock(stem, profile, locale, catalog) {
  const definition = V5_LOCALES[locale];
  if (!definition) throw new Error(`${stem}: unknown V5 SEO locale ${String(locale)}`);
  const localized = profile === 'release' || catalog
    ? getLocalizedSeoPage(stem, catalog)
    : seoPages[stem];
  const canonical = profile === 'release' ? getLocalizedUrl(locale, stem) : getSeoCanonicalUrl(stem);
  const robots = profile === 'preview' ? 'noindex,nofollow' : 'index,follow';
  const title = escapeText(localized.title);
  const description = escapeAttribute(localized.description);
  const titleAttribute = escapeAttribute(localized.title);
  const canonicalAttribute = escapeAttribute(canonical);
  const structured = profile === 'release'
    ? getLocalizedV5StructuredData(stem, catalog, {
      canonical,
      homeUrl: getLocalizedUrl(locale, 'demo-a'),
    })
    : getV5StructuredData(stem);
  const structuredData = JSON.stringify(structured, null, 2).replaceAll('<', '\\u003c');
  const hreflangLinks = profile === 'release'
    ? getHreflangCluster(stem).map(({ hreflang, url }) =>
      `<link rel="alternate" hreflang="${escapeAttribute(hreflang)}" href="${escapeAttribute(url)}">`).join('\n')
    : '';
  const alternateLocales = profile === 'release'
    ? Object.entries(V5_LOCALES)
      .filter(([candidate]) => candidate !== locale)
      .map(([, candidate]) => `<meta property="og:locale:alternate" content="${escapeAttribute(candidate.ogLocale)}">`)
      .join('\n')
    : '';

  return `${SEO_BLOCK_START}
<title>${title}</title>
<meta name="description" content="${description}">
<link rel="canonical" href="${canonicalAttribute}">
${hreflangLinks}${hreflangLinks ? '\n' : ''}<link rel="icon" href="data:,">
<meta name="robots" content="${robots}">
<meta property="og:type" content="website">
<meta property="og:locale" content="${profile === 'release' ? definition.ogLocale : SEO_SOCIAL_LOCALE}">
${alternateLocales}${alternateLocales ? '\n' : ''}<meta property="og:site_name" content="${escapeAttribute(SEO_SITE_NAME)}">
<meta property="og:title" content="${titleAttribute}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${canonicalAttribute}">
<meta property="og:image" content="${SEO_SOCIAL_IMAGE}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${titleAttribute}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${SEO_SOCIAL_IMAGE}">
<script type="application/ld+json">
${structuredData}
</script>
${SEO_BLOCK_END}`;
}

function insertionOffset(head) {
  let offset = 0;
  for (const match of head.matchAll(metaTagPattern)) {
    const name = (attribute(match[0], 'name') ?? '').toLowerCase();
    if (attribute(match[0], 'charset') !== null || name === 'viewport') {
      offset = match.index + match[0].length;
    }
  }
  return offset;
}

export function applyV5SeoHead(html, stem, { profile, locale = 'en', catalog = null } = {}) {
  if (typeof html !== 'string' || !html.trim()) throw new Error(`${stem}: V5 HTML must be a non-empty string`);
  if (!seoPages[stem]) throw new Error(`Unknown V5 SEO page: ${stem}`);
  if (profile !== 'preview' && profile !== 'release') throw new Error(`${stem}: unknown V5 SEO profile ${profile ?? '(missing)'}`);
  if (!Object.hasOwn(V5_LOCALES, locale)) throw new Error(`${stem}: unknown V5 SEO locale ${String(locale)}`);
  if (profile === 'release' && !catalog) throw new Error(`${stem}: release SEO requires a localized catalog`);

  const headOpen = [...html.matchAll(/<head\b[^>]*>/gi)];
  const headClose = [...html.matchAll(/<\/head\s*>/gi)];
  if (headOpen.length !== 1 || headClose.length !== 1 || headClose[0].index <= headOpen[0].index) {
    throw new Error(`${stem}: expected one valid head element`);
  }

  const contentStart = headOpen[0].index + headOpen[0][0].length;
  const contentEnd = headClose[0].index;
  const cleanedHead = removeExistingSeoHead(html.slice(contentStart, contentEnd));
  const offset = insertionOffset(cleanedHead);
  const before = cleanedHead.slice(0, offset);
  const after = cleanedHead.slice(offset);
  const separatorBefore = before.endsWith('\n') ? '' : '\n';
  const separatorAfter = after.startsWith('\n') ? '' : '\n';
  const transformedHead = `${before}${separatorBefore}${metadataBlock(stem, profile, locale, catalog)}${separatorAfter}${after}`;

  let transformed = `${html.slice(0, contentStart)}${transformedHead}${html.slice(contentEnd)}`;
  if (profile === 'release') {
    const current = transformed.slice(0, contentStart).match(/<html\b[^>]*>/i)?.[0];
    if (!current) throw new Error(`${stem}: expected one html element before head`);
    const next = /\blang\s*=/.test(current)
      ? current.replace(/\blang\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i, `lang="${escapeAttribute(V5_LOCALES[locale].htmlLang)}"`)
      : current.replace(/>$/, ` lang="${escapeAttribute(V5_LOCALES[locale].htmlLang)}">`);
    transformed = transformed.replace(current, next);
  }
  return transformed;
}
