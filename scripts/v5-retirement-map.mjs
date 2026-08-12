import {
  getLocalizedUrl,
  V5_LOCALES,
  V5_PAGE_STEMS,
} from './v5-i18n-config.mjs';

export const V5_URLS = Object.freeze(Object.keys(V5_LOCALES).flatMap((locale) => (
  V5_PAGE_STEMS.map((stem) => getLocalizedUrl(locale, stem))
)));

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

const productVariants = (slug, target) => [
  { path: `/products/${slug}/`, target },
  ...languages.map((language) => ({ path: `/${language}/products/${slug}/`, target })),
];

export const LEGACY_REDIRECTS = Object.freeze([
  ...automotiveSlugs.flatMap((slug) => productVariants(
    slug,
    'https://www.zxrubbertech.com/products/#c-automotive',
  )),
  ...productVariants('rubber-wheel', 'https://www.zxrubbertech.com/products/#c-industrial'),
].map(Object.freeze));
