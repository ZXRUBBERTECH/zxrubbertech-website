#!/usr/bin/env node

import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { CLOUDFLARE_HOSTS, LEGACY_REDIRECTS, V5_URLS } from './v5-retirement-map.mjs';

const cliFailures = [];
let rootArgument = null;

for (const argument of process.argv.slice(2)) {
  if (!argument.startsWith('--root=')) {
    cliFailures.push(`unknown argument: ${argument}`);
    continue;
  }
  if (rootArgument !== null) {
    cliFailures.push('duplicate --root argument');
    continue;
  }
  rootArgument = argument.slice('--root='.length);
  if (!rootArgument) cliFailures.push('--root must not be empty');
}

const repositoryRoot = resolve(rootArgument ?? resolve(import.meta.dirname, '..'));
if (!existsSync(repositoryRoot)) cliFailures.push(`root does not exist: ${repositoryRoot}`);
else if (!statSync(repositoryRoot).isDirectory()) cliFailures.push(`root is not a directory: ${repositoryRoot}`);

if (cliFailures.length) {
  process.stderr.write(`${JSON.stringify({ status: 'FAIL', failures: cliFailures }, null, 2)}\n`);
  process.exit(2);
}

const failures = [];
const expectedCounts = Object.freeze({ v5Urls: 35, legacyPaths: 25, hosts: 2, csvRows: 50 });
const allowedTargets = new Set(V5_URLS);
const allowedFragments = new Set(['', '#c-automotive', '#c-industrial']);
const legacyPaths = new Set();
const v5Paths = new Set(V5_URLS.map((url) => new URL(url).pathname));
const expectedLegacyRedirects = [
  ...['suspension-bushing', 'shock-absorber-dust-cover', 'ball-joint-dust-cover', 'wire-harness-sheath']
    .flatMap((slug) => ['', 'de', 'zh', 'ru', 'tr'].map((language) => ({
      path: `/${language ? `${language}/` : ''}products/${slug}/`,
      target: 'https://www.zxrubbertech.com/products/#c-automotive',
    }))),
  ...['', 'de', 'zh', 'ru', 'tr'].map((language) => ({
    path: `/${language ? `${language}/` : ''}products/rubber-wheel/`,
    target: 'https://www.zxrubbertech.com/products/#c-industrial',
  })),
];

const fail = (message) => failures.push(message);
const filePath = (relativePath) => resolve(repositoryRoot, relativePath);
const read = (relativePath) => {
  const absolutePath = filePath(relativePath);
  if (!existsSync(absolutePath)) {
    fail(`missing file: ${relativePath}`);
    return null;
  }
  if (!statSync(absolutePath).isFile()) {
    fail(`not a file: ${relativePath}`);
    return null;
  }
  return readFileSync(absolutePath, 'utf8');
};
const count = (haystack, needle) => haystack.split(needle).length - 1;
const htmlEscape = (value) => value
  .replaceAll('&', '&amp;')
  .replaceAll('"', '&quot;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;');
const decodeXml = (value) => value
  .replaceAll('&amp;', '&')
  .replaceAll('&quot;', '"')
  .replaceAll('&lt;', '<')
  .replaceAll('&gt;', '>')
  .replaceAll('&apos;', "'");

if (V5_URLS.length !== expectedCounts.v5Urls) fail(`expected 35 V5 URLs, found ${V5_URLS.length}`);
if (LEGACY_REDIRECTS.length !== expectedCounts.legacyPaths) fail(`expected 25 legacy paths, found ${LEGACY_REDIRECTS.length}`);
if (JSON.stringify(LEGACY_REDIRECTS) !== JSON.stringify(expectedLegacyRedirects)) {
  fail('legacy redirects must exactly equal the approved 25 product-detail mappings');
}
if (CLOUDFLARE_HOSTS.length !== expectedCounts.hosts) fail(`expected 2 Cloudflare hosts, found ${CLOUDFLARE_HOSTS.length}`);
if (new Set(CLOUDFLARE_HOSTS).size !== expectedCounts.hosts
  || !CLOUDFLARE_HOSTS.includes('zxrubbertech.com')
  || !CLOUDFLARE_HOSTS.includes('www.zxrubbertech.com')) {
  fail('Cloudflare hosts must be apex and www only');
}

