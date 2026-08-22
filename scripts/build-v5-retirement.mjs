#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getHreflangCluster, getLocalizedRoute, getLocalizedUrl, V5_LOCALES, V5_PAGE_STEMS } from './v5-i18n-config.mjs';
import { CLOUDFLARE_HOSTS, LEGACY_REDIRECTS, V5_URLS } from './v5-retirement-map.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const registryLocales = Object.freeze(Object.keys(V5_LOCALES));
const legacyLocales = Object.freeze(['en', 'de', 'zh-CN', 'ru', 'tr']);
const expectedV5Urls = Object.freeze(registryLocales.flatMap((locale) => (
  V5_PAGE_STEMS.map((stem) => getLocalizedUrl(locale, stem))
)));
const acceptedCsvSha256 = '8d17b3226a266ff4539cf9a6721e4854992121663aeebd60354b3e73cf76fb63';
const exactRobots = `User-agent: *\nAllow: /\n\nSitemap: https://www.zxrubbertech.com/sitemap.xml\n`;
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function isInside(parent, candidate) {
  const path = relative(parent, candidate);
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
}

function prepareRoot(root) {
  if (typeof root !== 'string' || !root.trim()) throw new Error('Retirement root must be a non-empty path');
  const output = resolve(root);
  if (output === dirname(output)) throw new Error('Retirement root cannot be a filesystem root');
  if (isInside(repositoryRoot, output)) throw new Error('Retirement root must be outside the repository');
  if (!existsSync(output) || !lstatSync(output).isDirectory() || lstatSync(output).isSymbolicLink()) {
    throw new Error(`Retirement root must be an existing real directory: ${output}`);
  }
  if (isInside(repositoryRoot, realpathSync(output))) throw new Error('Retirement root resolves inside the repository');
  return output;
}

const htmlEscape = (value) => value
  .replaceAll('&', '&amp;')
  .replaceAll('"', '&quot;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;');

const fallbackCopy = Object.freeze({
  en: Object.freeze({ title: 'Page moved | ZHIXIN', lead: 'This page has moved to ', link: 'the ZHIXIN V5 website', tail: '.' }),
  de: Object.freeze({ title: 'Seite verschoben | ZHIXIN', lead: 'Diese Seite wurde verschoben. ', link: 'Zur ZHIXIN V5-Website', tail: '.' }),
  'zh-CN': Object.freeze({ title: '页面已迁移 | ZHIXIN', lead: '此页面已迁移。', link: '前往 ZHIXIN V5 网站', tail: '。' }),
  ru: Object.freeze({ title: 'Страница перемещена | ZHIXIN', lead: 'Эта страница была перемещена. ', link: 'Перейти на сайт ZHIXIN V5', tail: '.' }),
  tr: Object.freeze({ title: 'Sayfa taşındı | ZHIXIN', lead: 'Bu sayfa taşındı. ', link: 'ZHIXIN V5 sitesine git', tail: '.' }),
});

const fallbackHtml = ({ locale, htmlLang, target }) => {
  const copy = fallbackCopy[locale];
  if (!copy) throw new Error(`Missing fallback copy for locale: ${String(locale)}`);
  return `<!doctype html>
<html lang="${htmlEscape(htmlLang)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,follow">
  <link rel="canonical" href="${htmlEscape(target)}">
  <meta http-equiv="refresh" content="0;url=${htmlEscape(target)}">
  <title>${htmlEscape(copy.title)}</title>
  <script>location.replace(${JSON.stringify(target)});</script>
</head>
<body>
  <main><p>${htmlEscape(copy.lead)}<a href="${htmlEscape(target)}">${htmlEscape(copy.link)}</a>${htmlEscape(copy.tail)}</p></main>
</body>
</html>
`;
};

