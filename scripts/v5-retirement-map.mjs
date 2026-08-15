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

const legacyLocales = Object.freeze([
  Object.freeze({ locale: 'en', htmlLang: 'en', sourcePrefix: '' }),
  Object.freeze({ locale: 'de', htmlLang: 'de', sourcePrefix: 'de' }),
  Object.freeze({ locale: 'zh-CN', htmlLang: 'zh-CN', sourcePrefix: 'zh' }),
  Object.freeze({ locale: 'ru', htmlLang: 'ru', sourcePrefix: 'ru' }),
  Object.freeze({ locale: 'tr', htmlLang: 'tr', sourcePrefix: 'tr' }),
]);
const automotiveSlugs = Object.freeze([
  'suspension-bushing',
  'shock-absorber-dust-cover',
  'ball-joint-dust-cover',
  'wire-harness-sheath',
]);

const productVariants = (slug, fragment) => legacyLocales.map(({ locale, htmlLang, sourcePrefix }) => Object.freeze({
  locale,
  htmlLang,
  path: `/${sourcePrefix ? `${sourcePrefix}/` : ''}products/${slug}/`,
  target: `${getLocalizedUrl(locale, 'products')}${fragment}`,
}));

export const LEGACY_REDIRECTS = Object.freeze([
  ...automotiveSlugs.flatMap((slug) => productVariants(slug, '#c-automotive')),
  ...productVariants('rubber-wheel', '#c-industrial'),
]);
