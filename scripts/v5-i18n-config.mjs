import { SEO_BASE_URL, V5_ROUTE_MAP } from './v5-seo-config.mjs';

export const V5_PAGE_STEMS = Object.freeze([
  'demo-a',
  'products',
  'compounds',
  'industries',
  'capabilities',
  'faq',
  'quote',
]);

export const V5_LOCALES = Object.freeze({
  en: Object.freeze({
    prefix: '',
    htmlLang: 'en',
    hreflang: 'en',
    ogLocale: 'en_US',
    direction: 'ltr',
    label: 'English',
    shortLabel: 'EN',
    turnstileLanguage: 'en',
  }),
  de: Object.freeze({
    prefix: 'de',
    htmlLang: 'de',
    hreflang: 'de',
    ogLocale: 'de_DE',
    direction: 'ltr',
    label: 'Deutsch',
    shortLabel: 'DE',
    turnstileLanguage: 'de',
  }),
  'zh-CN': Object.freeze({
    prefix: 'zh',
    htmlLang: 'zh-CN',
    hreflang: 'zh-CN',
    ogLocale: 'zh_CN',
    direction: 'ltr',
    label: '简体中文',
    shortLabel: '中文',
    turnstileLanguage: 'zh-cn',
  }),
  ru: Object.freeze({
    prefix: 'ru',
    htmlLang: 'ru',
    hreflang: 'ru',
    ogLocale: 'ru_RU',
    direction: 'ltr',
    label: 'Русский',
    shortLabel: 'RU',
    turnstileLanguage: 'ru',
  }),
  tr: Object.freeze({
    prefix: 'tr',
    htmlLang: 'tr',
    hreflang: 'tr',
    ogLocale: 'tr_TR',
    direction: 'ltr',
    label: 'Türkçe',
    shortLabel: 'TR',
    turnstileLanguage: 'tr',
  }),
  ja: Object.freeze({
    prefix: 'ja',
    htmlLang: 'ja',
    hreflang: 'ja',
    ogLocale: 'ja_JP',
    direction: 'ltr',
    label: '日本語',
    shortLabel: 'JA',
    turnstileLanguage: 'ja',
  }),
  ko: Object.freeze({
    prefix: 'ko',
    htmlLang: 'ko',
    hreflang: 'ko',
    ogLocale: 'ko_KR',
    direction: 'ltr',
    label: '한국어',
    shortLabel: 'KO',
    turnstileLanguage: 'ko',
  }),
  fa: Object.freeze({
    prefix: 'fa',
    htmlLang: 'fa',
    hreflang: 'fa',
    ogLocale: 'fa_IR',
    direction: 'rtl',
    label: 'فارسی',
    shortLabel: 'FA',
    turnstileLanguage: 'fa',
  }),
  ar: Object.freeze({
    prefix: 'ar',
    htmlLang: 'ar',
    hreflang: 'ar',
    ogLocale: 'ar_SA',
    direction: 'rtl',
    label: 'العربية',
    shortLabel: 'AR',
    turnstileLanguage: 'ar',
  }),
});

function requireLocale(locale) {
  const definition = V5_LOCALES[locale];
  if (!definition) throw new Error(`Unsupported V5 locale: ${String(locale)}`);
  return definition;
}

function requireStem(stem) {
  if (!V5_PAGE_STEMS.includes(stem)) throw new Error(`Unknown V5 page stem: ${String(stem)}`);
  const route = V5_ROUTE_MAP[stem];
  if (typeof route !== 'string') throw new Error(`Missing English V5 route for page stem: ${stem}`);
  return route;
}

export function getLocalizedRoute(locale, stem) {
  const { prefix } = requireLocale(locale);
  const englishRoute = requireStem(stem);
  if (prefix === '') return englishRoute;
  return `/${prefix}${englishRoute}`;
}

export function getLocalizedUrl(locale, stem) {
  return new URL(getLocalizedRoute(locale, stem), SEO_BASE_URL).href;
}

export function getHreflangCluster(stem) {
  requireStem(stem);
  const localeEntries = Object.entries(V5_LOCALES).map(([locale, definition]) => Object.freeze({
    locale,
    hreflang: definition.hreflang,
    route: getLocalizedRoute(locale, stem),
    url: getLocalizedUrl(locale, stem),
  }));
  const english = localeEntries[0];
  return Object.freeze([
    ...localeEntries,
    Object.freeze({
      locale: 'en',
      hreflang: 'x-default',
      route: english.route,
      url: english.url,
    }),
  ]);
}
