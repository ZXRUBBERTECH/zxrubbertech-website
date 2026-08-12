#!/usr/bin/env node

import { existsSync, mkdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLOUDFLARE_HOSTS, LEGACY_REDIRECTS, V5_URLS } from './v5-retirement-map.mjs';

if (process.argv.length !== 2) {
  process.stderr.write(`Unknown arguments: ${process.argv.slice(2).join(' ')}\n`);
  process.exit(2);
}

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const allowedTargets = new Set(V5_URLS);
const paths = new Set();

if (V5_URLS.length !== 7 || LEGACY_REDIRECTS.length !== 33 || CLOUDFLARE_HOSTS.length !== 2) {
  throw new Error('Redirect inventory counts are invalid');
}

for (const item of LEGACY_REDIRECTS) {
  if (paths.has(item.path)) throw new Error(`Duplicate legacy path: ${item.path}`);
  paths.add(item.path);
  if (!/^\/[a-z0-9/-]+\/$/.test(item.path)) throw new Error(`Malformed legacy path: ${item.path}`);
  if (!allowedTargets.has(item.target.split('#')[0])) throw new Error(`Target is outside V5: ${item.target}`);
  const output = resolve(repositoryRoot, `.${item.path}index.html`);
  if (!existsSync(output) || !statSync(output).isFile()) throw new Error(`Missing legacy page: ${item.path}`);
}

const htmlEscape = (value) => value
  .replaceAll('&', '&amp;')
  .replaceAll('"', '&quot;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;');

const fallbackHtml = (target) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,follow">
  <link rel="canonical" href="${htmlEscape(target)}">
  <meta http-equiv="refresh" content="0;url=${htmlEscape(target)}">
  <title>Page moved | ZHIXIN</title>
  <script>location.replace(${JSON.stringify(target)});</script>
</head>
<body>
  <main><p>This page has moved to <a href="${htmlEscape(target)}">the ZHIXIN V5 website</a>.</p></main>
</body>
</html>
`;

const atomicWrite = (file, contents) => {
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.v5-retirement.tmp`;
  writeFileSync(temporary, contents, 'utf8');
  renameSync(temporary, file);
};

for (const item of LEGACY_REDIRECTS) {
  atomicWrite(resolve(repositoryRoot, `.${item.path}index.html`), fallbackHtml(item.target));
}

const csv = LEGACY_REDIRECTS.flatMap(({ path, target }) => CLOUDFLARE_HOSTS.map((host) => (
  `${host}${path},${target},301,true,false,false,false`
))).join('\n') + '\n';
atomicWrite(resolve(repositoryRoot, 'cloudflare/zxrubbertech-v5-legacy-redirects.csv'), csv);

const xmlEscape = (value) => htmlEscape(value).replaceAll("'", '&apos;');
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${V5_URLS.map((url) => `  <url><loc>${xmlEscape(url)}</loc></url>`).join('\n')}
</urlset>
`;
atomicWrite(resolve(repositoryRoot, 'sitemap.xml'), sitemap);

process.stdout.write(`${JSON.stringify({
  status: 'PASS',
  fallbackPages: LEGACY_REDIRECTS.length,
  cloudflareEntries: LEGACY_REDIRECTS.length * CLOUDFLARE_HOSTS.length,
  sitemapUrls: V5_URLS.length,
}, null, 2)}\n`);
