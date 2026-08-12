import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, posix, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  SEO_BASE_URL,
  SEO_SITE_NAME,
  SEO_SOCIAL_IMAGE,
  SEO_SOCIAL_LOCALE,
  V5_ROUTE_MAP,
  getSeoCanonicalUrl,
  getLocalizedV5StructuredData,
  seoPages,
} from './v5-seo-config.mjs';
import {
  V5_LOCALES,
  V5_PAGE_STEMS,
  getHreflangCluster,
  getLocalizedRoute,
  getLocalizedUrl,
} from './v5-i18n-config.mjs';
import { loadV5Catalog } from './v5-i18n-transform.mjs';
import {
  V5_PRODUCTS_GALLERY_RULE_BEFORE_DIMENSIONS,
  V5_PRODUCTS_GALLERY_RULE_WITH_DIMENSIONS,
  loadV5ImageDimensions,
  normalizeV5ImageSource,
  restoreV5PerformanceChangesForVisualHash,
  validateV5MediaSignature,
} from './v5-seo-assets.mjs';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const defaultRoot = join(repo, 'design-demos');

export const PUBLIC_V5_PAGES = Object.freeze(Object.keys(seoPages));

const gates = new Set(['baseline', 'metadata', 'links', 'performance', 'schema', 'quote', 'copy', 'all']);
const profiles = new Set(['preview', 'release']);
const requiredOpenGraph = ['og:title', 'og:description', 'og:url', 'og:type', 'og:locale', 'og:site_name', 'og:image'];
const requiredTwitter = ['twitter:card', 'twitter:title', 'twitter:description', 'twitter:image'];
const prohibitedSchemaTypes = new Set(['Product', 'FAQPage', 'Offer', 'Review', 'AggregateRating']);
const turnstilePreviewTestSiteKeys = new Set([
  '1x00000000000000000000AA',
  '2x00000000000000000000AB',
  '1x00000000000000000000BB',
  '2x00000000000000000000BB',
  '3x00000000000000000000FF',
]);
const quoteFormspreeFormId = 'mrpzqado';
const quoteFormspreeAction = `https://formspree.io/f/${quoteFormspreeFormId}`;
const approvedGate6Copy = Object.freeze({
  'demo-a': Object.freeze({
    h1: Object.freeze({
      baseline: '<h1>Requirements in.<br>Controlled <em>rubber</em> out.</h1>',
      approved: '<h1>Custom rubber.<br><em>Compounds &amp; components</em>.</h1>',
    }),
    supporting: Object.freeze({
      baseline: '<p>ANHUI ZHIXIN MATERIAL TECHNOLOGY CO., LTD develops and manufactures rubber compounds and custom rubber components in Anhui, China.</p>',
      approved: '<p>ANHUI ZHIXIN MATERIAL TECHNOLOGY CO., LTD manufactures custom rubber compounds and components in Ningguo, Anhui, China.</p>',
    }),
  }),
  products: Object.freeze({
    h1: Object.freeze({
      baseline: '<h1>Rubber components.<br>Engineered for <em>your application</em>.</h1>',
      approved: '<h1>Custom rubber components.<br>Built for <em>your application</em>.</h1>',
    }),
    supporting: Object.freeze({
      baseline: '<p class="th-sub">Explore molded rubber and rubber-metal bonded components for automotive, sealing, appliance and custom industrial applications. Application images are for reference; final geometry, materials and specifications are confirmed against project requirements.</p>',
      approved: '<p class="th-sub">Explore custom molded rubber products and rubber-metal bonded parts for automotive, sealing, appliance and industrial applications. Images are for reference; final geometry, materials and specifications are confirmed against project requirements.</p>',
    }),
  }),
  compounds: Object.freeze({
    h1: Object.freeze({
      baseline: '<h1>Compounds built around<br><em>application requirements</em>.</h1>',
      approved: '<h1>Custom rubber compounds.<br>Built for <em>your application</em>.</h1>',
    }),
    supporting: Object.freeze({
      baseline: '<p class="th-sub">Explore ten core elastomer families for compound supply and molded rubber production. Polymer, color, hardness, processing route and project documents are confirmed against each application.</p>',
      approved: '<p class="th-sub">Explore ten elastomer families—including NBR, EPDM and SBR—for custom compound supply and molded rubber production. Polymer, color, hardness and processing route are confirmed for each application.</p>',
    }),
  }),
  industries: Object.freeze({
    h1: Object.freeze({
      baseline: '<h1>Engineered rubber,<br>where industry <em>moves.</em></h1>',
      approved: '<h1>Industrial rubber.<br>Components in <em>motion</em>.</h1>',
    }),
    supporting: Object.freeze({
      baseline: '<p class="th-sub">Explore application-focused rubber components for mobility, equipment, transit, fluid handling and electrical systems — supported by in-house compound development, molding and rubber-to-metal bonding.</p>',
      approved: '<p class="th-sub">Explore application-focused rubber components for mobility, industrial equipment, rail transit, fluid handling and electrical systems—supported by in-house compound development, molding and rubber-to-metal bonding.</p>',
    }),
  }),
  capabilities: Object.freeze({
    h1: Object.freeze({
      baseline: '<h1>From engineering intent<br>to <em>controlled production</em>.</h1>',
      approved: '<h1>Rubber manufacturing.<br>Engineering to <em>production</em>.</h1>',
    }),
    supporting: Object.freeze({
      baseline: '<p class="th-sub">We review requirements, define material and tooling routes, control compound and component production, and release against confirmed project criteria.</p>',
      approved: '<p class="th-sub">We define material and tooling routes, then control rubber compounding, compression and injection molding, extrusion and rubber-metal bonding against project criteria.</p>',
    }),
  }),
  faq: Object.freeze({
    h1: Object.freeze({
      baseline: '<h1>Rubber manufacturing,<br><em>answered clearly</em>.</h1>',
      approved: '<h1>Rubber FAQ.<br><em>Answered clearly</em>.</h1>',
    }),
    supporting: Object.freeze({
      baseline: '<p class="th-sub">Practical answers on in-house processes, material selection, custom development, MOQ, quality records and export supply.</p>',
      approved: '<p class="th-sub">Answers on rubber materials, manufacturing, custom development, MOQ, tooling, quality records, traceability and export supply.</p>',
    }),
  }),
  quote: Object.freeze({
    h1: Object.freeze({
      baseline: '<h1>Start your project<br>with <em>us</em>.</h1>',
      approved: '<h1>Rubber quote.<br><em>Start here</em>.</h1>',
    }),
    supporting: Object.freeze({
      baseline: '<p class="th-sub">Contact our engineering and sales team for material selection, product development and quotation support.</p>',
      approved: '<p class="th-sub">Contact our engineering and sales team for custom rubber material selection, part development and quotation support.</p>',
    }),
  }),
});
const expectedV5RouteMap = Object.freeze({
  'demo-a': '/',
  products: '/products/',
  compounds: '/rubber-compounds/',
  industries: '/industries/',
  capabilities: '/capabilities/',
  faq: '/faq/',
  quote: '/quote/',
});
const expectedBreadcrumbNames = Object.freeze({
  products: 'Products',
  compounds: 'Rubber Compounds',
  industries: 'Industries',
  capabilities: 'Capabilities',
  faq: 'FAQ',
  quote: 'Get a Quote',
});
const expectedOrganizationFacts = Object.freeze({
  legalName: 'ANHUI ZHIXIN MATERIAL TECHNOLOGY CO., LTD',
  name: 'ZHIXIN RUBBER MATERIAL',
  url: 'https://www.zxrubbertech.com/',
  email: 'martin@zxrubbertech.com',
  telephone: '+86 152 5622 5135',
  address: Object.freeze({
    streetAddress: 'No. 33, Waihuan East Road, Helixi Street',
    addressLocality: 'Ningguo City',
    addressRegion: 'Anhui Province',
    addressCountry: 'CN',
  }),
});
const approvedFragmentResolutionMap = Object.freeze({
  'quote-v5.html#rfq': 'quote-v5.html#contact',
  'products-v5.html#bushings-mounts-rubber-metal': 'products-v5.html#c-automotive',
  'products-v5.html#seals-gaskets': 'products-v5.html#c-sealing',
  'products-v5.html#boots-bellows-covers': 'products-v5.html#c-automotive',
  'products-v5.html#grommets-plugs-cable-protection': 'products-v5.html#c-automotive',
  'products-v5.html#rollers-wheels-custom-molded': 'products-v5.html#c-industrial',
  'compounds-v5.html#families': 'compounds-v5.html#compound-primary',
});
const expectedResolvedFragmentCounts = Object.freeze({
  'quote-v5.html#contact': 2,
  'products-v5.html#c-automotive': 3,
  'products-v5.html#c-sealing': 1,
  'products-v5.html#c-industrial': 1,
  'compounds-v5.html#compound-primary': 1,
});
const expectedLazyImageCounts = Object.freeze({
  'demo-a': 6,
  products: 56,
  compounds: 12,
  industries: 0,
  capabilities: 5,
  faq: 0,
  quote: 1,
});
const voidElements = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr',
]);
const expectedGate0BodySha256 = {
  'demo-a': 'e3cd4b35e894d2ee8f1ae29e011a458663fc81906ef94ec4ca3cb83b67a85bde',
  products: '8a764f6e5a7c1d762cf11486c3b88bdc9a666fea2157c2979098b7b55da7b46e',
  compounds: 'c8fbae7e2da95180923a4ab1337fea4d6be6f0efaa5eace686a1a43d79863c73',
  industries: '8c4a07dc0663b39e5ac96b1165153cb667a080dbb42febceddfb51eca164f9e0',
  capabilities: '9f52ad6deea2b5293ab9c489bdb856a5769ab59d5eaf50cb4191a1eb79c66968',
  faq: 'cef3c8e14935e99846aa884642dd0ba73883df8bd79f8132224947127dc137cc',
  quote: '2c6252e23a27d122a7e27a05a0a18f7f3b28c99cc9627974179e5dbfd539bd9e',
};

const expectedBaselinePages = {
  'demo-a': {
    page: 'demo-a',
    title: 'v5 · Home · Demo A — ZHIXIN RUBBER MATERIAL',
    descriptions: 0,
    canonicals: 0,
    h1Count: 1,
    jsonLdBlocks: 0,
    imageCount: 7,
    imagesWithoutDimensions: 7,
    base64AssetCount: 16,
    rawBytes: 8166154,
    gzipBytes: 6167338,
    missingFragmentTargets: [],
  },
  products: {
    page: 'products',
    title: 'v5 · Product Catalog · Demo A — ZHIXIN RUBBER MATERIAL',
    descriptions: 0,
    canonicals: 0,
    h1Count: 1,
    jsonLdBlocks: 0,
    imageCount: 57,
    imagesWithoutDimensions: 57,
    base64AssetCount: 3,
    rawBytes: 3282737,
    gzipBytes: 2457383,
    missingFragmentTargets: [
      'products-v5.html#bushings-mounts-rubber-metal',
      'products-v5.html#seals-gaskets',
      'products-v5.html#boots-bellows-covers',
      'products-v5.html#grommets-plugs-cable-protection',
      'products-v5.html#rollers-wheels-custom-molded',
    ],
  },
  compounds: {
    page: 'compounds',
    title: 'v5 · Rubber Compounds · Demo A — ZHIXIN RUBBER MATERIAL',
    descriptions: 0,
    canonicals: 0,
    h1Count: 1,
    jsonLdBlocks: 0,
    imageCount: 13,
    imagesWithoutDimensions: 13,
    base64AssetCount: 0,
    rawBytes: 43168,
    gzipBytes: 12032,
    missingFragmentTargets: ['compounds-v5.html#families'],
  },
  industries: {
    page: 'industries',
    title: 'v5 · Industries · Demo A — ZHIXIN RUBBER MATERIAL',
    descriptions: 0,
    canonicals: 0,
    h1Count: 1,
    jsonLdBlocks: 0,
    imageCount: 1,
    imagesWithoutDimensions: 1,
    base64AssetCount: 0,
    rawBytes: 34854,
    gzipBytes: 10241,
    missingFragmentTargets: [],
  },
  capabilities: {
    page: 'capabilities',
    title: 'v5 · Capabilities · Demo A — ZHIXIN RUBBER MATERIAL',
    descriptions: 0,
    canonicals: 0,
    h1Count: 1,
    jsonLdBlocks: 0,
    imageCount: 6,
    imagesWithoutDimensions: 6,
    base64AssetCount: 2,
    rawBytes: 373807,
    gzipBytes: 261775,
    missingFragmentTargets: [],
  },
  faq: {
    page: 'faq',
    title: 'Rubber Manufacturing FAQ | ZHIXIN RUBBER MATERIAL',
    descriptions: 1,
    canonicals: 0,
    h1Count: 1,
    jsonLdBlocks: 0,
    imageCount: 1,
    imagesWithoutDimensions: 1,
    base64AssetCount: 1,
    rawBytes: 179759,
    gzipBytes: 123905,
    missingFragmentTargets: [
      'faq-v5.html#faq-moq-lead',
      'faq-v5.html#faq-documents',
    ],
  },
  quote: {
    page: 'quote',
    title: 'v5 · Get a Quote · Demo A — ZHIXIN RUBBER MATERIAL',
    descriptions: 0,
    canonicals: 0,
    h1Count: 1,
    jsonLdBlocks: 0,
    imageCount: 2,
    imagesWithoutDimensions: 2,
    base64AssetCount: 0,
    rawBytes: 39789,
    gzipBytes: 11915,
    missingFragmentTargets: ['quote-v5.html#rfq'],
  },
};

