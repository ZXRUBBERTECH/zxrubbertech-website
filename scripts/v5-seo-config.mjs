import { readFileSync } from 'node:fs';

export const SEO_BASE_URL = 'https://www.zxrubbertech.com';
export const SEO_SITE_NAME = 'ZHIXIN RUBBER MATERIAL';
export const SEO_SOCIAL_LOCALE = 'en_US';
export const SEO_SOCIAL_IMAGE = `${SEO_BASE_URL}/og-image.jpg`;

const routeMapFile = new URL('./v5-route-map.json', import.meta.url);
let parsedRouteMap;
try {
  parsedRouteMap = JSON.parse(readFileSync(routeMapFile, 'utf8'));
} catch (error) {
  throw new Error(`V5 route map is missing or malformed: ${error.message}`);
}
if (!parsedRouteMap || typeof parsedRouteMap !== 'object' || Array.isArray(parsedRouteMap)) {
  throw new Error('V5 route map must be an object');
}
const expectedRouteStems = ['demo-a', 'products', 'compounds', 'industries', 'capabilities', 'faq', 'quote'];
if (JSON.stringify(Object.keys(parsedRouteMap)) !== JSON.stringify(expectedRouteStems)) {
  throw new Error(`V5 route map must contain exactly: ${expectedRouteStems.join(', ')}`);
}
const routePaths = new Set();
for (const [stem, path] of Object.entries(parsedRouteMap)) {
  if (typeof path !== 'string' || !/^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*\/)*$/.test(path)) {
    throw new Error(`V5 route is malformed for ${stem}: ${String(path)}`);
  }
  if (routePaths.has(path)) throw new Error(`Duplicate V5 release route: ${path}`);
  routePaths.add(path);
}
export const V5_ROUTE_MAP = Object.freeze({ ...parsedRouteMap });

export const SEO_ORGANIZATION = Object.freeze({
  legalName: 'ANHUI ZHIXIN MATERIAL TECHNOLOGY CO., LTD',
  name: SEO_SITE_NAME,
  url: `${SEO_BASE_URL}/`,
  email: 'martin@zxrubbertech.com',
  telephone: '+86 152 5622 5135',
  address: Object.freeze({
    streetAddress: 'No. 33, Waihuan East Road, Helixi Street',
    addressLocality: 'Ningguo City',
    addressRegion: 'Anhui Province',
    addressCountry: 'CN',
  }),
});

export const SEO_BREADCRUMB_NAMES = Object.freeze({
  products: 'Products',
  compounds: 'Rubber Compounds',
  industries: 'Industries',
  capabilities: 'Capabilities',
  faq: 'FAQ',
  quote: 'Get a Quote',
});

const pageDefinitions = {
  'demo-a': {
    path: V5_ROUTE_MAP['demo-a'],
    title: 'Custom Rubber Manufacturer & Compound Supplier | ZHIXIN',
    description: 'ZHIXIN develops custom rubber compounds, molded rubber parts and rubber-metal bonded components in Anhui, China, with in-house mixing and production.',
  },
  products: {
    path: V5_ROUTE_MAP.products,
    title: 'Custom Molded Rubber Products & Rubber-Metal Parts | ZHIXIN',
    description: 'Explore molded rubber, sealing, vibration-control and rubber-metal bonded components for automotive, appliance and industrial applications.',
  },
  compounds: {
    path: V5_ROUTE_MAP.compounds,
    title: 'Custom Rubber Compounds: NBR, EPDM, SBR & More | ZHIXIN',
    description: 'Explore custom NBR, EPDM, SBR, silicone, FKM and other rubber compounds selected for temperature, media, hardness and service requirements.',
  },
  industries: {
    path: V5_ROUTE_MAP.industries,
    title: 'Industrial Rubber Components by Application | ZHIXIN',
    description: 'Rubber compounds and custom components for automotive, home appliance, industrial equipment, fluid handling, energy and project-specific applications.',
  },
  capabilities: {
    path: V5_ROUTE_MAP.capabilities,
    title: 'Rubber Compounding, Molding & Bonding Capabilities | ZHIXIN',
    description: 'See our in-house rubber mixing, compression molding, injection molding, extrusion and rubber-metal bonding capabilities in Anhui, China.',
  },
  faq: {
    path: V5_ROUTE_MAP.faq,
    title: 'Rubber Manufacturing FAQ: Materials, MOQ & Tooling | ZHIXIN',
    description: 'Answers about rubber compounding, molding, material selection, MOQ, tooling, quality records, traceability, custom development and flexible export terms.',
  },
  quote: {
    path: V5_ROUTE_MAP.quote,
    title: 'Request a Custom Rubber Quote | ZHIXIN',
    description: 'Send your drawing, sample or performance requirements for a custom rubber compound or component quotation. Our team replies within 24 hours.',
  },
};