for (const { path, target } of LEGACY_REDIRECTS) {
  if (legacyPaths.has(path)) fail(`duplicate legacy path: ${path}`);
  legacyPaths.add(path);
  if (v5Paths.has(path)) fail(`legacy path overlaps a V5 route: ${path}`);
  if (!/^\/[a-z0-9/-]+\/$/.test(path)) fail(`malformed legacy path: ${path}`);

  let targetUrl;
  try {
    targetUrl = new URL(target);
  } catch {
    fail(`malformed target URL: ${target}`);
    continue;
  }
  if (targetUrl.protocol !== 'https:' || targetUrl.hostname !== 'www.zxrubbertech.com') {
    fail(`target must use production HTTPS www host: ${target}`);
  }
  if (!allowedTargets.has(target.split('#')[0])) fail(`target is outside approved V5 URLs: ${target}`);
  if (!allowedFragments.has(targetUrl.hash)) fail(`unapproved target fragment: ${target}`);
}

const forbiddenFallbackPatterns = [
  /<nav\b/i,
  /<img\b/i,
  /<video\b/i,
  /<form\b/i,
  /application\/ld\+json/i,
  /hreflang=/i,
  /xkoevwql|mrpzqado/i,
  /turnstile/i,
];

let fallbackPages = 0;
for (const { path, target } of LEGACY_REDIRECTS) {
  const relativePath = `${path.slice(1)}index.html`;
  const contents = read(relativePath);
  if (contents === null) continue;
  fallbackPages += 1;
  if (Buffer.byteLength(contents, 'utf8') >= 2000) fail(`fallback page is too large: ${relativePath}`);
  const escapedTarget = htmlEscape(target);
  const requiredTokens = [
    '<meta name="robots" content="noindex,follow">',
    `<link rel="canonical" href="${escapedTarget}">`,
    `<meta http-equiv="refresh" content="0;url=${escapedTarget}">`,
    `location.replace(${JSON.stringify(target)})`,
    `<a href="${escapedTarget}">`,
  ];
  for (const token of requiredTokens) {
    if (count(contents, token) !== 1) fail(`fallback token count must be 1 in ${relativePath}: ${token}`);
  }
  for (const pattern of forbiddenFallbackPatterns) {
    if (pattern.test(contents)) fail(`legacy content marker remains in ${relativePath}: ${pattern}`);
  }
}