const atomicWrite = (file, contents) => {
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.v5-retirement.tmp`;
  writeFileSync(temporary, contents, 'utf8');
  renameSync(temporary, file);
};

const xmlEscape = (value) => htmlEscape(value).replaceAll("'", '&apos;');

export function buildV5Retirement({ root } = {}) {
  const outputRoot = prepareRoot(root);
  const allowedTargets = new Set(V5_URLS);
  const v5Paths = new Set(V5_URLS.map((url) => new URL(url).pathname));
  const paths = new Set();
  if (JSON.stringify(V5_URLS) !== JSON.stringify(expectedV5Urls)
      || V5_URLS.length !== registryLocales.length * V5_PAGE_STEMS.length
      || LEGACY_REDIRECTS.length !== 25
      || CLOUDFLARE_HOSTS.length !== 2) {
    throw new Error('Redirect inventory counts are invalid');
  }
  const reportFile = resolve(outputRoot, 'v5-release-report.json');
  if (!existsSync(reportFile) || !statSync(reportFile).isFile()) throw new Error('Missing full V5 release report');
  let releaseReport;
  try {
    releaseReport = JSON.parse(readFileSync(reportFile, 'utf8'));
  } catch {
    throw new Error('V5 release report is malformed');
  }
  const expectedPageRecords = registryLocales.flatMap((locale) => V5_PAGE_STEMS.map((stem) => ({
    locale,
    stem,
    route: getLocalizedRoute(locale, stem),
  })));
  if (releaseReport?.status !== 'PASS'
      || releaseReport.locales !== registryLocales.length
      || JSON.stringify(releaseReport.localeIds) !== JSON.stringify(registryLocales)
      || releaseReport.publicPages !== expectedPageRecords.length
      || releaseReport.hreflangLinks !== expectedPageRecords.length * getHreflangCluster(V5_PAGE_STEMS[0]).length
      || releaseReport.sitemapUrls !== expectedPageRecords.length
      || !Array.isArray(releaseReport.pages)
      || releaseReport.pages.length !== expectedPageRecords.length) {
    throw new Error(`Retirement requires the complete ordered ${expectedPageRecords.length}-page V5 release report`);
  }
  for (const [index, expected] of expectedPageRecords.entries()) {
    const page = releaseReport.pages[index];
    if (page?.locale !== expected.locale || page?.stem !== expected.stem || page?.route !== expected.route) {
      throw new Error(`V5 release report page order mismatch at index ${index}`);
    }
  }
  for (const url of V5_URLS) {
    const path = new URL(url).pathname;
    const page = resolve(outputRoot, `.${path}index.html`);
    if (!existsSync(page) || !statSync(page).isFile()) throw new Error(`Missing V5 release page: ${path}`);
  }
  const robots = readFileSync(resolve(outputRoot, 'robots.txt'), 'utf8');
  if (robots !== exactRobots) throw new Error('robots.txt differs from the exact approved V5 content');
  for (const item of LEGACY_REDIRECTS) {
    if (paths.has(item.path)) throw new Error(`Duplicate legacy path: ${item.path}`);
    paths.add(item.path);
    if (v5Paths.has(item.path)) throw new Error(`Legacy path overlaps a V5 route: ${item.path}`);
    if (!/^\/[a-z0-9/-]+\/$/.test(item.path)) throw new Error(`Malformed legacy path: ${item.path}`);
    if (!allowedTargets.has(item.target.split('#')[0])) throw new Error(`Target is outside V5: ${item.target}`);
  }
  const legacyCounts = new Map(legacyLocales.map((locale) => [locale, 0]));
  for (const { locale } of LEGACY_REDIRECTS) {
    if (!legacyCounts.has(locale)) throw new Error(`Unexpected legacy locale: ${String(locale)}`);
    legacyCounts.set(locale, legacyCounts.get(locale) + 1);
  }
  for (const locale of legacyLocales) {
    if (legacyCounts.get(locale) !== 5) {
      throw new Error(`Legacy locale ${locale} must contain exactly 5 redirects`);
    }
  }
  const csv = LEGACY_REDIRECTS.flatMap(({ path, target }) => CLOUDFLARE_HOSTS.map((host) => (
    `${host}${path},${target},301,true,false,false,false`
  ))).join('\n') + '\n';
  if (sha256(csv) !== acceptedCsvSha256) throw new Error('Generated Cloudflare CSV differs from the approved 50-row artifact');
  const fallbackOutputs = LEGACY_REDIRECTS.map((item) => ({
    file: resolve(outputRoot, `.${item.path}index.html`),
    html: fallbackHtml(item),
  }));
  for (const { file, html } of fallbackOutputs) atomicWrite(file, html);
  atomicWrite(resolve(outputRoot, 'cloudflare/zxrubbertech-v5-legacy-redirects.csv'), csv);
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${V5_URLS.map((url) => `  <url><loc>${xmlEscape(url)}</loc></url>`).join('\n')}
</urlset>
`;
  atomicWrite(resolve(outputRoot, 'sitemap.xml'), sitemap);
  return {
    status: 'PASS',
    v5Urls: V5_URLS.length,
    fallbackPages: LEGACY_REDIRECTS.length,
    cloudflareEntries: LEGACY_REDIRECTS.length * CLOUDFLARE_HOSTS.length,
    sitemapUrls: V5_URLS.length,
  };
}

function parseRoot(argv) {
  if (argv.length !== 1 || !argv[0].startsWith('--root=') || !argv[0].slice('--root='.length)) {
    throw new Error('Usage: node scripts/build-v5-retirement.mjs --root=<release-root>');
  }
  return argv[0].slice('--root='.length);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(`${JSON.stringify(buildV5Retirement({ root: parseRoot(process.argv.slice(2)) }), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