const expectedBaselineTotals = {
  pagesWithoutDescription: 6,
  pagesWithoutCanonical: 7,
  pagesWithoutOpenGraph: 7,
  pagesWithoutHreflang: 7,
  pagesWithoutJsonLd: 7,
  imageCount: 87,
  imagesWithoutDimensions: 87,
  base64AssetCount: 22,
  missingFragmentOccurrences: 10,
  missingFragmentUniqueTargets: 9,
  duplicateIds: 0,
  quoteSubmitButtonCount: 1,
  quoteSubmitDisabled: true,
  quoteSubmitAriaDisabled: true,
};

function isInside(parent, candidate) {
  const path = relative(parent, candidate);
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
}

function decodeEntities(value) {
  return value
    .replace(/&#(x?)([0-9a-f]+);/gi, (_, hex, digits) => {
      const codePoint = Number.parseInt(digits, hex ? 16 : 10);
      try {
        return String.fromCodePoint(codePoint);
      } catch {
        return '\ufffd';
      }
    })
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&');
}

function exactStringCount(value, needle) {
  return value.split(needle).length - 1;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
}

function expectedStructuredData(stem) {
  if (stem === 'demo-a') {
    return {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'Organization',
          '@id': `${SEO_BASE_URL}/#organization`,
          legalName: expectedOrganizationFacts.legalName,
          name: expectedOrganizationFacts.name,
          url: expectedOrganizationFacts.url,
          email: expectedOrganizationFacts.email,
          telephone: expectedOrganizationFacts.telephone,
          address: {
            '@type': 'PostalAddress',
            ...expectedOrganizationFacts.address,
          },
        },
        {
          '@type': 'WebSite',
          '@id': `${SEO_BASE_URL}/#website`,
          url: expectedOrganizationFacts.url,
          name: expectedOrganizationFacts.name,
          publisher: { '@id': `${SEO_BASE_URL}/#organization` },
        },
      ],
    };
  }
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: `${SEO_BASE_URL}/`,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: expectedBreadcrumbNames[stem],
        item: new URL(expectedV5RouteMap[stem], SEO_BASE_URL).href,
      },
    ],
  };
}

function replaceBodyHashTextOnce(value, current, baseline, label) {
  const count = exactStringCount(value, current);
  if (count !== 1) throw new Error(`${label}: expected one exact approved region, found ${count}`);
  return value.replace(current, baseline);
}

function replaceBodyHashPatternOnce(value, pattern, baseline, label) {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const matches = [...value.matchAll(new RegExp(pattern.source, flags))];
  if (matches.length !== 1) throw new Error(`${label}: expected one Gate 5 region, found ${matches.length}`);
  return value.replace(pattern, baseline);
}

function extractApprovedBaselineRegion(source, pattern, label) {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const matches = [...source.matchAll(new RegExp(pattern.source, flags))];
  if (matches.length !== 1) {
    throw new Error(`${label}: expected one locked baseline region, found ${matches.length}`);
  }
  return matches[0][0];
}

function restoreApprovedV5CuratedMediaForVisualHash(bodyHtml, stem) {
  let normalized = bodyHtml;

  if (stem === 'demo-a') {
    const lockedSource = readFileSync(join(defaultRoot, 'demo-a-v4-share.html'), 'utf8');
    const testingBaseline = extractApprovedBaselineRegion(
      lockedSource,
      /<figure class="mfg-photo" data-provenance="素材库\/台账\.md#首页制造六卡双排2026-08-09"><img loading="lazy" src="data:image\/webp;base64,[A-Za-z0-9+/=]+" alt="Mooney viscosity testing equipment for rubber compound"><\/figure>/g,
      'Home compound testing media',
    );
    const packingBaseline = extractApprovedBaselineRegion(
      lockedSource,
      /<figure class="mfg-photo" data-provenance="素材库\/台账\.md#首页制造六卡双排2026-08-09"><img loading="lazy" src="data:image\/webp;base64,[A-Za-z0-9+/=]+" alt="Bagged rubber-related material moving along an industrial conveyor"><\/figure>/g,
      'Home compound packing media',
    );
    normalized = replaceBodyHashTextOnce(
      normalized,
      '<figure class="mfg-photo" data-provenance="https://www.wacker.com/cms/en-us/press-and-media/press/press-releases/2022/detail-176642.html"><img loading="lazy" src="media/v5-curated/compound-testing-elastomer.jpg" alt="Elastomer specimen held in tensile testing grips for material verification"></figure>',
      testingBaseline,
      'Home approved compound testing media',
    );
    normalized = replaceBodyHashTextOnce(
      normalized,
      '<figure class="mfg-photo" data-provenance="https://www.soucy-group.com/en/units/soucy-techno/processes"><img loading="lazy" src="media/v5-curated/compound-packing-sheets.webp" alt="Folded rubber compound sheets prepared in an agreed supply form"></figure>',
      packingBaseline,
      'Home approved compound packing media',
    );
  }

  if (stem === 'products') {
    normalized = replaceBodyHashTextOnce(
      normalized,
      `      <div class="gal fade photo" data-asset="P-020" data-name="catalog.card-custom-sealing-profiles" data-provenance="https://www.nufox.com/products/rubber-extrusions">
        <img loading="lazy" src="media/v5-curated/custom-sealing-profiles.webp" alt="Custom rubber sealing profiles — application examples"><span>Custom Sealing Profiles · application examples</span>
      </div>`,
      `      <div class="gal fade photo" data-asset="P-020" data-name="catalog.card-door-seal-production-line">
        <img loading="lazy" src="media/gallery/ph-wm-line.webp" alt="Door Seal Production Line — application example"><span>Door Seal Production Line · application example</span>
      </div>`,
      'Products approved custom sealing profiles media',
    );
  }

  return normalized;
}

function restoreApprovedQuoteGate5ChangesForVisualHash(bodyHtml, stem) {
  if (stem !== 'quote') return bodyHtml;

  let normalized = bodyHtml;
  normalized = replaceBodyHashTextOnce(
    normalized,
    `<form id="contact-form" class="quotev5-form-grid fade" data-name="contact.form" action="${quoteFormspreeAction}" method="post" data-error-preserves-values="true">`,
    '<form id="contact-form" class="quotev5-form-grid fade" data-name="contact.form">',
    'quote form attributes',
  );
  normalized = replaceBodyHashTextOnce(
    normalized,
    '<div class="fs-msg ok" data-fs-success role="status" aria-live="polite"></div>',
    '<div class="fs-msg ok" data-fs-success></div>',
    'quote success state',
  );
  normalized = replaceBodyHashTextOnce(
    normalized,
    '<div class="fs-msg err" data-fs-error role="alert" aria-live="assertive"></div>',
    '<div class="fs-msg err" data-fs-error></div>',
    'quote error state',
  );

  const gate0ActionRow = `      <div class="quotev5-action-row">
        <div class="quotev5-verification-shell quotev5-verification--unconfigured" aria-live="polite">
              <div class="quotev5-verification-preview" aria-disabled="true">
                <span class="quotev5-verification-box" aria-hidden="true"></span>
                <span class="quotev5-verification-copy"><strong>I'm not a robot</strong><small>Verification setup required</small></span>
                <span class="quotev5-verification-brand"><b>↻</b>reCAPTCHA<br>Privacy · Terms</span>
              </div>
            </div>
        <button type="submit" class="quotev5-submit" data-fs-submit-btn disabled aria-disabled="true" title="Configure reCAPTCHA before enabling submission">Send Request</button>
      </div>
    </form>`;
  normalized = replaceBodyHashPatternOnce(
    normalized,
    /      <div class="quotev5-action-row">[\s\S]*?\n    <\/form>/g,
    gate0ActionRow,
    'quote verification and privacy row',
  );
  normalized = replaceBodyHashPatternOnce(
    normalized,
    /\n\n    <div id="quote-privacy-dialog"[\s\S]*?(?=\n\n    <div class="quotev5-contact-row)/g,
    '',
    'quote privacy dialog',
  );

  const gate0UnavailableVerification = `  const unavailableVerification = document.querySelector('.quotev5-verification--unconfigured');
  if (unavailableVerification) {
    const submit = unavailableVerification.closest('form')?.querySelector('[data-fs-submit-btn]');
    if (submit) {
      const keepSubmitDisabled = () => {
        if (!submit.disabled) submit.disabled = true;
        if (submit.getAttribute('aria-disabled') !== 'true') submit.setAttribute('aria-disabled', 'true');
      };
      keepSubmitDisabled();
      const disabledObserver = new MutationObserver(keepSubmitDisabled);
      disabledObserver.observe(submit, { attributes: true, attributeFilter: ['disabled', 'aria-disabled'] });
    }
  }`;
  normalized = replaceBodyHashPatternOnce(
    normalized,
    /\n\n  const quoteForm = document\.getElementById\('contact-form'\);[\s\S]*?(?=\n\}\)\(\);\n<\/script>)/g,
    `\n\n${gate0UnavailableVerification}`,
    'quote submission and privacy script',
  );

  const gate5ShellEnd = `/* SHELL:JS AUTO END */

</script>


<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>`;
  const gate0ShellEnd = `/* SHELL:JS AUTO END */

/* Formspree init(同现站 formId;文案英文硬编码,demo 单语言) */
window.formspree = window.formspree || function(){ (formspree.q = formspree.q || []).push(arguments); };
formspree('initForm', { formElement: '#contact-form', formId: 'xkoevwql',
  onSuccess: function(){ document.querySelector('[data-fs-success]').textContent='Thank you! Your inquiry has been sent. We will reply within 24 hours.'; },
  onError: function(){ document.querySelector('[data-fs-error]').textContent='Something went wrong. Please try again or email us directly.'; }
});
</script>
<script src="https://unpkg.com/@formspree/ajax@1" defer></script>
`;
  normalized = replaceBodyHashTextOnce(
    normalized,
    gate5ShellEnd,
    gate0ShellEnd,
    'quote verification and submission loaders',
  );
  return normalized;
}

function restoreApprovedGate6CopyForVisualHash(bodyHtml, stem) {
  const pageCopy = approvedGate6Copy[stem];
  if (!pageCopy) throw new Error(`${stem}: missing Gate 6 approved-copy configuration`);

  let normalized = bodyHtml;
  for (const [field, copy] of Object.entries(pageCopy)) {
    const approvedCount = exactStringCount(normalized, copy.approved);
    const baselineCount = exactStringCount(normalized, copy.baseline);
    if (approvedCount === 1 && baselineCount === 0) {
      normalized = normalized.replace(copy.approved, copy.baseline);
      continue;
    }
    if (approvedCount === 0 && baselineCount === 1) continue;
    throw new Error(
      `${stem}: Gate 6 ${field} must match exactly one approved or baseline sentence`,
    );
  }
  return normalized;
}

