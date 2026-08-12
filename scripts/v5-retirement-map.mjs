export const V5_URLS = Object.freeze([
  'https://www.zxrubbertech.com/',
  'https://www.zxrubbertech.com/products/',
  'https://www.zxrubbertech.com/rubber-compounds/',
  'https://www.zxrubbertech.com/industries/',
  'https://www.zxrubbertech.com/capabilities/',
  'https://www.zxrubbertech.com/faq/',
  'https://www.zxrubbertech.com/quote/',
]);

export const CLOUDFLARE_HOSTS = Object.freeze([
  'zxrubbertech.com',
  'www.zxrubbertech.com',
]);

const languages = Object.freeze(['de', 'zh', 'ru', 'tr']);
const automotiveSlugs = Object.freeze([
  'suspension-bushing',
  'shock-absorber-dust-cover',
  'ball-joint-dust-cover',
  'wire-harness-sheath',
]);

const languageHomes = languages.map((language) => ({
  path: `/${language}/`,
  target: 'https://www.zxrubbertech.com/',
}));

const languageProductIndexes = languages.map((language) => ({
  path: `/${language}/products/`,
  target: 'https://www.zxrubbertech.com/products/',
}));

const productVariants = (slug, target) => [
  { path: `/products/${slug}/`, target },
  ...languages.map((language) => ({ path: `/${language}/products/${slug}/`, target })),
];

export const LEGACY_REDIRECTS = Object.freeze([
  ...languageHomes,
  ...languageProductIndexes,
  ...automotiveSlugs.flatMap((slug) => productVariants(
    slug,
    'https://www.zxrubbertech.com/products/#c-automotive',
  )),
  ...productVariants('rubber-wheel', 'https://www.zxrubbertech.com/products/#c-industrial'),
].map(Object.freeze));
