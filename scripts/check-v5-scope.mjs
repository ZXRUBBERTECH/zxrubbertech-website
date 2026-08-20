import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const workspace = resolve(repo, '..');
const workspaceReal = realpathSync(workspace);
const baselineFile = process.env.ZX_V5_SCOPE_BASELINE_FILE
  ? resolve(process.env.ZX_V5_SCOPE_BASELINE_FILE)
  : join(repo, 'scripts/v5-protected-baseline.json');
const productionRoots = [
  'index.html', 'CNAME', '.nojekyll', 'robots.txt', 'sitemap.xml', 'og-image.jpg', 'assets',
  'de', 'zh', 'ru', 'tr', 'ja', 'ko', 'fa', 'products',
  'rubber-compounds', 'industries', 'capabilities', 'faq', 'quote',
];
const productionVisualRoots = ['OptimizedPicture', '产品照片', '设备照片'];
const productionScripts = ['extract_i18n.mjs','build_i18n_pages.py','build_products.py','build_sitemap.py'];
const hash = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const v5OnlyLogoNames = new Set(['ZXLOGO.png', 'ZXLOGO-circle.webp', 'ZXLOGO-vector.svg']);

const ignoredNames = new Set(['.DS_Store', 'Thumbs.db']);
const toWorkspacePath = (file) => relative(workspace, file).split('\\').join('/');

function isInside(parent, candidate) {
  const path = relative(parent, candidate);
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
}

