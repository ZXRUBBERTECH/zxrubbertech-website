import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  SEO_BASE_URL,
  V5_ROUTE_MAP,
  seoPages,
} from './v5-seo-config.mjs';
import { getLocalizedRoute, getLocalizedUrl, V5_LOCALES } from './v5-i18n-config.mjs';
import { applyV5LocalizationOperations, loadV5Catalog } from './v5-i18n-transform.mjs';
import { injectV5LanguageControls } from './v5-language-controls.mjs';
import { applyV5SeoHead } from './v5-seo-transform.mjs';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const previewRoot = join(repo, 'design-demos');
const productionSitemapFile = join(repo, 'sitemap.xml');
const productionLogoFile = join(repo, 'LOGO', 'ZXLOGO.png');
const publicStems = Object.freeze(Object.keys(seoPages));

function isInside(parent, candidate) {
  const path = relative(parent, candidate);
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
}

function assertRegularFile(file, label) {
  if (!existsSync(file)) throw new Error(`${label}: missing file ${file}`);
  const info = lstatSync(file);
  if (info.isSymbolicLink() || !info.isFile()) throw new Error(`${label}: expected a regular file ${file}`);
  if (!isInside(repo, realpathSync(file))) throw new Error(`${label}: file resolves outside the repository`);
}

function prepareOutputDirectory(outputDir) {
  if (typeof outputDir !== 'string' || !outputDir.trim()) throw new Error('Release output must be a non-empty path');
  const output = resolve(outputDir);
  if (output === dirname(output)) throw new Error('Release output cannot be a filesystem root');
  if (isInside(repo, output)) throw new Error('Release output must be outside the repository');
  if (existsSync(output)) {
    const info = lstatSync(output);
    if (info.isSymbolicLink() || !info.isDirectory()) throw new Error(`Release output must be a real directory: ${output}`);
    if (readdirSync(output).length) throw new Error(`Release output directory must be empty: ${output}`);
  } else {
    mkdirSync(output, { recursive: true });
  }
  if (isInside(repo, realpathSync(output))) throw new Error('Release output resolves inside the repository');
  return output;
}

function copyTree(source, destination, label) {
  const info = lstatSync(source);
  if (info.isSymbolicLink()) throw new Error(`${label}: symbolic links are not allowed: ${source}`);
  if (info.isDirectory()) {
    mkdirSync(destination, { recursive: false });
    for (const entry of readdirSync(source, { withFileTypes: true })) {
      copyTree(join(source, entry.name), join(destination, entry.name), label);
    }
    return;
  }
  if (!info.isFile()) throw new Error(`${label}: unsupported filesystem entry ${source}`);
  copyFileSync(source, destination);
}

export function routePathToReleaseFile(outputDir, routePath) {
  if (typeof routePath !== 'string' || !/^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*\/)*$/.test(routePath)) {
    throw new Error(`Malformed V5 release route: ${String(routePath)}`);
  }
  const relativePath = routePath === '/' ? 'index.html' : `${routePath.slice(1)}index.html`;
  const file = resolve(outputDir, relativePath);
  if (!isInside(resolve(outputDir), file)) throw new Error(`Release route escapes output: ${routePath}`);
  return file;
}

