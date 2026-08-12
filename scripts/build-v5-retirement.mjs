#!/usr/bin/env node

import { existsSync, lstatSync, mkdirSync, realpathSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLOUDFLARE_HOSTS, LEGACY_REDIRECTS, V5_URLS } from './v5-retirement-map.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

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

const xmlEscape = (value) => htmlEscape(value).replaceAll("'", '&apos;');

export function buildV5Retirement({ root } = {}) {
  const outputRoot = prepareRoot(root);
  const allowedTargets = new Set(V5_URLS);
  const v5Paths = new Set(V5_URLS.map((url) => new URL(url).pathname));
  const paths = new Set();
  if (V5_URLS.length !== 35 || LEGACY_REDIRECTS.length !== 25 || CLOUDFLARE_HOSTS.length !== 2) {
    throw new Error('Redirect inventory counts are invalid');
  }
  for (const url of V5_URLS) {
    const path = new URL(url).pathname;
    const page = resolve(outputRoot, `.${path}index.html`);
    if (!existsSync(page) || !statSync(page).isFile()) throw new Error(`Missing V5 release page: ${path}`);
  }
  for (const item of LEGACY_REDIRECTS) {
    if (paths.has(item.path)) throw new Error(`Duplicate legacy path: ${item.path}`);
    paths.add(item.path);
    if (v5Paths.has(item.path)) throw new Error(`Legacy path overlaps a V5 route: ${item.path}`);
    if (!/^\/[a-z0-9/-]+\/$/.test(item.path)) throw new Error(`Malformed legacy path: ${item.path}`);
    if (!allowedTargets.has(item.target.split('#')[0])) throw new Error(`Target is outside V5: ${item.target}`);
  }
  for (const item of LEGACY_REDIRECTS) {
    atomicWrite(resolve(outputRoot, `.${item.path}index.html`), fallbackHtml(item.target));
  }
  const csv = LEGACY_REDIRECTS.flatMap(({ path, target }) => CLOUDFLARE_HOSTS.map((host) => (
    `${host}${path},${target},301,true,false,false,false`
  ))).join('\n') + '\n';
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