const csvRelativePath = 'cloudflare/zxrubbertech-v5-legacy-redirects.csv';
const csvContents = read(csvRelativePath);
let cloudflareEntries = 0;
if (csvContents !== null) {
  const rows = csvContents.split(/\r?\n/).filter(Boolean);
  cloudflareEntries = rows.length;
  if (rows.length !== expectedCounts.csvRows) fail(`expected 50 CSV rows, found ${rows.length}`);
  if (/source.?url/i.test(rows[0] ?? '')) fail('Cloudflare CSV must not contain a header row');

  const expectedRows = new Set(LEGACY_REDIRECTS.flatMap(({ path, target }) => CLOUDFLARE_HOSTS.map((host) => (
    `${host}${path},${target},301,true,false,false,false`
  ))));
  const actualRows = new Set();

  for (const row of rows) {
    if (actualRows.has(row)) fail(`duplicate Cloudflare CSV row: ${row}`);
    actualRows.add(row);
    const fields = row.split(',');
    if (fields.length !== 7) {
      fail(`Cloudflare CSV row must contain 7 fields: ${row}`);
      continue;
    }
    const [source, target, status, preserveQuery, includeSubdomains, subpathMatching, preservePathSuffix] = fields;
    if (/^https?:\/\//i.test(source) || /[?#]/.test(source)) fail(`Cloudflare source must omit scheme, query, and fragment: ${source}`);
    if (!CLOUDFLARE_HOSTS.some((host) => source.startsWith(`${host}/`))) fail(`unapproved Cloudflare source host: ${source}`);
    if (!LEGACY_REDIRECTS.some((item) => CLOUDFLARE_HOSTS.some((host) => source === `${host}${item.path}`) && item.target === target)) {
      fail(`unapproved Cloudflare mapping: ${source} -> ${target}`);
    }
    if (status !== '301') fail(`Cloudflare redirect must be 301: ${row}`);
    if (preserveQuery !== 'true') fail(`Cloudflare redirect must preserve query: ${row}`);
    if (includeSubdomains !== 'false') fail(`Cloudflare redirect must not include subdomains: ${row}`);
    if (subpathMatching !== 'false') fail(`Cloudflare redirect must not match subpaths: ${row}`);
    if (preservePathSuffix !== 'false') fail(`Cloudflare redirect must not preserve path suffix: ${row}`);
  }
  for (const expectedRow of expectedRows) {
    if (!actualRows.has(expectedRow)) fail(`missing Cloudflare CSV row: ${expectedRow}`);
  }
  for (const actualRow of actualRows) {
    if (!expectedRows.has(actualRow)) fail(`unexpected Cloudflare CSV row: ${actualRow}`);
  }
}

const sitemapContents = read('sitemap.xml');
let sitemapUrls = 0;
if (sitemapContents !== null) {
  const locations = [...sitemapContents.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => decodeXml(match[1]));
  sitemapUrls = locations.length;
  if (JSON.stringify(locations) !== JSON.stringify(V5_URLS)) {
    fail(`sitemap URLs must exactly equal the 35 V5 URLs: ${JSON.stringify(locations)}`);
  }
  if (/hreflang=/i.test(sitemapContents)) fail('sitemap must not contain legacy hreflang annotations');
  if (locations.some((location) => location.includes('#'))) fail('sitemap URLs must not contain fragments');
  if (new Set(locations).size !== locations.length) fail('sitemap URLs must be unique');
  for (const path of legacyPaths) {
    if (sitemapContents.includes(`https://www.zxrubbertech.com${path}`)) fail(`legacy URL remains in sitemap: ${path}`);
  }
}

const robotsContents = read('robots.txt');
if (robotsContents !== null) {
  for (const requiredLine of [
    'User-agent: *',
    'Allow: /',
    'Sitemap: https://www.zxrubbertech.com/sitemap.xml',
  ]) {
    if (!robotsContents.includes(requiredLine)) fail(`robots.txt missing: ${requiredLine}`);
  }
}

const publicPages = Object.freeze(V5_URLS.map((canonical) => {
  const path = new URL(canonical).pathname;
  return [path === '/' ? 'index.html' : `${path.slice(1)}index.html`, canonical];
}));

for (const [relativePath, canonical] of publicPages) {
  const contents = read(relativePath);
  if (contents === null) continue;
  const canonicalTags = [...contents.matchAll(/<link\b[^>]*\brel=["']canonical["'][^>]*>/gi)].map((match) => match[0]);
  if (canonicalTags.length !== 1 || !canonicalTags[0].includes(`href="${canonical}"`)) {
    fail(`page canonical mismatch: ${relativePath}`);
  }
  const h1Count = (contents.match(/<h1\b/gi) ?? []).length;
  if (h1Count !== 1) fail(`page must contain exactly one H1: ${relativePath}`);
  const jsonLdCount = (contents.match(/application\/ld\+json/gi) ?? []).length;
  if (jsonLdCount !== 1) fail(`page must contain exactly one JSON-LD block: ${relativePath}`);
  if (/name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(contents)) fail(`V5 page must remain indexable: ${relativePath}`);
  const hrefs = [...contents.matchAll(/\bhref=["']([^"']+)["']/gi)].map((match) => match[1]);
  for (const href of hrefs) {
    let pathname = null;
    if (href.startsWith('/')) pathname = href.split(/[?#]/)[0];
    else if (/^https:\/\/www\.zxrubbertech\.com\//.test(href)) pathname = new URL(href).pathname;
    if (pathname && [...legacyPaths].some((legacyPath) => pathname === legacyPath || pathname.startsWith(legacyPath))) {
      fail(`V5 page links to legacy path in ${relativePath}: ${href}`);
    }
  }
}

const quoteContents = read('quote/index.html');
if (quoteContents !== null) {
  for (const invariant of [
    'mrpzqado',
    '0x4AAAAAAENHOMMn_zK0WuNN',
    'www.zxrubbertech.com',
    'mailto:martin@zxrubbertech.com',
    'https://wa.me/8615256225135',
  ]) {
    if (!quoteContents.includes(invariant)) fail(`Quote invariant missing: ${invariant}`);
  }
}

const result = {
  status: failures.length ? 'FAIL' : 'PASS',
  profile: 'v5-only-production',
  failures,
  metrics: {
    v5Urls: V5_URLS.length,
    legacyPaths: LEGACY_REDIRECTS.length,
    fallbackPages,
    cloudflareEntries,
    sitemapUrls,
  },
};

(failures.length ? process.stderr : process.stdout).write(`${JSON.stringify(result, null, 2)}\n`);
if (failures.length) process.exit(1);