function normalizeApprovedLinkChangesForBodyHash(bodyHtml, stem) {
  const replacements = {
    'demo-a': [
      ['href="quote-v5.html#contact"', 'href="quote-v5.html#rfq"', 2],
      [
        'data-name="products.homecat-vibration-control" href="products-v5.html#c-automotive"',
        'data-name="products.homecat-vibration-control" href="products-v5.html#bushings-mounts-rubber-metal"',
        1,
      ],
      [
        'data-name="products.homecat-seals-extrusions" href="products-v5.html#c-sealing"',
        'data-name="products.homecat-seals-extrusions" href="products-v5.html#seals-gaskets"',
        1,
      ],
      [
        'data-name="products.homecat-boots-bellows" href="products-v5.html#c-automotive"',
        'data-name="products.homecat-boots-bellows" href="products-v5.html#boots-bellows-covers"',
        1,
      ],
      [
        'data-name="products.homecat-cable-protection" href="products-v5.html#c-automotive"',
        'data-name="products.homecat-cable-protection" href="products-v5.html#grommets-plugs-cable-protection"',
        1,
      ],
      [
        'data-name="products.homecat-rollers-custom" href="products-v5.html#c-industrial"',
        'data-name="products.homecat-rollers-custom" href="products-v5.html#rollers-wheels-custom-molded"',
        1,
      ],
      [
        'data-name="products.homecat-rubber-compounds" href="compounds-v5.html#compound-primary"',
        'data-name="products.homecat-rubber-compounds" href="compounds-v5.html#families"',
        1,
      ],
    ],
    faq: [
      ['<details data-name="faq.item-8" id="faq-moq-lead">', '<details data-name="faq.item-8">', 1],
      ['<details data-name="faq.item-12" id="faq-documents">', '<details data-name="faq.item-12">', 1],
    ],
  };

  let normalized = bodyHtml;
  for (const [approved, baseline, expectedCount] of replacements[stem] ?? []) {
    if (exactStringCount(normalized, approved) === expectedCount) normalized = normalized.replaceAll(approved, baseline);
  }
  return normalized;
}

function releaseV5HrefToPreview(href) {
  if (typeof href !== 'string') return href;
  for (const [targetStem, route] of Object.entries(V5_ROUTE_MAP)) {
    if (route === '/') {
      if (href === '/' || href.startsWith('/?') || href.startsWith('/#')) {
        return `${targetStem}-v5.html${href.slice(1)}`;
      }
      continue;
    }
    if (href.startsWith(route)) return `${targetStem}-v5.html${href.slice(route.length)}`;
  }
  return href;
}

function previewV5HrefForProfile(href, profile) {
  if (profile === 'preview') return href;
  for (const [targetStem, route] of Object.entries(V5_ROUTE_MAP)) {
    const fileName = `${targetStem}-v5.html`;
    if (href.startsWith(fileName)) return `${route}${href.slice(fileName.length)}`;
  }
  return href;
}