function rewriteReleaseHtml(source, stem) {
  let html = source;
  html = html.replace(/<!--[\s\S]*?-->/g, (comment) => (/design-demos/i.test(comment) ? '' : comment));
  html = html.replaceAll('design-demos/build_shell.py', 'build_shell.py');
  html = html.replaceAll('industries-v5-spacer', 'industries-spacer');
  html = html.replaceAll('../LOGO/', '/LOGO/');
  html = html.replace(/(["'(=])media\//g, '$1/media/');
  return html;
}

function rewriteLocalizedInternalRoutes(html, locale) {
  const protectedRanges = [];
  for (const match of html.matchAll(/<!-- V5:LANGUAGE (?:DESKTOP|MOBILE|FOOTER) START -->[\s\S]*?<!-- V5:LANGUAGE (?:DESKTOP|MOBILE|FOOTER) END -->/g)) {
    protectedRanges.push([match.index, match.index + match[0].length]);
  }
  return html.replace(/(\bhref\s*=\s*)(["'])([^"']*)\2/gi, (whole, prefix, quote, href, offset) => {
    if (protectedRanges.some(([start, end]) => offset >= start && offset < end)) return whole;
    for (const [stem, englishRoute] of Object.entries(V5_ROUTE_MAP)) {
      const previewFile = `${stem}-v5.html`;
      if (href === previewFile || href.startsWith(`${previewFile}?`) || href.startsWith(`${previewFile}#`)) {
        return `${prefix}${quote}${getLocalizedRoute(locale, stem)}${href.slice(previewFile.length)}${quote}`;
      }
      if (englishRoute === '/') {
        if (href === '/' || href.startsWith('/?') || href.startsWith('/#')) {
          return `${prefix}${quote}${getLocalizedRoute(locale, stem)}${href.slice(1)}${quote}`;
        }
      } else if (href === englishRoute || href.startsWith(`${englishRoute}?`) || href.startsWith(`${englishRoute}#`)) {
        return `${prefix}${quote}${getLocalizedRoute(locale, stem)}${href.slice(englishRoute.length)}${quote}`;
      }
    }
    return whole;
  });
}

function sitemapUrls(xml, label) {
  if (typeof xml !== 'string' || !xml.trim()) throw new Error(`${label}: sitemap is empty`);
  if (!/<urlset\b[^>]*>[\s\S]*<\/urlset\s*>\s*$/i.test(xml)) throw new Error(`${label}: malformed urlset`);
  const urlBlocks = xml.match(/<url\b[^>]*>[\s\S]*?<\/url\s*>/gi) ?? [];
  const urls = [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((match) => match[1]);
  if (!urls.length || urls.length !== urlBlocks.length) throw new Error(`${label}: every url must contain exactly one loc`);
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
  }
  return urls;
}

function buildSitemapCandidate(locales) {
  const urls = locales.flatMap((locale) => publicStems.map((stem) => getLocalizedUrl(locale, stem)));
  if (urls.length !== new Set(urls).size) throw new Error('V5 multilingual sitemap contains duplicate URLs');
  const blocks = urls.map((url) => `  <url>\n    <loc>${url}</loc>\n  </url>`).join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${blocks}\n</urlset>\n`;
  const parsed = sitemapUrls(xml, 'V5 multilingual sitemap');
  if (JSON.stringify(parsed) !== JSON.stringify(urls)) throw new Error('V5 multilingual sitemap order changed');
  return { xml, urls };
}

export function buildV5Release({ outputDir, locales = null, locale = null } = {}) {
  if (locale !== null && locales !== null) throw new Error('Use either locale or locales, not both');
  const activeLocales = locale !== null ? [locale] : (locales ?? Object.keys(V5_LOCALES));
  if (!Array.isArray(activeLocales) || !activeLocales.length || new Set(activeLocales).size !== activeLocales.length) {
    throw new Error('V5 release locales must be a nonempty unique array');
  }
  for (const activeLocale of activeLocales) {
    if (!Object.hasOwn(V5_LOCALES, activeLocale)) {
      throw new Error(`Unsupported V5 release locale: ${String(activeLocale)}`);
    }
  }
  const output = prepareOutputDirectory(outputDir);
  const pages = [];
  for (const activeLocale of activeLocales) {
    const catalog = loadV5Catalog(activeLocale);
    for (const stem of publicStems) {
      const sourceFile = join(previewRoot, `${stem}-v5.html`);
      assertRegularFile(sourceFile, `${stem} preview V5 page`);
      let html = rewriteReleaseHtml(readFileSync(sourceFile, 'utf8'), stem);
      html = applyV5LocalizationOperations(html, { stem, locale: activeLocale, catalog });
      html = injectV5LanguageControls(html, { stem, locale: activeLocale });
      html = rewriteLocalizedInternalRoutes(html, activeLocale);
      html = applyV5SeoHead(html, stem, { profile: 'release', locale: activeLocale, catalog });
      const demoIdentifier = html.match(/design-demos|-v5|Demo A/i);
      if (demoIdentifier) {
        throw new Error(`${stem}/${activeLocale}: release transformation left ${JSON.stringify(demoIdentifier[0])} at byte ${demoIdentifier.index}`);
      }
      const route = getLocalizedRoute(activeLocale, stem);
      const outputFile = routePathToReleaseFile(output, route);
      mkdirSync(dirname(outputFile), { recursive: true });
      writeFileSync(outputFile, html);
      pages.push({
        locale: activeLocale,
        stem,
        route,
        file: relative(output, outputFile),
        sha256: createHash('sha256').update(html).digest('hex'),
      });
    }
  }

  const mediaSource = join(previewRoot, 'media');
  const mediaInfo = lstatSync(mediaSource);
  if (mediaInfo.isSymbolicLink() || !mediaInfo.isDirectory() || !isInside(repo, realpathSync(mediaSource))) {
    throw new Error('V5 media source must be a repository directory');
  }
  copyTree(mediaSource, join(output, 'media'), 'V5 media');
  assertRegularFile(productionLogoFile, 'V5 header logo');
  mkdirSync(join(output, 'LOGO'));
  copyFileSync(productionLogoFile, join(output, 'LOGO', 'ZXLOGO.png'));

  const sitemap = buildSitemapCandidate(activeLocales);
  writeFileSync(join(output, 'sitemap.xml'), sitemap.xml);
  writeFileSync(
    join(output, 'robots.txt'),
    `User-agent: *\nAllow: /\n\nSitemap: ${SEO_BASE_URL}/sitemap.xml\n`,
  );

  const report = {
    status: 'PASS',
    locales: activeLocales.length,
    localeIds: activeLocales,
    publicPages: pages.length,
    hreflangLinks: pages.length * 6,
    sitemapUrls: sitemap.urls.length,
    pages,
  };
  writeFileSync(join(output, 'v5-release-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

function parseCliArgs(argv) {
  let outputDir;
  let locale;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const equals = argument.match(/^--output=(.*)$/);
    if (equals) {
      if (outputDir !== undefined) throw new Error('Duplicate option: --output');
      outputDir = equals[1];
      continue;
    }
    if (argument === '--output') {
      if (outputDir !== undefined) throw new Error('Duplicate option: --output');
      if (index + 1 >= argv.length || argv[index + 1].startsWith('--')) {
        throw new Error('Missing value for --output');
      }
      outputDir = argv[index + 1];
      index += 1;
      continue;
    }
    const localeEquals = argument.match(/^--locale=(.*)$/);
    if (localeEquals) {
      if (locale !== undefined) throw new Error('Duplicate option: --locale');
      locale = localeEquals[1];
      continue;
    }
    if (argument === '--locale') {
      if (locale !== undefined) throw new Error('Duplicate option: --locale');
      if (index + 1 >= argv.length || argv[index + 1].startsWith('--')) {
        throw new Error('Missing value for --locale');
      }
      locale = argv[index + 1];
      index += 1;
      continue;
    }
    throw new Error(`Unexpected argument: ${argument}`);
  }
  if (outputDir === undefined || !outputDir.trim()) throw new Error('Missing required option: --output');
  if (locale !== undefined && !locale.trim()) throw new Error('Missing value for --locale');
  return { outputDir, locale: locale ?? null };
}

function main() {
  try {
    process.stdout.write(`${JSON.stringify(buildV5Release(parseCliArgs(process.argv.slice(2))), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