function inspectProtectedPath(candidate) {
  const absolute = resolve(candidate);
  if (!isInside(workspace, absolute)) {
    throw new Error(`Protected path escapes the workspace: ${candidate}`);
  }

  let info;
  try {
    info = lstatSync(absolute);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  if (info.isSymbolicLink()) {
    throw new Error(`Symbolic links are not allowed in protected paths: ${toWorkspacePath(absolute)}`);
  }

  const physical = realpathSync(absolute);
  if (!isInside(workspaceReal, physical)) {
    throw new Error(`Protected path resolves outside the workspace: ${toWorkspacePath(absolute)}`);
  }
  return { absolute, info };
}

function addTree(root, files, excluded = new Set()) {
  const inspected = inspectProtectedPath(root);
  if (!inspected) return;
  const { absolute, info } = inspected;
  if (excluded.has(absolute)) return;

  if (info.isFile()) {
    if (!ignoredNames.has(basename(absolute))) files.add(absolute);
    return;
  }
  if (!info.isDirectory()) {
    throw new Error(`Unsupported protected path type: ${toWorkspacePath(absolute)}`);
  }

  for (const name of readdirSync(absolute).sort()) {
    if (ignoredNames.has(name)) continue;
    addTree(join(absolute, name), files, excluded);
  }
}

function addFile(candidate, files) {
  const inspected = inspectProtectedPath(candidate);
  if (!inspected) return false;
  const { absolute, info } = inspected;
  if (!info.isFile()) {
    throw new Error(`Expected a protected file: ${toWorkspacePath(absolute)}`);
  }
  if (!ignoredNames.has(basename(absolute))) files.add(absolute);
  return true;
}

function extractMediaReferences(html) {
  const references = [];
  const patterns = [
    /\b(?:src|poster|data-gated-src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi,
    /\burl\s*\(\s*(?:"([^"]*)"|'([^']*)'|([^\s"')]+))\s*\)/gi,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html))) {
      const reference = match.slice(1).find((value) => value !== undefined);
      if (reference) references.push(reference.trim());
    }
  }
  return references;
}

function resolveInnerMediaReference(htmlFile, reference, innerDemos) {
  if (!reference || reference.startsWith('#') || reference.startsWith('//')) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(reference)) return null;

  const withoutSuffix = reference.split(/[?#]/, 1)[0];
  if (!withoutSuffix) return null;

  let decoded;
  try {
    decoded = decodeURIComponent(withoutSuffix);
  } catch {
    return null;
  }

  const candidate = decoded.startsWith('/design-demos/media/')
    ? join(repo, decoded.slice(1))
    : decoded.startsWith('/')
      ? null
      : resolve(dirname(htmlFile), decoded);
  if (!candidate) return null;

  const mediaRoot = join(innerDemos, 'media');
  return isInside(mediaRoot, candidate) && candidate !== mediaRoot ? candidate : null;
}

function addReferencedV4Media(files, innerDemos) {
  const protectedHtml = [...files]
    .filter((file) => isInside(innerDemos, file))
    .filter((file) => file.toLowerCase().endsWith('.html'))
    .filter((file) => !basename(file).endsWith('-v5.html'));

  for (const htmlFile of protectedHtml) {
    const html = readFileSync(htmlFile, 'utf8');
    for (const reference of extractMediaReferences(html)) {
      const mediaFile = resolveInnerMediaReference(htmlFile, reference, innerDemos);
      if (mediaFile) addFile(mediaFile, files);
    }
  }
}

function collectProtectedFiles() {
  const files = new Set();

  addTree(join(workspace, 'design-demos'), files);

  const innerDemos = join(repo, 'design-demos');
  const innerDemosInspection = inspectProtectedPath(innerDemos);
  if (innerDemosInspection) {
    for (const name of readdirSync(innerDemosInspection.absolute).sort()) {
      if (ignoredNames.has(name) || name.endsWith('-v5.html')) continue;
      const candidate = join(innerDemosInspection.absolute, name);
      const inspected = inspectProtectedPath(candidate);
      if (inspected?.info.isFile()) files.add(inspected.absolute);
    }
  }
  for (const name of ['shared-v4.css', 'shared-v4.js', 'build_shell.py', 'v4-audit-pages.json']) {
    addFile(join(innerDemos, name), files);
  }
  addTree(join(innerDemos, 'shared-v4'), files);
  addTree(join(innerDemos, 'shared'), files);
  addReferencedV4Media(files, innerDemos);

  for (const path of productionRoots) addTree(join(repo, path), files);
  const v5OnlyLogoAssets = new Set(
    [...v5OnlyLogoNames].map((name) => resolve(repo, 'LOGO', name)),
  );
  addTree(join(repo, 'LOGO'), files, v5OnlyLogoAssets);
  for (const path of productionVisualRoots) addTree(join(repo, path), files);
  for (const script of productionScripts) addFile(join(repo, 'scripts', script), files);
  addFile(join(repo, 'AGENTS.md'), files);

  return [...files]
    .map((file) => ({ path: toWorkspacePath(file), sha256: hash(file) }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

function validateBaseline(baseline) {
  if (!baseline || typeof baseline !== 'object' || Array.isArray(baseline)) {
    throw new Error('Protected baseline must be a JSON object.');
  }
  if (baseline.version !== 1) {
    throw new Error('Protected baseline version must be 1.');
  }
  if (!Array.isArray(baseline.files) || baseline.files.length === 0) {
    throw new Error('Protected baseline files must be a non-empty array.');
  }

  const seen = new Set();
  for (const [index, file] of baseline.files.entries()) {
    if (!file || typeof file !== 'object' || Array.isArray(file)) {
      throw new Error(`Protected baseline entry ${index} must be an object.`);
    }
    if (typeof file.path !== 'string' || !file.path || file.path.includes('\\') || file.path.includes('\0')) {
      throw new Error(`Protected baseline entry ${index} has an invalid path.`);
    }
    const resolvedPath = resolve(workspace, file.path);
    if (!isInside(workspace, resolvedPath) || toWorkspacePath(resolvedPath) !== file.path) {
      throw new Error(`Protected baseline entry ${index} has a non-canonical path.`);
    }
    if (typeof file.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(file.sha256)) {
      throw new Error(`Protected baseline entry ${index} has an invalid SHA-256.`);
    }
    if (seen.has(file.path)) {
      throw new Error(`Protected baseline contains duplicate path: ${file.path}`);
    }
    seen.add(file.path);
  }
  return baseline.files;
}

function printReport(report) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

function fail(protectedFiles, error) {
  printReport({
    status: 'FAIL',
    protectedFiles,
    missing: [],
    modified: [],
    unexpected: [],
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
}

function main() {
  let currentFiles;
  try {
    currentFiles = collectProtectedFiles();
  } catch (error) {
    fail(0, error);
    return;
  }

  const writeBaseline = process.argv.includes('--write-baseline');
  if (writeBaseline) {
    if (process.env.ZX_V5_SCOPE_BASELINE_APPROVED !== '1') {
      fail(currentFiles.length, 'Writing the protected baseline requires ZX_V5_SCOPE_BASELINE_APPROVED=1.');
      return;
    }
    writeFileSync(baselineFile, `${JSON.stringify({ version: 1, files: currentFiles }, null, 2)}\n`);
    printReport({
      status: 'PASS',
      protectedFiles: currentFiles.length,
      missing: [],
      modified: [],
      unexpected: [],
    });
    return;
  }

  if (!existsSync(baselineFile)) {
    fail(currentFiles.length, `Protected baseline not found: ${baselineFile}`);
    return;
  }

  let baselineFiles;
  try {
    baselineFiles = validateBaseline(JSON.parse(readFileSync(baselineFile, 'utf8')));
  } catch (error) {
    fail(currentFiles.length, `Unable to use protected baseline: ${error.message}`);
    return;
  }

  const baselineMap = new Map(baselineFiles.map((file) => [file.path, file.sha256]));
  const currentMap = new Map(currentFiles.map((file) => [file.path, file.sha256]));
  const missing = [...baselineMap.keys()].filter((path) => !currentMap.has(path)).sort();
  const unexpected = [...currentMap.keys()].filter((path) => !baselineMap.has(path)).sort();
  const modified = [...baselineMap.keys()]
    .filter((path) => currentMap.has(path) && currentMap.get(path) !== baselineMap.get(path))
    .sort();
  const report = {
    status: missing.length || modified.length || unexpected.length ? 'FAIL' : 'PASS',
    protectedFiles: currentFiles.length,
    missing,
    modified,
    unexpected,
  };
  printReport(report);
  if (report.status === 'FAIL') process.exitCode = 1;
}

main();