function restoreV5ReleaseChangesForVisualHash(bodyHtml, profile) {
  if (profile === 'preview') return bodyHtml;
  let normalized = bodyHtml.replace(
    /(\bhref\s*=\s*)(["'])([^"']*)\2/gi,
    (match, prefix, quote, href) => `${prefix}${quote}${releaseV5HrefToPreview(href)}${quote}`,
  );
  normalized = normalized.replaceAll('/LOGO/', '../LOGO/');
  normalized = normalized.replace(/(["'(=])\/media\//g, '$1media/');
  normalized = normalized.replaceAll('build_shell.py', 'design-demos/build_shell.py');
  normalized = normalized.replaceAll('industries-spacer', 'industries-v5-spacer');
  return normalized;
}

export function normalizeV5BodyForVisualHash(bodyHtml, stem, { profile = 'preview' } = {}) {
  if (!profiles.has(profile)) throw new Error(`Unknown visual hash profile: ${String(profile)}`);
  const profileBaselineBodyHtml = restoreV5ReleaseChangesForVisualHash(bodyHtml, profile);
  const performanceBaselineBodyHtml = restoreV5PerformanceChangesForVisualHash(profileBaselineBodyHtml, stem);
  const curatedMediaBaselineBodyHtml = restoreApprovedV5CuratedMediaForVisualHash(performanceBaselineBodyHtml, stem);
  const gate5BaselineBodyHtml = restoreApprovedQuoteGate5ChangesForVisualHash(curatedMediaBaselineBodyHtml, stem);
  const gate6BaselineBodyHtml = restoreApprovedGate6CopyForVisualHash(gate5BaselineBodyHtml, stem);
  return normalizeApprovedLinkChangesForBodyHash(gate6BaselineBodyHtml, stem);
}

function findTagEnd(html, start, label) {
  let quote = null;
  for (let index = start + 1; index < html.length; index += 1) {
    const character = html[index];
    if (quote) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === '<') throw new Error(`${label}: malformed tag beginning at byte ${start}`);
    if (character === '>') return index;
  }
  throw new Error(`${label}: unterminated tag beginning at byte ${start}`);
}

function parseAttributes(source, label) {
  const attributes = new Map();
  let index = 0;
  while (index < source.length) {
    while (/\s/.test(source[index] ?? '')) index += 1;
    if (index >= source.length) break;

    const nameMatch = source.slice(index).match(/^[^\s"'<>\/=]+/);
    if (!nameMatch) throw new Error(`${label}: malformed attribute list`);
    const originalName = nameMatch[0];
    const name = originalName.toLowerCase();
    index += originalName.length;
    while (/\s/.test(source[index] ?? '')) index += 1;

    let value = null;
    if (source[index] === '=') {
      index += 1;
      while (/\s/.test(source[index] ?? '')) index += 1;
      if (index >= source.length) throw new Error(`${label}: attribute ${originalName} has no value`);
      const quote = source[index];
      if (quote === '"' || quote === "'") {
        const end = source.indexOf(quote, index + 1);
        if (end < 0) throw new Error(`${label}: attribute ${originalName} has an unterminated value`);
        value = decodeEntities(source.slice(index + 1, end));
        index = end + 1;
      } else {
        const valueMatch = source.slice(index).match(/^[^\s"'=<>`]+/);
        if (!valueMatch) throw new Error(`${label}: attribute ${originalName} has an invalid value`);
        value = decodeEntities(valueMatch[0]);
        index += valueMatch[0].length;
      }
    }

    if (attributes.has(name)) throw new Error(`${label}: duplicate attribute ${originalName}`);
    attributes.set(name, value);
  }
  return attributes;
}

function tokenizeHtml(html, label) {
  const tokens = [];
  let index = 0;
  while (index < html.length) {
    const start = html.indexOf('<', index);
    if (start < 0) break;

    if (html.startsWith('<!--', start)) {
      const end = html.indexOf('-->', start + 4);
      if (end < 0) throw new Error(`${label}: unterminated HTML comment`);
      index = end + 3;
      continue;
    }

    if (/^<!doctype\b/i.test(html.slice(start))) {
      const end = findTagEnd(html, start, label);
      tokens.push({ type: 'doctype', raw: html.slice(start, end + 1), start, end: end + 1 });
      index = end + 1;
      continue;
    }

    if (html.startsWith('<!', start) || html.startsWith('<?', start)) {
      throw new Error(`${label}: unsupported declaration beginning at byte ${start}`);
    }

    const looksLikeTag = /^<\s*\/?\s*[a-z]/i.test(html.slice(start));
    if (!looksLikeTag) {
      index = start + 1;
      continue;
    }

    const end = findTagEnd(html, start, label);
    const raw = html.slice(start, end + 1);
    const closingMatch = raw.match(/^<\s*\/\s*([a-z][a-z0-9:-]*)\s*>$/i);
    if (closingMatch) {
      tokens.push({
        type: 'tag',
        name: closingMatch[1].toLowerCase(),
        closing: true,
        attributes: new Map(),
        raw,
        start,
        end: end + 1,
      });
      index = end + 1;
      continue;
    }

    const openingMatch = raw.match(/^<\s*([a-z][a-z0-9:-]*)/i);
    if (!openingMatch) throw new Error(`${label}: malformed tag beginning at byte ${start}`);
    const name = openingMatch[1].toLowerCase();
    let attributeSource = raw.slice(openingMatch[0].length, -1);
    const selfClosing = /\/\s*$/.test(attributeSource);
    if (selfClosing) attributeSource = attributeSource.replace(/\/\s*$/, '');
    const token = {
      type: 'tag',
      name,
      closing: false,
      selfClosing,
      attributes: parseAttributes(attributeSource, `${label}: <${name}>`),
      raw,
      start,
      end: end + 1,
    };
    tokens.push(token);

    if (!selfClosing && (name === 'script' || name === 'style')) {
      const closePattern = new RegExp(`</${name}\\s*>`, 'ig');
      closePattern.lastIndex = end + 1;
      const close = closePattern.exec(html);
      if (!close) throw new Error(`${label}: missing </${name}>`);
      token.content = html.slice(end + 1, close.index);
      tokens.push({
        type: 'tag',
        name,
        closing: true,
        attributes: new Map(),
        raw: close[0],
        start: close.index,
        end: close.index + close[0].length,
      });
      index = close.index + close[0].length;
      continue;
    }

    index = end + 1;
  }
  return tokens;
}

function tags(tokens, name, closing = false) {
  return tokens.filter((token) => token.type === 'tag' && token.name === name && token.closing === closing);
}

function validateTagNesting(tokens, label) {
  const stack = [];
  for (const token of tokens) {
    if (token.type !== 'tag') continue;
    if (!token.closing) {
      if (!token.selfClosing && !voidElements.has(token.name)) stack.push(token);
      continue;
    }
    const opening = stack.pop();
    if (!opening) throw new Error(`${label}: unexpected </${token.name}>`);
    if (opening.name !== token.name) {
      throw new Error(`${label}: expected </${opening.name}> before </${token.name}>`);
    }
  }
  if (stack.length) throw new Error(`${label}: missing </${stack.at(-1).name}>`);
}

function validateDocumentStructure(html, tokens, label) {
  const doctypes = tokens.filter((token) => token.type === 'doctype');
  if (doctypes.length !== 1 || !/^<!doctype\s+html\s*>$/i.test(doctypes[0].raw)) {
    throw new Error(`${label}: expected exactly one HTML5 doctype`);
  }
  validateTagNesting(tokens, label);

  const htmlOpen = tags(tokens, 'html');
  const htmlClose = tags(tokens, 'html', true);
  const headOpen = tags(tokens, 'head');
  const headClose = tags(tokens, 'head', true);
  const bodyOpen = tags(tokens, 'body');
  const bodyClose = tags(tokens, 'body', true);
  const structuralCounts = [htmlOpen, htmlClose, headOpen, headClose, bodyOpen, bodyClose];
  if (structuralCounts.some((matches) => matches.length !== 1)) {
    throw new Error(`${label}: expected one explicit html, head, and body opening/closing pair`);
  }

  const ordered = [
    doctypes[0].start,
    htmlOpen[0].start,
    headOpen[0].start,
    headClose[0].start,
    bodyOpen[0].start,
    bodyClose[0].start,
    htmlClose[0].start,
  ];
  if (ordered.some((position, index) => index > 0 && position <= ordered[index - 1])) {
    throw new Error(`${label}: document structure is out of order`);
  }
  if (html.slice(htmlClose[0].end).trim()) throw new Error(`${label}: content appears after </html>`);

  const titleOpen = tags(tokens, 'title');
  const titleClose = tags(tokens, 'title', true);
  if (titleOpen.length !== 1 || titleClose.length !== 1 || titleOpen[0].start > titleClose[0].start) {
    throw new Error(`${label}: expected one explicit title element`);
  }
  if (titleOpen[0].start < headOpen[0].end || titleClose[0].end > headClose[0].start) {
    throw new Error(`${label}: title must be inside head`);
  }
  const title = decodeEntities(html.slice(titleOpen[0].end, titleClose[0].start).trim());
  if (!title) throw new Error(`${label}: title is empty`);

  const h1Open = tags(tokens, 'h1');
  const h1Close = tags(tokens, 'h1', true);
  if (h1Open.length !== h1Close.length) throw new Error(`${label}: unbalanced h1 elements`);
  return title;
}

function systemGzipBytes(file, label) {
  const result = spawnSync('gzip', ['-c', file], {
    encoding: null,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw new Error(`${label}: unable to run gzip: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = Buffer.from(result.stderr ?? '').toString('utf8').trim();
    throw new Error(`${label}: gzip failed${detail ? `: ${detail}` : ''}`);
  }
  return result.stdout.length;
}

function collectSchemaTypes(value, output = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectSchemaTypes(item, output);
    return output;
  }
  if (!value || typeof value !== 'object') return output;
  const type = value['@type'];
  if (typeof type === 'string') output.push(type);
  if (Array.isArray(type)) output.push(...type.filter((item) => typeof item === 'string'));
  for (const nested of Object.values(value)) collectSchemaTypes(nested, output);
  return output;
}

function analyzePage(stem, file, html, rawBytes, profile) {
  const label = `${stem}: ${file}`;
  const tokens = tokenizeHtml(html, label);
  const title = validateDocumentStructure(html, tokens, label);
  const startTags = tokens.filter((token) => token.type === 'tag' && !token.closing);
  const metaTags = startTags.filter((token) => token.name === 'meta');
  const linkTags = startTags.filter((token) => token.name === 'link');
  const imageTags = startTags.filter((token) => token.name === 'img');
  const descriptions = metaTags.filter((token) => token.attributes.get('name')?.toLowerCase() === 'description');
  const canonicals = linkTags.filter((token) =>
    (token.attributes.get('rel') ?? '').toLowerCase().split(/\s+/).includes('canonical'));
  const icons = linkTags.filter((token) =>
    (token.attributes.get('rel') ?? '').toLowerCase().split(/\s+/).includes('icon'));
  const hreflangs = linkTags.filter((token) => token.attributes.has('hreflang'));
  const openGraph = new Map();
  const twitter = new Map();
  const robots = [];
  for (const token of metaTags) {
    const key = (token.attributes.get('property') ?? token.attributes.get('name') ?? '').toLowerCase();
    const content = token.attributes.get('content') ?? '';
    if (key.startsWith('og:')) openGraph.set(key, [...(openGraph.get(key) ?? []), content]);
    if (key.startsWith('twitter:')) twitter.set(key, [...(twitter.get(key) ?? []), content]);
    if (key === 'robots') robots.push(content);
  }

  const jsonLd = [];
  for (const token of startTags.filter((entry) => entry.name === 'script')) {
    if ((token.attributes.get('type') ?? '').toLowerCase() !== 'application/ld+json') continue;
    const source = token.content?.trim() ?? '';
    if (!source) throw new Error(`${label}: empty JSON-LD block`);
    let value;
    try {
      value = JSON.parse(source);
    } catch (error) {
      throw new Error(`${label}: malformed JSON-LD: ${error.message}`);
    }
    jsonLd.push({ value, types: collectSchemaTypes(value) });
  }

  const ids = new Map();
  for (const token of startTags) {
    if (!token.attributes.has('id')) continue;
    const id = token.attributes.get('id') ?? '';
    ids.set(id, (ids.get(id) ?? 0) + 1);
  }
  const duplicateIds = [...ids.entries()].filter(([, count]) => count > 1).map(([id]) => id);
  const imagesWithoutDimensions = imageTags.filter((token) => {
    const width = token.attributes.get('width') ?? '';
    const height = token.attributes.get('height') ?? '';
    return !/^[1-9]\d*$/.test(width) || !/^[1-9]\d*$/.test(height);
  });
  const base64AssetCount = (html.match(/data:(?:image|video)\/[a-z0-9.+-]+(?:;[^;,]+)*;base64,/gi) ?? []).length;
  const fileName = `${stem}-v5.html`;
  const bodyOpen = tags(tokens, 'body')[0];
  const bodyClose = tags(tokens, 'body', true)[0];
  const bodyHtml = html.slice(bodyOpen.start, bodyClose.end);
  const visualBaselineBodyHtml = normalizeV5BodyForVisualHash(bodyHtml, stem, { profile });

  return {
    stem,
    file,
    fileName,
    html,
    tokens: startTags,
    title,
    descriptions,
    canonicals,
    icons,
    hreflangs,
    openGraph,
    twitter,
    robots,
    jsonLd,
    imageTags,
    imagesWithoutDimensions,
    base64AssetCount,
    ids,
    duplicateIds,
    bodySha256: createHash('sha256').update(visualBaselineBodyHtml).digest('hex'),
    rawBytes,
    gzipBytes: systemGzipBytes(file, label),
  };
}

function normalizeFragmentTarget(sourceFile, href, knownFiles, profile) {
  const decodedHref = profile === 'release'
    ? releaseV5HrefToPreview(decodeEntities(href))
    : decodeEntities(href);
  const hashIndex = decodedHref.indexOf('#');
  if (hashIndex < 0 || hashIndex === decodedHref.length - 1) return null;
  const beforeHash = decodedHref.slice(0, hashIndex);
  if (/^[a-z][a-z0-9+.-]*:/i.test(beforeHash) || beforeHash.startsWith('//') || beforeHash.startsWith('/')) {
    return null;
  }
  let fragment;
  try {
    fragment = decodeURIComponent(decodedHref.slice(hashIndex + 1));
  } catch {
    throw new Error(`${sourceFile}: malformed percent-encoding in fragment href ${href}`);
  }
  const pathPart = beforeHash.split('?', 1)[0];
  let targetFile = sourceFile;
  if (pathPart) {
    let decodedPath;
    try {
      decodedPath = decodeURIComponent(pathPart);
    } catch {
      throw new Error(`${sourceFile}: malformed percent-encoding in href ${href}`);
    }
    targetFile = posix.normalize(posix.join(posix.dirname(sourceFile), decodedPath.replace(/^\.\//, '')));
  }
  if (!knownFiles.has(targetFile)) return null;
  return { targetFile, fragment, target: `${targetFile}#${fragment}` };
}

function findMissingFragments(documents, profile) {
  const byFile = new Map(documents.map((document) => [document.fileName, document]));
  const missing = [];
  for (const document of documents) {
    for (const token of document.tokens) {
      if (!token.attributes.has('href')) continue;
      const href = token.attributes.get('href') ?? '';
      const target = normalizeFragmentTarget(document.fileName, href, byFile, profile);
      if (!target) continue;
      if (!byFile.get(target.targetFile).ids.has(target.fragment)) {
        missing.push({ source: document.fileName, href, ...target });
      }
    }
  }
  return missing;
}

function findQuoteState(documents) {
  const quote = documents.find((document) => document.stem === 'quote');
  if (!quote) {
    return {
      submitButtonCount: 0,
      submitDisabled: false,
      submitAriaDisabled: false,
      formspreeConfigured: false,
      requiredFields: [],
      labeledRequiredFields: [],
      hasEmailFallback: false,
      hasWhatsAppFallback: false,
      hasPrivacyLink: false,
      hasPrivacyDialog: false,
      privacyExplainsFormData: false,
      privacyExplainsProvider: false,
      privacyExplainsPurpose: false,
      privacyExplainsRetention: false,
      privacyHasContactRoute: false,
      privacyRejectsMarketingConsent: false,
      marketingConsentFields: 0,
      turnstileWidgetCount: 0,
      turnstileSiteKey: '',
      turnstileMode: '',
      turnstileExpectedHostname: '',
      hasTurnstileLoader: false,
      hasAccessibleVerificationStatus: false,
      hasTurnstileCallbacks: false,
      hasLegacyHybridCompatibilityMarker: false,
      hasUnconfiguredVerification: false,
      hasSubmitDisablingObserver: false,
      hasAccessibleSuccessState: false,
      hasAccessibleErrorState: false,
      preservesValuesOnError: false,
    };
  }
  const submitButtons = quote.tokens.filter((token) =>
    token.name === 'button'
    && (token.attributes.get('type') ?? 'submit').toLowerCase() === 'submit'
    && (token.attributes.get('class') ?? '').split(/\s+/).includes('quotev5-submit'));
  const requiredFields = quote.tokens
    .filter((token) => ['input', 'textarea'].includes(token.name) && token.attributes.has('required'))
    .map((token) => token.attributes.get('name') ?? '')
    .filter(Boolean);
  const labelsByTarget = new Set(quote.tokens
    .filter((token) => token.name === 'label' && token.attributes.has('for'))
    .map((token) => token.attributes.get('for')));
  const labeledRequiredFields = quote.tokens
    .filter((token) => ['input', 'textarea'].includes(token.name) && token.attributes.has('required'))
    .filter((token) => {
      const ariaLabel = token.attributes.get('aria-label') ?? '';
      const ariaLabelledby = token.attributes.get('aria-labelledby') ?? '';
      const id = token.attributes.get('id') ?? '';
      return Boolean(ariaLabel.trim() || ariaLabelledby.trim() || (id && labelsByTarget.has(id)));
    })
    .map((token) => token.attributes.get('name') ?? '')
    .filter(Boolean);
  const hrefs = quote.tokens.filter((token) => token.attributes.has('href')).map((token) => token.attributes.get('href') ?? '');
  const form = quote.tokens.find((token) => token.name === 'form' && token.attributes.get('id') === 'contact-form');
  const turnstileWidgets = quote.tokens.filter((token) =>
    token.name === 'div'
    && (token.attributes.get('class') ?? '').split(/\s+/).includes('cf-turnstile'));
  const turnstileWidget = turnstileWidgets[0];
  const verificationStatus = quote.tokens.find((token) =>
    token.attributes.get('id') === 'quote-verification-status');
  const privacyDialog = quote.tokens.find((token) =>
    token.attributes.get('id') === 'quote-privacy-dialog');
  const successState = quote.tokens.find((token) => token.attributes.has('data-fs-success'));
  const errorState = quote.tokens.find((token) =>
    token.attributes.has('data-fs-error') && !token.attributes.get('data-fs-error'));
  const privacyCopy = quote.html.toLowerCase();
  const marketingConsentFields = quote.tokens.filter((token) => {
    if (token.name !== 'input') return false;
    const type = (token.attributes.get('type') ?? '').toLowerCase();
    const name = (token.attributes.get('name') ?? '').toLowerCase();
    return type === 'checkbox' || /marketing|newsletter|subscribe|consent/.test(name);
  }).length;
  const resetCalls = quote.html.match(/\bquoteForm\.reset\(\)/g) ?? [];
  return {
    submitButtonCount: submitButtons.length,
    submitDisabled: submitButtons.length === 1 && submitButtons[0].attributes.has('disabled'),
    submitAriaDisabled: submitButtons.length === 1 && submitButtons[0].attributes.get('aria-disabled') === 'true',
    formspreeConfigured: Boolean(
      form
      && form.attributes.get('action') === quoteFormspreeAction
      && (form.attributes.get('method') ?? '').toLowerCase() === 'post'),
    requiredFields,
    labeledRequiredFields,
    hasEmailFallback: hrefs.includes('mailto:martin@zxrubbertech.com'),
    hasWhatsAppFallback: hrefs.includes('https://wa.me/8615256225135'),
    hasPrivacyLink: quote.tokens.some((token) =>
      ['a', 'button'].includes(token.name)
      && /privacy/i.test(`${token.attributes.get('href') ?? ''} ${token.attributes.get('aria-label') ?? ''} ${token.raw}`)),
    hasPrivacyDialog: Boolean(
      privacyDialog
      && privacyDialog.attributes.get('role') === 'dialog'
      && privacyDialog.attributes.get('aria-modal') === 'true'
      && privacyDialog.attributes.has('hidden')),
    privacyExplainsFormData: /name, company, email, phone, and project requirements/.test(privacyCopy),
    privacyExplainsProvider: /cloudflare turnstile/.test(privacyCopy),
    privacyExplainsPurpose: /respond to your inquiry/.test(privacyCopy) && /quotation/.test(privacyCopy),
    privacyExplainsRetention: /retain[^<]{0,160}only for as long as/.test(privacyCopy),
    privacyHasContactRoute: hrefs.includes('mailto:martin@zxrubbertech.com')
      && /access, correct, or delete/.test(privacyCopy),
    privacyRejectsMarketingConsent: /does not subscribe you to marketing communications/.test(privacyCopy),
    marketingConsentFields,
    turnstileWidgetCount: turnstileWidgets.length,
    turnstileSiteKey: turnstileWidget?.attributes.get('data-sitekey') ?? '',
    turnstileMode: turnstileWidget?.attributes.get('data-zx-turnstile-mode') ?? '',
    turnstileExpectedHostname: turnstileWidget?.attributes.get('data-zx-expected-hostname') ?? '',
    hasTurnstileLoader: quote.html.includes('https://challenges.cloudflare.com/turnstile/v0/api.js'),
    hasAccessibleVerificationStatus: Boolean(
      verificationStatus
      && verificationStatus.attributes.get('role') === 'status'
      && verificationStatus.attributes.get('aria-live') === 'polite'
      && turnstileWidget?.attributes.get('aria-describedby') === 'quote-verification-status'),
    hasTurnstileCallbacks: Boolean(
      turnstileWidget?.attributes.get('data-callback') === 'zxTurnstileVerified'
      && turnstileWidget?.attributes.get('data-error-callback') === 'zxTurnstileError'
      && turnstileWidget?.attributes.get('data-expired-callback') === 'zxTurnstileExpired'),
    hasLegacyHybridCompatibilityMarker: quote.tokens.some((token) =>
      token.name === 'div'
      && token.attributes.get('class') === 'g-recaptcha'
      && token.attributes.get('data-hybrid-verification-compat') === 'turnstile'),
    hasUnconfiguredVerification: /Verification setup required|quotev5-verification--unconfigured|google\.com\/recaptcha|grecaptcha\./.test(quote.html),
    hasSubmitDisablingObserver: /MutationObserver[\s\S]{0,600}data-fs-submit-btn|keepSubmitDisabled/.test(quote.html),
    hasAccessibleSuccessState: Boolean(
      successState
      && successState.attributes.get('role') === 'status'
      && successState.attributes.get('aria-live') === 'polite'
      && quote.html.includes('Thank you! Your inquiry has been sent. We will reply within 24 hours.')),
    hasAccessibleErrorState: Boolean(
      errorState
      && errorState.attributes.get('role') === 'alert'
      && errorState.attributes.get('aria-live') === 'assertive'
      && quote.html.includes('Your entered details have been kept.')),
    hasSafeFormspreeFailureDiagnostic: Boolean(
      quote.html.includes('const sanitizeFormspreeFailureDetail = (value) =>')
      && quote.html.includes('const readFormspreeFailureDetail = async (response) =>')
      && quote.html.includes('await response.clone().json()')
      && quote.html.includes("Formspree HTTP ' + response.status")
      && quote.html.includes("'[redacted]'")
      && !quote.html.includes('JSON.stringify(payload)')
      && !quote.html.includes('error.message')),
    distinguishesFormspreeNetworkFailure: quote.html.includes(
      'Request could not reach Formspree (network error). Please try again or email us directly. Your entered details have been kept.'),
    preservesValuesOnError: form?.attributes.get('data-error-preserves-values') === 'true'
      && resetCalls.length === 1,
  };
}

function buildMetrics(documents, profile) {
  const missingFragments = findMissingFragments(documents, profile);
  const missingTargetsByFile = new Map();
  for (const occurrence of missingFragments) {
    if (!missingTargetsByFile.has(occurrence.targetFile)) missingTargetsByFile.set(occurrence.targetFile, new Set());
    missingTargetsByFile.get(occurrence.targetFile).add(occurrence.target);
  }
  const quote = findQuoteState(documents);
  const pages = documents.map((document) => ({
    page: document.stem,
    title: document.title,
    descriptions: document.descriptions.length,
    canonicals: document.canonicals.length,
    h1Count: document.tokens.filter((token) => token.name === 'h1').length,
    jsonLdBlocks: document.jsonLd.length,
    imageCount: document.imageTags.length,
    imagesWithoutDimensions: document.imagesWithoutDimensions.length,
    base64AssetCount: document.base64AssetCount,
    rawBytes: document.rawBytes,
    gzipBytes: document.gzipBytes,
    missingFragmentTargets: [...(missingTargetsByFile.get(document.fileName) ?? [])],
  }));
  const totals = {
    pagesWithoutDescription: documents.filter((document) => document.descriptions.length === 0).length,
    pagesWithoutCanonical: documents.filter((document) => document.canonicals.length === 0).length,
    pagesWithoutOpenGraph: documents.filter((document) => document.openGraph.size === 0).length,
    pagesWithoutHreflang: documents.filter((document) => document.hreflangs.length === 0).length,
    pagesWithoutJsonLd: documents.filter((document) => document.jsonLd.length === 0).length,
    imageCount: pages.reduce((total, page) => total + page.imageCount, 0),
    imagesWithoutDimensions: pages.reduce((total, page) => total + page.imagesWithoutDimensions, 0),
    base64AssetCount: pages.reduce((total, page) => total + page.base64AssetCount, 0),
    rawBytes: pages.reduce((total, page) => total + page.rawBytes, 0),
    gzipBytes: pages.reduce((total, page) => total + page.gzipBytes, 0),
    missingFragmentOccurrences: missingFragments.length,
    missingFragmentUniqueTargets: new Set(missingFragments.map((occurrence) => occurrence.target)).size,
    duplicateIds: documents.reduce((total, document) => total + document.duplicateIds.length, 0),
    quoteSubmitButtonCount: quote.submitButtonCount,
    quoteSubmitDisabled: quote.submitDisabled,
    quoteSubmitAriaDisabled: quote.submitAriaDisabled,
  };
  return { publicPages: documents.length, pages, totals, quote, missingFragments };
}

function addFailure(failures, message) {
  if (!failures.includes(message)) failures.push(message);
}

function assertBaseline(metrics, failures) {
  if (metrics.publicPages !== PUBLIC_V5_PAGES.length) {
    addFailure(failures, `baseline: expected ${PUBLIC_V5_PAGES.length} public pages, found ${metrics.publicPages}`);
  }
  for (const stem of PUBLIC_V5_PAGES) {
    const actual = metrics.pages.find((page) => page.page === stem);
    const expected = expectedBaselinePages[stem];
    if (!actual) {
      addFailure(failures, `baseline: missing metrics for ${stem}`);
      continue;
    }
    for (const [field, expectedValue] of Object.entries(expected)) {
      if (JSON.stringify(actual[field]) !== JSON.stringify(expectedValue)) {
        addFailure(
          failures,
          `baseline: ${stem}.${field} expected ${JSON.stringify(expectedValue)}, found ${JSON.stringify(actual[field])}`,
        );
      }
    }
  }
  for (const [field, expectedValue] of Object.entries(expectedBaselineTotals)) {
    if (metrics.totals[field] !== expectedValue) {
      addFailure(failures, `baseline: totals.${field} expected ${expectedValue}, found ${metrics.totals[field]}`);
    }
  }
}

function assertRobotsProfile(document, profile, failures) {
  if (document.robots.length !== 1) {
    addFailure(failures, `${document.stem}: expected exactly one robots meta for ${profile}`);
    return;
  }
  const directives = new Set(document.robots[0].toLowerCase().split(/[\s,]+/).filter(Boolean));
  const expected = profile === 'preview' ? ['noindex', 'nofollow'] : ['index', 'follow'];
  if (directives.size !== 2 || expected.some((directive) => !directives.has(directive))) {
    addFailure(failures, `${document.stem}: robots meta must be ${expected.join(',')}`);
  }
}

function assertMetadata(documents, profile, failures) {
  const titles = new Set();
  const descriptions = new Set();
  const canonicals = new Set();
  for (const document of documents) {
    const expectedPage = seoPages[document.stem];
    const expectedCanonical = getSeoCanonicalUrl(document.stem);
    if (document.bodySha256 !== expectedGate0BodySha256[document.stem]) {
      addFailure(failures, `${document.stem}: body differs from the Gate 0 visual baseline`);
    }
    if (/\bv5\b|Demo A/i.test(document.title)) addFailure(failures, `${document.stem}: title contains a demo identifier`);
    if (document.title !== expectedPage.title) addFailure(failures, `${document.stem}: title does not match the SEO configuration`);
    if (titles.has(document.title)) addFailure(failures, `${document.stem}: duplicate title ${document.title}`);
    titles.add(document.title);
    if (document.descriptions.length !== 1) {
      addFailure(failures, `${document.stem}: expected exactly one meta description`);
    } else {
      const value = document.descriptions[0].attributes.get('content')?.trim() ?? '';
      if (!value) addFailure(failures, `${document.stem}: meta description is empty`);
      if (value !== expectedPage.description) addFailure(failures, `${document.stem}: meta description does not match the SEO configuration`);
      if (descriptions.has(value)) addFailure(failures, `${document.stem}: duplicate meta description`);
      descriptions.add(value);
    }
    if (document.canonicals.length !== 1) {
      addFailure(failures, `${document.stem}: expected exactly one canonical`);
    } else {
      const value = document.canonicals[0].attributes.get('href') ?? '';
      let parsed;
      try {
        parsed = new URL(value);
      } catch {
        addFailure(failures, `${document.stem}: canonical is not an absolute URL`);
      }
      if (parsed && (parsed.protocol !== 'https:' || parsed.hostname !== new URL(SEO_BASE_URL).hostname)) {
        addFailure(failures, `${document.stem}: canonical must use ${SEO_BASE_URL}`);
      }
      if (value !== expectedCanonical) addFailure(failures, `${document.stem}: canonical does not match the configured clean path`);
      if (/design-demos|-v5|Demo A/i.test(value)) addFailure(failures, `${document.stem}: canonical contains a demo path`);
      if (canonicals.has(value)) addFailure(failures, `${document.stem}: duplicate canonical path ${value}`);
      canonicals.add(value);
    }
    if (document.icons.length !== 1) {
      addFailure(failures, `${document.stem}: expected exactly one favicon declaration`);
    } else if (document.icons[0].attributes.get('href') !== 'data:,') {
      addFailure(failures, `${document.stem}: favicon must use the approved no-request placeholder`);
    }
    for (const property of requiredOpenGraph) {
      const values = document.openGraph.get(property) ?? [];
      if (values.length !== 1 || !values[0].trim()) addFailure(failures, `${document.stem}: expected one non-empty ${property}`);
    }
    const expectedOpenGraph = {
      'og:type': 'website',
      'og:locale': SEO_SOCIAL_LOCALE,
      'og:site_name': SEO_SITE_NAME,
      'og:title': expectedPage.title,
      'og:description': expectedPage.description,
      'og:url': expectedCanonical,
      'og:image': SEO_SOCIAL_IMAGE,
      'og:image:width': '1200',
      'og:image:height': '630',
    };
    for (const [property, expected] of Object.entries(expectedOpenGraph)) {
      const values = document.openGraph.get(property) ?? [];
      if (values.length !== 1 || values[0] !== expected) {
        addFailure(failures, `${document.stem}: ${property} does not match the SEO configuration`);
      }
    }
    for (const property of requiredTwitter) {
      const values = document.twitter.get(property) ?? [];
      if (values.length !== 1 || !values[0].trim()) addFailure(failures, `${document.stem}: expected one non-empty ${property}`);
    }
    const expectedTwitter = {
      'twitter:card': 'summary_large_image',
      'twitter:title': expectedPage.title,
      'twitter:description': expectedPage.description,
      'twitter:image': SEO_SOCIAL_IMAGE,
    };
    for (const [property, expected] of Object.entries(expectedTwitter)) {
      const values = document.twitter.get(property) ?? [];
      if (values.length !== 1 || values[0] !== expected) {
        addFailure(failures, `${document.stem}: ${property} does not match the SEO configuration`);
      }
    }
    assertRobotsProfile(document, profile, failures);
  }
}

function assertLinks(documents, metrics, profile, failures) {
  if (metrics.totals.missingFragmentOccurrences !== 0) {
    addFailure(
      failures,
      `links: ${metrics.totals.missingFragmentOccurrences} broken fragment occurrences (${metrics.totals.missingFragmentUniqueTargets} unique targets)`,
    );
  }
  if (metrics.totals.duplicateIds !== 0) addFailure(failures, `links: ${metrics.totals.duplicateIds} duplicate IDs`);

  const home = documents.find((document) => document.stem === 'demo-a');
  if (!home) {
    addFailure(failures, 'links: demo-a page is required for exact fragment assertions');
  } else {
    for (const from of Object.keys(approvedFragmentResolutionMap)) {
      const profileTarget = previewV5HrefForProfile(from, profile);
      const count = exactStringCount(home.html, profileTarget);
      if (count !== 0) addFailure(failures, `links: obsolete target ${profileTarget} remains ${count} time(s) on demo-a`);
    }
    for (const [target, expectedCount] of Object.entries(expectedResolvedFragmentCounts)) {
      const profileTarget = previewV5HrefForProfile(target, profile);
      const count = exactStringCount(home.html, profileTarget);
      if (count !== expectedCount) {
        addFailure(failures, `links: expected ${profileTarget} ${expectedCount} time(s) on demo-a, found ${count}`);
      }
    }
  }

  const faq = documents.find((document) => document.stem === 'faq');
  if (!faq) {
    addFailure(failures, 'links: faq page is required for exact fragment assertions');
  } else {
    const expectedFaqTargets = {
      'faq.item-8': 'faq-moq-lead',
      'faq.item-12': 'faq-documents',
    };
    for (const [dataName, id] of Object.entries(expectedFaqTargets)) {
      const matches = faq.tokens.filter((token) =>
        token.name === 'details'
        && token.attributes.get('data-name') === dataName
        && token.attributes.get('id') === id);
      if (matches.length !== 1) {
        addFailure(failures, `links: expected ${id} on exactly one ${dataName} details element`);
      }
    }
  }
}

function normalizeMediaReferenceForProfile(value, profile) {
  if (profile === 'release' && value.startsWith('/')) {
    if (value.startsWith('/media/') || value.startsWith('/LOGO/')) return value.slice(1);
    throw new Error(`release media path is outside /media/ or /LOGO/: ${value}`);
  }
  return normalizeV5ImageSource(value);
}

function imageManifestKeyForProfile(source, profile) {
  if (profile === 'release' && source.startsWith('/')) {
    if (source.startsWith('/media/')) return normalizeV5ImageSource(source.slice(1));
    if (source.startsWith('/LOGO/')) return normalizeV5ImageSource(`..${source}`);
    throw new Error(`release image path is outside /media/ or /LOGO/: ${source}`);
  }
  return normalizeV5ImageSource(source);
}

function collectLocalMediaReferences(document, profile) {
  const references = new Set();
  const add = (value) => {
    if (!value || /^(?:data:|[a-z][a-z0-9+.-]*:|\/\/)/i.test(value)) return;
    const normalized = normalizeMediaReferenceForProfile(value, profile);
    if (/\.(?:jpe?g|mp4|png|svg|webp)$/i.test(normalized)) references.add(normalized);
  };
  for (const token of document.tokens) {
    if (token.name === 'img' || token.name === 'source') add(token.attributes.get('src'));
    if (token.name === 'video') {
      add(token.attributes.get('src'));
      add(token.attributes.get('poster'));
      add(token.attributes.get('data-gated-src'));
    }
  }
  for (const match of document.html.matchAll(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi)) add(match[2]);
  return [...references];
}

function assertPerformance(documents, metrics, profile, root, failures) {
  if (metrics.totals.base64AssetCount !== 0) {
    addFailure(failures, `performance: ${metrics.totals.base64AssetCount} Base64 image/video assets remain`);
  }
  if (/data:(?:image|video)\//i.test(documents.map((document) => document.html).join('\n'))) {
    addFailure(failures, 'performance: a data image/video URI remains');
  }
  if (metrics.totals.imagesWithoutDimensions !== 0) {
    addFailure(failures, `performance: ${metrics.totals.imagesWithoutDimensions} images lack numeric width and height`);
  }
  for (const page of metrics.pages) {
    if (page.rawBytes > 300 * 1024) addFailure(failures, `performance: ${page.page} raw HTML is ${page.rawBytes} bytes`);
  }

  let manifest;
  try {
    manifest = loadV5ImageDimensions();
  } catch (error) {
    addFailure(failures, `performance: ${error.message}`);
  }

  const verifiedFiles = new Set();
  for (const document of documents) {
    if (document.bodySha256 !== expectedGate0BodySha256[document.stem]) {
      addFailure(failures, `${document.stem}: body differs beyond approved Gate 2/3 non-visual transformations`);
    }
    if (document.stem === 'products') {
      const protectedRuleCount = exactStringCount(
        document.html,
        V5_PRODUCTS_GALLERY_RULE_WITH_DIMENSIONS,
      );
      const unprotectedRuleCount = exactStringCount(
        document.html,
        V5_PRODUCTS_GALLERY_RULE_BEFORE_DIMENSIONS,
      );
      if (protectedRuleCount !== 1 || unprotectedRuleCount !== 0) {
        addFailure(
          failures,
          'performance: products gallery must contain exactly one dimension-safe image rule',
        );
      }
    }
    const lazyCount = document.imageTags.filter((token) => token.attributes.get('loading')?.toLowerCase() === 'lazy').length;
    if (lazyCount !== expectedLazyImageCounts[document.stem]) {
      addFailure(
        failures,
        `performance: ${document.stem} expected ${expectedLazyImageCounts[document.stem]} lazy images, found ${lazyCount}`,
      );
    }
    for (const image of document.imageTags) {
      const source = image.attributes.get('src') ?? '';
      if (!source || source.startsWith('data:') || !manifest) continue;
      let key;
      try {
        key = imageManifestKeyForProfile(source, profile);
      } catch (error) {
        addFailure(failures, `performance: ${document.stem} ${error.message}`);
        continue;
      }
      const entry = manifest[key];
      if (!entry) {
        addFailure(failures, `performance: ${document.stem} image is absent from the dimension manifest: ${key}`);
        continue;
      }
      if (image.attributes.get('width') !== String(entry.width)
        || image.attributes.get('height') !== String(entry.height)) {
        addFailure(failures, `performance: ${document.stem} image dimensions do not match intrinsic size: ${key}`);
      }
    }

    let references = [];
    try {
      references = collectLocalMediaReferences(document, profile);
    } catch (error) {
      addFailure(failures, `performance: ${document.stem} ${error.message}`);
    }
    for (const reference of references) {
      const validationRoot = profile === 'release' ? realpathSync(resolve(root)) : repo;
      const file = profile === 'release'
        ? resolve(validationRoot, reference)
        : resolve(dirname(document.file), reference);
      if (!isInside(validationRoot, file)) {
        addFailure(failures, `performance: ${document.stem} media escapes the ${profile} root: ${reference}`);
        continue;
      }
      if (!existsSync(file)) {
        addFailure(failures, `performance: ${document.stem} media is missing: ${reference}`);
        continue;
      }
      const info = lstatSync(file);
      if (info.isSymbolicLink() || !info.isFile() || !isInside(validationRoot, realpathSync(file))) {
        addFailure(failures, `performance: ${document.stem} media must be a ${profile} root file: ${reference}`);
        continue;
      }
      if (reference.startsWith('media/v5-inline/') && !/^media\/v5-inline\/[a-f0-9]{16}\.(?:jpg|png|svg|webp)$/.test(reference)) {
        addFailure(failures, `performance: ${document.stem} inline media path is malformed: ${reference}`);
      }
      const manifestKey = profile === 'release' && reference.startsWith('LOGO/')
        ? `../${reference}`
        : reference;
      if (!manifest?.[manifestKey] || verifiedFiles.has(file)) continue;
      verifiedFiles.add(file);
      const bytes = readFileSync(file);
      const digest = createHash('sha256').update(bytes).digest('hex');
      if (digest !== manifest[manifestKey].sha256) {
        addFailure(failures, `performance: media SHA-256 differs from manifest: ${reference}`);
      }
      if (reference.startsWith('media/v5-inline/')
        && !digest.startsWith(posix.basename(reference).split('.', 1)[0])) {
        addFailure(failures, `performance: inline media filename does not match its SHA-256: ${reference}`);
      }
      try {
        validateV5MediaSignature(bytes, manifest[manifestKey].mime, reference);
      } catch (error) {
        addFailure(failures, `performance: ${error.message}`);
      }
    }
  }
}

function readReleaseArtifact(root, relativePath, label) {
  const resolvedRoot = resolve(root);
  const file = resolve(resolvedRoot, relativePath);
  if (!isInside(resolvedRoot, file)) throw new Error(`${label}: path escapes release root`);
  if (!existsSync(file)) throw new Error(`${label}: missing file ${file}`);
  const info = lstatSync(file);
  if (info.isSymbolicLink() || !info.isFile()) throw new Error(`${label}: expected a regular file ${file}`);
  if (!isInside(realpathSync(resolvedRoot), realpathSync(file))) {
    throw new Error(`${label}: file resolves outside release root`);
  }
  return readFileSync(file, 'utf8');
}

function parseSitemapUrls(xml, label) {
  if (!/<urlset\b[^>]*>[\s\S]*<\/urlset\s*>\s*$/i.test(xml)) throw new Error(`${label}: malformed urlset`);
  const blocks = xml.match(/<url\b[^>]*>[\s\S]*?<\/url\s*>/gi) ?? [];
  const urls = [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((match) => match[1]);
  if (!urls.length || blocks.length !== urls.length) throw new Error(`${label}: every url must contain exactly one loc`);
  if (new Set(urls).size !== urls.length) throw new Error(`${label}: duplicate loc URL`);
  const origin = new URL(SEO_BASE_URL).origin;
  for (const value of urls) {
    let url;
    try {
      url = new URL(value);
    } catch {
      throw new Error(`${label}: invalid loc URL ${value}`);
    }
    if (url.origin !== origin || url.search || url.hash || !url.pathname.endsWith('/')) {
      throw new Error(`${label}: non-canonical loc URL ${value}`);
    }
    if (/design-demos|-v5|assets-v5|about-v5|engineering-v5|manufacturing-v5/i.test(value)) {
      throw new Error(`${label}: demo or compatibility URL ${value}`);
    }
  }
  return urls;
}

function assertReleaseArtifacts(root, failures) {
  const candidateXml = readReleaseArtifact(root, 'sitemap.xml', 'V5 sitemap candidate');
  const candidateUrls = parseSitemapUrls(candidateXml, 'V5 sitemap candidate');
  const productionSitemap = join(repo, 'sitemap.xml');
  const productionInfo = lstatSync(productionSitemap);
  if (productionInfo.isSymbolicLink() || !productionInfo.isFile()) {
    throw new Error('Production sitemap input must be a regular file');
  }
  const productionUrls = parseSitemapUrls(readFileSync(productionSitemap, 'utf8'), 'Production sitemap input');
  const expectedUrls = new Set([
    ...productionUrls,
    ...Object.values(expectedV5RouteMap).map((path) => new URL(path, SEO_BASE_URL).href),
  ]);
  if (candidateUrls.length !== expectedUrls.size) {
    addFailure(failures, `schema: sitemap candidate expected ${expectedUrls.size} URLs, found ${candidateUrls.length}`);
  }
  for (const url of expectedUrls) {
    if (!candidateUrls.includes(url)) addFailure(failures, `schema: sitemap candidate removed or omitted ${url}`);
  }
  for (const url of candidateUrls) {
    if (!expectedUrls.has(url)) addFailure(failures, `schema: sitemap candidate contains unapproved URL ${url}`);
  }
  const robots = readReleaseArtifact(root, 'robots.txt', 'V5 robots candidate');
  const expectedRobots = `User-agent: *\nAllow: /\n\nSitemap: ${SEO_BASE_URL}/sitemap.xml\n`;
  if (robots !== expectedRobots) addFailure(failures, 'schema: release robots candidate differs from the approved content');
}

function assertSchema(documents, profile, root, failures) {
  if (stableJson(V5_ROUTE_MAP) !== stableJson(expectedV5RouteMap)) {
    addFailure(failures, 'schema: V5 route map differs from the approved seven clean routes');
  }
  for (const document of documents) {
    assertRobotsProfile(document, profile, failures);
    const types = document.jsonLd.flatMap((block) => block.types);
    for (const type of types) {
      if (prohibitedSchemaTypes.has(type)) addFailure(failures, `${document.stem}: prohibited schema type ${type}`);
    }
    const required = document.stem === 'demo-a' ? ['Organization', 'WebSite'] : ['BreadcrumbList'];
    for (const type of required) {
      const count = types.filter((candidate) => candidate === type).length;
      if (count !== 1) addFailure(failures, `${document.stem}: expected exactly one ${type} schema node`);
    }
    if (document.jsonLd.length !== 1
      || stableJson(document.jsonLd[0]?.value) !== stableJson(expectedStructuredData(document.stem))) {
      addFailure(failures, `${document.stem}: JSON-LD differs from the approved exact schema`);
    }
    const expectedTypes = document.stem === 'demo-a'
      ? ['Organization', 'PostalAddress', 'WebSite']
      : ['BreadcrumbList', 'ListItem', 'ListItem'];
    if (JSON.stringify([...types].sort()) !== JSON.stringify(expectedTypes.sort())) {
      addFailure(failures, `${document.stem}: JSON-LD contains an unapproved schema type or count`);
    }
    if (profile === 'release') {
      if (/design-demos|-v5|Demo A/i.test(document.html)) {
        addFailure(failures, `${document.stem}: release page contains a demo identifier`);
      }
      const expectedCanonical = new URL(expectedV5RouteMap[document.stem], SEO_BASE_URL).href;
      const actualCanonical = document.canonicals[0]?.attributes.get('href') ?? '';
      if (document.canonicals.length !== 1 || actualCanonical !== expectedCanonical) {
        addFailure(failures, `${document.stem}: release canonical must be ${expectedCanonical}`);
      }
    }
  }
  if (profile === 'release') assertReleaseArtifacts(root, failures);
}

function assertQuote(metrics, profile, failures) {
  const { quote } = metrics;
  if (quote.submitButtonCount !== 1) addFailure(failures, `quote: expected one submit button, found ${quote.submitButtonCount}`);
  if (quote.submitDisabled || quote.submitAriaDisabled) addFailure(failures, 'quote: submit button remains disabled');
  for (const field of ['name', 'email', 'message']) {
    if (!quote.requiredFields.includes(field)) addFailure(failures, `quote: required field ${field} is missing`);
    if (!quote.labeledRequiredFields.includes(field)) addFailure(failures, `quote: required field ${field} has no accessible label`);
  }
  if (!quote.formspreeConfigured) addFailure(failures, `quote: Formspree form ID ${quoteFormspreeFormId} is missing`);
  if (quote.turnstileWidgetCount !== 1) addFailure(failures, `quote: expected one Turnstile widget, found ${quote.turnstileWidgetCount}`);
  if (!quote.turnstileSiteKey) addFailure(failures, 'quote: Turnstile site key is missing');
  if (!['preview-test', 'production'].includes(quote.turnstileMode)) addFailure(failures, 'quote: Turnstile mode is missing or malformed');
  const usesTurnstilePreviewTestKey = turnstilePreviewTestSiteKeys.has(quote.turnstileSiteKey);
  if (usesTurnstilePreviewTestKey !== (quote.turnstileMode === 'preview-test')) {
    addFailure(failures, 'quote: Turnstile mode does not match the configured site key');
  }
  if (quote.turnstileExpectedHostname !== 'www.zxrubbertech.com') {
    addFailure(failures, 'quote: Turnstile expected hostname must be www.zxrubbertech.com');
  }
  if (profile === 'release' && (quote.turnstileMode !== 'production' || usesTurnstilePreviewTestKey)) {
    addFailure(failures, 'quote: release profile cannot use the Turnstile preview test key');
  }
  if (profile === 'release' && quote.turnstileMode === 'production' && !/^0x4[A-Za-z0-9_-]{20,}$/.test(quote.turnstileSiteKey)) {
    addFailure(failures, 'quote: release profile requires a production-format Turnstile site key');
  }
  if (!quote.hasTurnstileLoader) addFailure(failures, 'quote: Turnstile loader is missing');
  if (!quote.hasAccessibleVerificationStatus) addFailure(failures, 'quote: Turnstile accessible status is missing');
  if (!quote.hasTurnstileCallbacks) addFailure(failures, 'quote: Turnstile status callbacks are missing');
  if (!quote.hasLegacyHybridCompatibilityMarker) addFailure(failures, 'quote: immutable hybrid checker compatibility marker is missing');
  if (quote.hasUnconfiguredVerification) addFailure(failures, 'quote: unconfigured or reCAPTCHA verification remains');
  if (quote.hasSubmitDisablingObserver) addFailure(failures, 'quote: submit disabling observer remains');
  if (!quote.hasAccessibleSuccessState) addFailure(failures, 'quote: deterministic accessible success state is missing');
  if (!quote.hasAccessibleErrorState) addFailure(failures, 'quote: deterministic accessible error state is missing');
  if (!quote.hasSafeFormspreeFailureDiagnostic) {
    addFailure(failures, 'quote: non-success Formspree responses lack a redacted HTTP diagnostic');
  }
  if (!quote.distinguishesFormspreeNetworkFailure) {
    addFailure(failures, 'quote: Formspree network failures are not distinguished from HTTP rejections');
  }
  if (!quote.preservesValuesOnError) addFailure(failures, 'quote: error path does not guarantee entered values are preserved');
  if (!quote.hasEmailFallback) addFailure(failures, 'quote: direct email fallback is missing');
  if (!quote.hasWhatsAppFallback) addFailure(failures, 'quote: WhatsApp fallback is missing');
  if (!quote.hasPrivacyLink) addFailure(failures, 'quote: privacy link is missing');
  if (!quote.hasPrivacyDialog) addFailure(failures, 'quote: accessible privacy dialog is missing');
  if (!quote.privacyExplainsFormData) addFailure(failures, 'quote: privacy notice does not describe collected form data');
  if (!quote.privacyExplainsProvider) addFailure(failures, 'quote: privacy notice does not identify Cloudflare Turnstile');
  if (!quote.privacyExplainsPurpose) addFailure(failures, 'quote: privacy notice does not describe the inquiry purpose');
  if (!quote.privacyExplainsRetention) addFailure(failures, 'quote: privacy notice does not describe retention');
  if (!quote.privacyHasContactRoute) addFailure(failures, 'quote: privacy notice does not provide a data-rights contact route');
  if (!quote.privacyRejectsMarketingConsent) addFailure(failures, 'quote: privacy notice does not reject automatic marketing subscription');
  if (quote.marketingConsentFields !== 0) addFailure(failures, 'quote: marketing consent fields were added');
}

function visibleCopyText(html) {
  return decodeEntities(html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim());
}

function assertCopy(documents, failures) {
  const seenH1 = new Map();
  const approvedIsoSentence = 'Our rubber compound production is supported by an ISO 9001:2015-certified quality management system.';

  for (const document of documents) {
    const pageCopy = approvedGate6Copy[document.stem];
    if (!pageCopy) {
      addFailure(failures, `${document.stem}: missing Gate 6 approved-copy configuration`);
      continue;
    }

    const h1Matches = [...document.html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)];
    if (h1Matches.length !== 1) {
      addFailure(failures, `${document.stem}: Gate 6 requires exactly one H1`);
    } else {
      const h1Text = visibleCopyText(h1Matches[0][1]).toLowerCase();
      if (seenH1.has(h1Text)) {
        addFailure(failures, `${document.stem}: H1 duplicates ${seenH1.get(h1Text)}`);
      } else {
        seenH1.set(h1Text, document.stem);
      }
    }

    for (const [field, copy] of Object.entries(pageCopy)) {
      const approvedCount = exactStringCount(document.html, copy.approved);
      if (approvedCount !== 1) {
        addFailure(
          failures,
          `${document.stem}: Gate 6 ${field} must match the sentence-level approval exactly`,
        );
      }
    }

    const visibleText = visibleCopyText(document.html);
    if (/Food\s*&\s*Beverage|\bLilei\b/i.test(visibleText)) {
      addFailure(failures, `${document.stem}: prohibited visible claim or legacy name remains`);
    }
    const unapprovedIsoText = visibleText.replaceAll(approvedIsoSentence, '');
    if (/\bISO(?:\s|\d|:|-)/i.test(unapprovedIsoText)) {
      addFailure(failures, `${document.stem}: unapproved or unqualified ISO scope remains`);
    }
    if (document.bodySha256 !== expectedGate0BodySha256[document.stem]) {
      addFailure(failures, `${document.stem}: Gate 6 changed body structure outside the approved sentences`);
    }
  }
}

function validateOptions({ gate, profile, root, publicPages }) {
  if (typeof gate !== 'string' || !gates.has(gate)) {
    throw new Error(`Unknown gate: ${typeof gate === 'string' && gate ? gate : '(missing)'}`);
  }
  if (typeof profile !== 'string' || !profiles.has(profile)) {
    throw new Error(`Unknown profile: ${typeof profile === 'string' && profile ? profile : '(missing)'}`);
  }
  if (!Array.isArray(publicPages) || publicPages.length === 0) {
    throw new Error('Public page list must be a non-empty array.');
  }
  const seen = new Set();
  for (const [index, stem] of publicPages.entries()) {
    if (typeof stem !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(stem)) {
      throw new Error(`Public page entry ${index} is malformed.`);
    }
    if (!PUBLIC_V5_PAGES.includes(stem)) throw new Error(`Unknown public page: ${stem}`);
    if (seen.has(stem)) throw new Error(`Duplicate public page: ${stem}`);
    seen.add(stem);
  }
  if (typeof root !== 'string' || !root.trim()) throw new Error('Root must be a non-empty path.');
}

function loadDocuments(root, publicPages, profile) {
  const resolvedRoot = resolve(root);
  if (!existsSync(resolvedRoot)) throw new Error(`SEO root does not exist: ${resolvedRoot}`);
  const rootInfo = lstatSync(resolvedRoot);
  if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory()) throw new Error(`SEO root must be a real directory: ${resolvedRoot}`);
  const physicalRoot = realpathSync(resolvedRoot);
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const documents = [];
  for (const stem of publicPages) {
    const routePath = V5_ROUTE_MAP[stem];
    const relativePath = profile === 'preview'
      ? `${stem}-v5.html`
      : (routePath === '/' ? 'index.html' : `${routePath.slice(1)}index.html`);
    const file = resolve(resolvedRoot, relativePath);
    if (!isInside(resolvedRoot, file)) throw new Error(`${stem}: page path escapes the SEO root`);
    if (!existsSync(file)) throw new Error(`${stem}: missing page ${file}`);
    const info = lstatSync(file);
    if (info.isSymbolicLink() || !info.isFile()) throw new Error(`${stem}: page must be a real file ${file}`);
    const physicalFile = realpathSync(file);
    if (!isInside(physicalRoot, physicalFile)) throw new Error(`${stem}: page resolves outside the SEO root`);
    const bytes = readFileSync(file);
    let html;
    try {
      html = decoder.decode(bytes);
    } catch (error) {
      throw new Error(`${stem}: page is not valid UTF-8: ${error.message}`);
    }
    if (!html.trim()) throw new Error(`${stem}: page is empty`);
    documents.push(analyzePage(stem, file, html, bytes.length, profile));
  }
  return documents;
}

function validateCanonicalUniqueness(documents) {
  const seen = new Map();
  for (const document of documents) {
    if (document.canonicals.length > 1) throw new Error(`${document.stem}: duplicate canonical tags`);
    for (const canonical of document.canonicals) {
      const href = canonical.attributes.get('href') ?? '';
      if (!href) continue;
      if (seen.has(href)) throw new Error(`Duplicate canonical path on ${seen.get(href)} and ${document.stem}: ${href}`);
      seen.set(href, document.stem);
    }
  }
}

function decodeSeoValue(value) {
  return value.replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<').replaceAll('&gt;', '>');
}

function simpleAttribute(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>]+))`, 'i'));
  return match ? decodeSeoValue(match[1] ?? match[2] ?? match[3] ?? '') : null;
}

function simpleMetaValues(html, selector, value) {
  return (html.match(/<meta\b[^>]*>/gi) ?? [])
    .filter((tag) => (simpleAttribute(tag, selector) ?? '').toLowerCase() === value.toLowerCase())
    .map((tag) => simpleAttribute(tag, 'content') ?? '');
}

function stripLanguageAdditions(html) {
  return html
    .replace(/\n      <div class="lang" data-name="lang">[\s\S]*?\n      <\/div>(?=\n      <a class="btn btn-solid" href="quote-v5\.html">)/g, '')
    .replace(/\n  <div class="mlang" data-name="mlang">[\s\S]*?<\/div>(?=\n<\/div>\n<!-- SHELL:NAV AUTO END -->)/g, '')
    .replace(/<!-- V5:LANGUAGE (?:DESKTOP|MOBILE|FOOTER) START -->[\s\S]*?<!-- V5:LANGUAGE (?:DESKTOP|MOBILE|FOOTER) END -->/g, '')
    .replace(/<!-- V5:LANGUAGE SCRIPT START -->[\s\S]*?<!-- V5:LANGUAGE SCRIPT END -->/g, '')
    .replace(/\/\* V5:LANGUAGE CONTROLS START \*\/[\s\S]*?\/\* V5:LANGUAGE CONTROLS END \*\//g, '');
}

function bodyStructureSignature(html, label) {
  const body = html.match(/<body\b[^>]*>[\s\S]*?<\/body>/i)?.[0];
  if (!body) throw new Error(`${label}: body is missing`);
  const normalized = stripLanguageAdditions(body)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '<script></script>')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '<style></style>');
  const stableAttributes = ['class', 'id', 'data-name', 'data-asset', 'src', 'poster', 'width', 'height', 'type', 'name', 'action', 'method', 'data-sitekey'];
  const tokens = [];
  for (const match of normalized.matchAll(/<\/?([a-z][a-z0-9:-]*)\b[^>]*>/gi)) {
    const tag = match[0];
    const name = match[1].toLowerCase();
    if (tag.startsWith('</')) {
      tokens.push(`/${name}`);
      continue;
    }
    const attrs = stableAttributes.map((attributeName) => {
      let value = simpleAttribute(tag, attributeName);
      if (value === null) return null;
      if (attributeName === 'src' || attributeName === 'poster') value = value.replace(/^\/(?:media|LOGO)\//, (prefix) => prefix.slice(1));
      if (attributeName === 'src' || attributeName === 'poster') value = value.replace(/^\.\.\/LOGO\//, 'LOGO/');
      if (attributeName === 'class') value = value.replaceAll('industries-spacer', 'industries-v5-spacer');
      return `${attributeName}=${value}`;
    }).filter(Boolean);
    tokens.push(`${name}${attrs.length ? `[${attrs.join('|')}]` : ''}`);
  }
  return createHash('sha256').update(tokens.join('\n')).digest('hex');
}

function collectSimpleSchemaTypes(value, output = []) {
  if (Array.isArray(value)) {
    for (const child of value) collectSimpleSchemaTypes(child, output);
  } else if (value && typeof value === 'object') {
    if (typeof value['@type'] === 'string') output.push(value['@type']);
    for (const child of Object.values(value)) collectSimpleSchemaTypes(child, output);
  }
  return output;
}

function localizedReleaseSeoChecks(root, gate) {
  const failures = [];
  const localeIds = Object.keys(V5_LOCALES);
  const documents = [];
  const englishStructure = new Map();
  const previewStructure = new Map();
  for (const stem of V5_PAGE_STEMS) {
    const previewFile = join(defaultRoot, `${stem}-v5.html`);
    previewStructure.set(stem, bodyStructureSignature(readFileSync(previewFile, 'utf8'), `preview/${stem}`));
  }
  const canonicalOwners = new Map();
  let hreflangLinks = 0;
  let mediaReferences = 0;
  let schemaNodes = 0;

  for (const locale of localeIds) {
    const definition = V5_LOCALES[locale];
    const catalog = loadV5Catalog(locale);
    for (const stem of V5_PAGE_STEMS) {
      const label = `${locale}/${stem}`;
      const route = getLocalizedRoute(locale, stem);
      const relativeFile = route === '/' ? 'index.html' : `${route.slice(1)}index.html`;
      const file = resolve(root, relativeFile);
      if (!isInside(resolve(root), file) || !existsSync(file) || !lstatSync(file).isFile()) {
        failures.push(`${label}: missing release page ${relativeFile}`);
        continue;
      }
      const html = readFileSync(file, 'utf8');
      const expectedSeo = catalog.seo[stem];
      const expectedCanonical = getLocalizedUrl(locale, stem);
      const htmlTag = html.match(/<html\b[^>]*>/i)?.[0] ?? '';
      if (simpleAttribute(htmlTag, 'lang') !== definition.htmlLang) failures.push(`${label}: html lang must be ${definition.htmlLang}`);
      const title = decodeSeoValue(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '');
      if (title !== expectedSeo.title) failures.push(`${label}: localized title mismatch`);
      if (JSON.stringify(simpleMetaValues(html, 'name', 'description')) !== JSON.stringify([expectedSeo.description])) failures.push(`${label}: localized description mismatch`);
      const canonicalTags = (html.match(/<link\b[^>]*>/gi) ?? []).filter((tag) =>
        (simpleAttribute(tag, 'rel') ?? '').toLowerCase().split(/\s+/).includes('canonical'));
      const canonical = canonicalTags.length === 1 ? simpleAttribute(canonicalTags[0], 'href') : null;
      if (canonical !== expectedCanonical) failures.push(`${label}: canonical must equal ${expectedCanonical}; got ${String(canonical)}`);
      if (canonical && canonicalOwners.has(canonical)) failures.push(`${label}: duplicate canonical also used by ${canonicalOwners.get(canonical)}`);
      if (canonical) canonicalOwners.set(canonical, label);
      const hreflang = (html.match(/<link\b[^>]*>/gi) ?? []).filter((tag) => simpleAttribute(tag, 'hreflang') !== null)
        .map((tag) => ({ hreflang: simpleAttribute(tag, 'hreflang'), url: simpleAttribute(tag, 'href') }));
      const expectedHreflang = getHreflangCluster(stem).map(({ hreflang: code, url }) => ({ hreflang: code, url }));
      hreflangLinks += hreflang.length;
      if (JSON.stringify(hreflang) !== JSON.stringify(expectedHreflang)) failures.push(`${label}: reciprocal hreflang cluster mismatch`);
      const expectedAlternates = localeIds.filter((candidate) => candidate !== locale).map((candidate) => V5_LOCALES[candidate].ogLocale);
      if (JSON.stringify(simpleMetaValues(html, 'property', 'og:locale')) !== JSON.stringify([definition.ogLocale])) failures.push(`${label}: og:locale mismatch`);
      if (JSON.stringify(simpleMetaValues(html, 'property', 'og:locale:alternate')) !== JSON.stringify(expectedAlternates)) failures.push(`${label}: og:locale alternates mismatch`);
      for (const [selector, key, expected] of [
        ['property', 'og:title', expectedSeo.title], ['property', 'og:description', expectedSeo.description],
        ['property', 'og:url', expectedCanonical], ['name', 'twitter:title', expectedSeo.title],
        ['name', 'twitter:description', expectedSeo.description],
      ]) {
        if (JSON.stringify(simpleMetaValues(html, selector, key)) !== JSON.stringify([expected])) failures.push(`${label}: ${key} mismatch`);
      }
      if (JSON.stringify(simpleMetaValues(html, 'name', 'robots')) !== JSON.stringify(['index,follow'])) failures.push(`${label}: robots meta must be index,follow`);
      if ((html.match(/<h1\b[^>]*>/gi) ?? []).length !== 1) failures.push(`${label}: expected exactly one H1`);
      if (/design-demos|-v5|Demo A/i.test(html)) failures.push(`${label}: release page contains a demo identifier`);
      const bodyWithoutControls = stripLanguageAdditions(html.match(/<body\b[^>]*>[\s\S]*?<\/body>/i)?.[0] ?? '');
      const localizedRoutes = V5_PAGE_STEMS.map((candidateStem) => getLocalizedRoute(locale, candidateStem));
      for (const anchor of bodyWithoutControls.match(/<a\b[^>]*>/gi) ?? []) {
        const href = simpleAttribute(anchor, 'href');
        if (!href?.startsWith('/') || href.startsWith('/media/') || href.startsWith('/LOGO/')) continue;
        let pathname;
        try {
          pathname = new URL(href, SEO_BASE_URL).pathname;
        } catch {
          failures.push(`${label}: malformed internal href ${href}`);
          continue;
        }
        if (!localizedRoutes.includes(pathname)) failures.push(`${label}: internal href leaves active locale routes: ${href}`);
      }
      const jsonBlocks = [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
      if (jsonBlocks.length !== 1) {
        failures.push(`${label}: expected exactly one JSON-LD block`);
      } else {
        try {
          const actual = JSON.parse(jsonBlocks[0][1]);
          const expected = getLocalizedV5StructuredData(stem, catalog, {
            canonical: expectedCanonical,
            homeUrl: getLocalizedUrl(locale, 'demo-a'),
          });
          if (stableJson(actual) !== stableJson(expected)) failures.push(`${label}: localized JSON-LD differs from the exact schema`);
          const types = collectSimpleSchemaTypes(actual);
          schemaNodes += types.length;
          for (const type of types) if (prohibitedSchemaTypes.has(type)) failures.push(`${label}: prohibited schema type ${type}`);
        } catch (error) {
          failures.push(`${label}: malformed JSON-LD: ${error.message}`);
        }
      }
      const structure = bodyStructureSignature(html, label);
      if (locale === 'en') {
        englishStructure.set(stem, structure);
        if (structure !== previewStructure.get(stem)) failures.push(`${label}: release body structure/media differs from the accepted preview`);
      } else if (structure !== englishStructure.get(stem)) {
        failures.push(`${label}: localized body structure/media differs from English ${stem}`);
      }
      for (const tag of html.match(/<(?:img|video|source)\b[^>]*>/gi) ?? []) {
        const source = simpleAttribute(tag, 'src') ?? simpleAttribute(tag, 'poster');
        if (!source || !/^\/(?:media|LOGO)\//.test(source)) continue;
        mediaReferences += 1;
        const relativeAsset = source.slice(1);
        const candidate = resolve(root, relativeAsset);
        const approved = resolve(repo, relativeAsset === 'LOGO/ZXLOGO.png' ? relativeAsset : `design-demos/${relativeAsset}`);
        if (!isInside(resolve(root), candidate) || !existsSync(candidate) || !existsSync(approved)
            || createHash('sha256').update(readFileSync(candidate)).digest('hex') !== createHash('sha256').update(readFileSync(approved)).digest('hex')) {
          failures.push(`${label}: media bytes differ from approved source: ${relativeAsset}`);
        }
      }
      documents.push({ locale, stem, route, file: relativeFile });
    }
  }
  const expectedUrls = localeIds.flatMap((locale) => V5_PAGE_STEMS.map((stem) => getLocalizedUrl(locale, stem)));
  const sitemap = readReleaseArtifact(root, 'sitemap.xml', 'V5 multilingual sitemap');
  const sitemapUrls = parseSitemapUrls(sitemap, 'V5 multilingual sitemap');
  if (JSON.stringify(sitemapUrls) !== JSON.stringify(expectedUrls)) failures.push('schema: sitemap must equal the deterministic 35 canonical URLs');
  const robots = readReleaseArtifact(root, 'robots.txt', 'V5 robots candidate');
  if (robots !== `User-agent: *\nAllow: /\n\nSitemap: ${SEO_BASE_URL}/sitemap.xml\n`) failures.push('schema: release robots candidate differs from approved content');
  return {
    status: failures.length ? 'FAIL' : 'PASS',
    gate,
    profile: 'release',
    failures,
    metrics: {
      locales: localeIds.length,
      pageRoles: V5_PAGE_STEMS.length,
      publicPages: documents.length,
      hreflangLinks,
      sitemapUrls: sitemapUrls.length,
      mediaReferences,
      schemaNodes,
      structuralBaseline: 'accepted-preview-plus-exact-multilingual-tag-and-media-invariants',
    },
  };
}

export function runSeoChecks({
  gate,
  profile,
  root = defaultRoot,
  publicPages = PUBLIC_V5_PAGES,
} = {}) {
  try {
    validateOptions({ gate, profile, root, publicPages });
    if (profile === 'release' && publicPages === PUBLIC_V5_PAGES) {
      return localizedReleaseSeoChecks(root, gate);
    }
    const documents = loadDocuments(root, publicPages, profile);
    validateCanonicalUniqueness(documents);
    const metrics = buildMetrics(documents, profile);
    const failures = [];

    if (gate === 'baseline') assertBaseline(metrics, failures);
    if (gate === 'metadata' || gate === 'all') assertMetadata(documents, profile, failures);
    if (gate === 'links' || gate === 'all') assertLinks(documents, metrics, profile, failures);
    if (gate === 'performance' || gate === 'all') assertPerformance(documents, metrics, profile, root, failures);
    if (gate === 'schema' || gate === 'all') assertSchema(documents, profile, root, failures);
    if (gate === 'quote' || gate === 'all') assertQuote(metrics, profile, failures);
    if (gate === 'copy' || gate === 'all') assertCopy(documents, failures);

    return {
      status: failures.length ? 'FAIL' : 'PASS',
      gate,
      profile,
      failures,
      metrics,
    };
  } catch (error) {
    return {
      status: 'FAIL',
      gate: typeof gate === 'string' ? gate : null,
      profile: typeof profile === 'string' ? profile : null,
      failures: [error instanceof Error ? error.message : String(error)],
      metrics: {},
    };
  }
}

function parseCliArgs(argv) {
  const values = new Map();
  const valueOptions = new Set(['gate', 'profile', 'root', 'pages']);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const equals = argument.match(/^--([a-z-]+)=(.*)$/);
    let name;
    let value;
    if (equals) {
      [, name, value] = equals;
    } else {
      const plain = argument.match(/^--([a-z-]+)$/);
      if (!plain) throw new Error(`Unexpected argument: ${argument}`);
      name = plain[1];
      if (!valueOptions.has(name)) throw new Error(`Unknown option: --${name}`);
      if (index + 1 >= argv.length || argv[index + 1].startsWith('--')) {
        throw new Error(`Missing value for --${name}`);
      }
      value = argv[index + 1];
      index += 1;
    }
    if (!valueOptions.has(name)) throw new Error(`Unknown option: --${name}`);
    if (values.has(name)) throw new Error(`Duplicate option: --${name}`);
    values.set(name, value);
  }
  const publicPages = values.has('pages')
    ? (values.get('pages') === '' ? [] : values.get('pages').split(',').map((stem) => stem.trim()))
    : PUBLIC_V5_PAGES;
  return {
    gate: values.get('gate'),
    profile: values.get('profile'),
    root: values.has('root') ? values.get('root') : defaultRoot,
    publicPages,
  };
}

function printResult(result) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

function main() {
  let options;
  try {
    options = parseCliArgs(process.argv.slice(2));
  } catch (error) {
    printResult({
      status: 'FAIL',
      gate: null,
      profile: null,
      failures: [error instanceof Error ? error.message : String(error)],
      metrics: {},
    });
    process.exitCode = 1;
    return;
  }
  const result = runSeoChecks(options);
  printResult(result);
  if (result.status !== 'PASS') process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
