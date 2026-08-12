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
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  SEO_BASE_URL,
  V5_ROUTE_MAP,
  seoPages,
} from './v5-seo-config.mjs';
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
  let html = applyV5SeoHead(source, stem, { profile: 'release' });
  for (const [targetStem, route] of Object.entries(V5_ROUTE_MAP)) {
    html = html.replaceAll(`${targetStem}-v5.html`, route);
  }
  html = html.replace(/<!--[\s\S]*?-->/g, (comment) => (/design-demos/i.test(comment) ? '' : comment));
  html = html.replaceAll('design-demos/build_shell.py', 'build_shell.py');
  html = html.replaceAll('industries-v5-spacer', 'industries-spacer');
  html = html.replaceAll('../LOGO/', '/LOGO/');
  html = html.replace(/(["'(=])media\//g, '$1/media/');
  const demoIdentifier = html.match(/design-demos|-v5|Demo A/i);
  if (demoIdentifier) {
    throw new Error(
      `${stem}: release transformation left ${JSON.stringify(demoIdentifier[0])} at byte ${demoIdentifier.index}`,
    );
  }
  return html;
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

function buildSitemapCandidate() {
  assertRegularFile(productionSitemapFile, 'Production sitemap input');
  const existingXml = readFileSync(productionSitemapFile, 'utf8');
  const existingUrls = sitemapUrls(existingXml, 'Production sitemap input');
  const v5Urls = publicStems.map((stem) => new URL(V5_ROUTE_MAP[stem], SEO_BASE_URL).href);
  const existingSet = new Set(existingUrls);
  const additions = v5Urls.filter((url) => !existingSet.has(url));
  const blocks = additions.map((url) => `  <url>\n    <loc>${url}</loc>\n  </url>`).join('\n');
  const candidateXml = existingXml.replace(
    /\s*<\/urlset\s*>\s*$/i,
    `${blocks ? `\n${blocks}` : ''}\n</urlset>\n`,
  );
  const candidateUrls = sitemapUrls(candidateXml, 'V5 sitemap candidate');
  const replacedV5Routes = new Set([
    new URL(V5_ROUTE_MAP['demo-a'], SEO_BASE_URL).href,
    new URL(V5_ROUTE_MAP.products, SEO_BASE_URL).href,
  ]);
  return {
    xml: candidateXml,
    existingUrls,
    additions,
    candidateUrls,
    retainedLegacyLocalizedUrls: existingUrls.filter((url) => !replacedV5Routes.has(url)).length,
  };
}

export function buildV5Release({ outputDir } = {}) {
  const output = prepareOutputDirectory(outputDir);
  const pages = [];
  for (const stem of publicStems) {
    const sourceFile = join(previewRoot, `${stem}-v5.html`);
    assertRegularFile(sourceFile, `${stem} preview V5 page`);
    const html = rewriteReleaseHtml(readFileSync(sourceFile, 'utf8'), stem);
    const outputFile = routePathToReleaseFile(output, V5_ROUTE_MAP[stem]);
    mkdirSync(dirname(outputFile), { recursive: true });
    writeFileSync(outputFile, html);
    pages.push({ stem, route: V5_ROUTE_MAP[stem], file: relative(output, outputFile) });
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

  const sitemap = buildSitemapCandidate();
  writeFileSync(join(output, 'sitemap.xml'), sitemap.xml);
  writeFileSync(
    join(output, 'robots.txt'),
    `User-agent: *\nAllow: /\n\nSitemap: ${SEO_BASE_URL}/sitemap.xml\n`,
  );

  const report = {
    status: 'PASS',
    outputDir: output,
    publicPages: pages.length,
    pages,
    productionSitemapUrls: sitemap.existingUrls.length,
    retainedLegacyLocalizedUrls: sitemap.retainedLegacyLocalizedUrls,
    addedV5SitemapUrls: sitemap.additions.length,
    candidateSitemapUrls: sitemap.candidateUrls.length,
  };
  writeFileSync(join(output, 'v5-release-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

function parseCliArgs(argv) {
  let outputDir;
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
    throw new Error(`Unexpected argument: ${argument}`);
  }
  if (outputDir === undefined || !outputDir.trim()) throw new Error('Missing required option: --output');
  return { outputDir };
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