export const seoPages = Object.freeze(Object.fromEntries(
  Object.entries(pageDefinitions).map(([stem, page]) => [stem, Object.freeze(page)]),
));

export function getSeoCanonicalUrl(stem) {
  const page = seoPages[stem];
  if (!page) throw new Error(`Unknown V5 SEO page: ${stem}`);
  return new URL(page.path, SEO_BASE_URL).href;
}

export function getV5StructuredData(stem) {
  if (!seoPages[stem]) throw new Error(`Unknown V5 SEO page: ${stem}`);
  if (stem === 'demo-a') {
    return {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'Organization',
          '@id': `${SEO_BASE_URL}/#organization`,
          legalName: SEO_ORGANIZATION.legalName,
          name: SEO_ORGANIZATION.name,
          url: SEO_ORGANIZATION.url,
          email: SEO_ORGANIZATION.email,
          telephone: SEO_ORGANIZATION.telephone,
          address: {
            '@type': 'PostalAddress',
            ...SEO_ORGANIZATION.address,
          },
        },
        {
          '@type': 'WebSite',
          '@id': `${SEO_BASE_URL}/#website`,
          url: SEO_ORGANIZATION.url,
          name: SEO_ORGANIZATION.name,
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
        name: SEO_BREADCRUMB_NAMES[stem],
        item: getSeoCanonicalUrl(stem),
      },
    ],
  };
}

export function getLocalizedSeoPage(stem, catalog) {
  if (!seoPages[stem]) throw new Error(`Unknown V5 SEO page: ${stem}`);
  const page = catalog?.seo?.[stem];
  if (!page || typeof page !== 'object' || Array.isArray(page)) {
    throw new Error(`${stem}: localized SEO catalog entry is missing`);
  }
  const exactKeys = ['title', 'description', 'breadcrumb'];
  if (JSON.stringify(Object.keys(page)) !== JSON.stringify(exactKeys)
      || exactKeys.some((key) => typeof page[key] !== 'string' || !page[key].trim())) {
    throw new Error(`${stem}: localized SEO entry must contain nonempty title, description, breadcrumb`);
  }
  return Object.freeze({ ...page });
}

export function getLocalizedV5StructuredData(stem, catalog, { canonical, homeUrl } = {}) {
  const page = getLocalizedSeoPage(stem, catalog);
  if (typeof canonical !== 'string' || !canonical.startsWith(`${SEO_BASE_URL}/`)) {
    throw new Error(`${stem}: localized canonical is missing or outside ${SEO_BASE_URL}`);
  }
  if (typeof homeUrl !== 'string' || !homeUrl.startsWith(`${SEO_BASE_URL}/`)) {
    throw new Error(`${stem}: localized Home URL is missing or outside ${SEO_BASE_URL}`);
  }
  if (stem === 'demo-a') return getV5StructuredData(stem);
  const home = getLocalizedSeoPage('demo-a', catalog);
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: home.breadcrumb,
        item: homeUrl,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: page.breadcrumb,
        item: canonical,
      },
    ],
  };
}
