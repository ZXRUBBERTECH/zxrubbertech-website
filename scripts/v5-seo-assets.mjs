import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { dirname, extname, isAbsolute, join, posix, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const designDemos = join(repo, 'design-demos');
const inlineMediaDir = join(designDemos, 'media', 'v5-inline');
const manifestPath = join(repo, 'scripts', 'v5-image-dimensions.json');
const publicStems = ['demo-a', 'products', 'compounds', 'industries', 'capabilities', 'faq', 'quote'];

const imageMimeTypes = Object.freeze({
  'image/jpeg': { extension: 'jpg' },
  'image/png': { extension: 'png' },
  'image/svg+xml': { extension: 'svg' },
  'image/webp': { extension: 'webp' },
});

const mimeByExtension = Object.freeze({
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
});

const approvedInlineVideos = Object.freeze({
  '22164b8c814e677cb020d6fb1685657fad2a05c0d24280cff28739f742cc39c5': 'media/hero-rubber-mixing.mp4',
  '8e8123b3e23880e9ba98ffe60376e39acc60e955952fa354e94cbb52c7b8d1f0': 'media/vid-products-components-montage.mp4',
});

const originalInlineVideoByStem = Object.freeze({
  'demo-a': 'media/hero-rubber-mixing.mp4',
  products: 'media/vid-products-components-montage.mp4',
});

export const V5_PRODUCTS_GALLERY_RULE_BEFORE_DIMENSIONS =
  '.gal img{aspect-ratio:1;object-fit:contain;object-position:center;width:78%;margin:26px auto 54px;';
export const V5_PRODUCTS_GALLERY_RULE_WITH_DIMENSIONS =
  '.gal img{aspect-ratio:1;object-fit:contain;object-position:center;width:78%;height:auto;margin:26px auto 54px;';

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function isInside(parent, candidate) {
  const path = relative(parent, candidate);
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
}

function assertRegularFile(file, label) {
  if (!existsSync(file)) throw new Error(`${label}: missing file ${file}`);
  const info = lstatSync(file);
  if (info.isSymbolicLink() || !info.isFile()) throw new Error(`${label}: expected a regular file ${file}`);
}

function decodeBase64Strict(value, label) {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error(`${label}: malformed Base64 payload`);
  }
  const bytes = Buffer.from(value, 'base64');
  if (!bytes.length || bytes.toString('base64') !== value) throw new Error(`${label}: non-canonical Base64 payload`);
  return bytes;
}

export function validateV5MediaSignature(bytes, mime, label = mime) {
  let valid = false;
  if (mime === 'image/png') {
    valid = bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  } else if (mime === 'image/jpeg') {
    valid = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  } else if (mime === 'image/webp') {
    valid = bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF'
      && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
  } else if (mime === 'image/svg+xml') {
    valid = /^(?:<\?xml[^>]*>\s*)?<svg\b/i.test(bytes.toString('utf8').trim());
  } else if (mime === 'video/mp4') {
    valid = bytes.length >= 12 && bytes.subarray(4, 8).toString('ascii') === 'ftyp';
  }
  if (!valid) throw new Error(`${label}: bytes do not match ${mime}`);
}

function writeDecodedImage(bytes, mime, hash, label) {
  const extension = imageMimeTypes[mime]?.extension;
  if (!extension) throw new Error(`${label}: unsupported inline image MIME ${mime}`);
  mkdirSync(inlineMediaDir, { recursive: true });
  const fileName = `${hash.slice(0, 16)}.${extension}`;
  const file = join(inlineMediaDir, fileName);
  if (existsSync(file)) {
    assertRegularFile(file, label);
    const existing = readFileSync(file);
    if (!existing.equals(bytes)) throw new Error(`${label}: hash-path collision at ${file}`);
  } else {
    writeFileSync(file, bytes);
  }
  return `media/v5-inline/${fileName}`;
}

function resolveApprovedVideo(bytes, hash, label) {
  const relativePath = approvedInlineVideos[hash];
  if (!relativePath) throw new Error(`${label}: inline MP4 ${hash} has no approved existing-file match`);
  const file = resolve(designDemos, relativePath);
  if (!isInside(designDemos, file)) throw new Error(`${label}: approved MP4 escapes design-demos`);
  assertRegularFile(file, label);
  const existing = readFileSync(file);
  if (!existing.equals(bytes)) throw new Error(`${label}: approved MP4 bytes differ from ${relativePath}`);
  return relativePath;
}

export function externalizeV5DataImages(html, stem) {
  if (typeof html !== 'string' || !html) throw new Error(`${stem}: V5 HTML must be a non-empty string`);
  const pattern = /data:((?:image\/(?:jpeg|png|svg\+xml|webp))|video\/mp4);base64,([A-Za-z0-9+/=]+)/gi;
  const transformed = html.replace(pattern, (dataUri, rawMime, payload) => {
    const mime = rawMime.toLowerCase();
    const bytes = decodeBase64Strict(payload, `${stem} ${mime}`);
    validateV5MediaSignature(bytes, mime, `${stem} ${mime}`);
    const hash = sha256(bytes);
    if (mime === 'video/mp4') return resolveApprovedVideo(bytes, hash, `${stem} ${mime}`);
    return writeDecodedImage(bytes, mime, hash, `${stem} ${mime}`);
  });
  if (/data:(?:image|video)\//i.test(transformed)) {
    throw new Error(`${stem}: unsupported or unexternalized data image/video remains`);
  }
  return transformed;
}

export function normalizeV5ImageSource(source) {
  if (typeof source !== 'string' || !source.trim()) throw new Error('Image source must be a non-empty string');
  const value = source.trim();
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|\/)/i.test(value)) throw new Error(`Image source must be repository-local: ${value}`);
  if (value.includes('\\')) throw new Error(`Image source contains a backslash: ${value}`);
  const withoutSuffix = value.split(/[?#]/, 1)[0];
  let decoded;
  try {
    decoded = decodeURIComponent(withoutSuffix);
  } catch {
    throw new Error(`Image source has malformed percent encoding: ${value}`);
  }
  const normalized = posix.normalize(decoded.replace(/^\.\//, ''));
  if (!normalized || normalized === '.' || normalized.startsWith('/')) throw new Error(`Image source is malformed: ${value}`);
  return normalized;
}

export function loadV5ImageDimensions() {
  assertRegularFile(manifestPath, 'V5 image dimension manifest');
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    throw new Error(`V5 image dimension manifest is malformed: ${error.message}`);
  }
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest) || !Object.keys(manifest).length) {
    throw new Error('V5 image dimension manifest must be a non-empty object');
  }
  for (const [source, entry] of Object.entries(manifest)) {
    if (normalizeV5ImageSource(source) !== source) throw new Error(`Manifest source is not normalized: ${source}`);
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`Manifest entry is malformed: ${source}`);
    if (!Number.isInteger(entry.width) || entry.width <= 0 || !Number.isInteger(entry.height) || entry.height <= 0) {
      throw new Error(`Manifest dimensions are invalid: ${source}`);
    }
    if (!/^[a-f0-9]{64}$/.test(entry.sha256 ?? '')) throw new Error(`Manifest SHA-256 is invalid: ${source}`);
    if (!Object.hasOwn(mimeByExtension, extname(source).toLowerCase())) throw new Error(`Manifest extension is unsupported: ${source}`);
    if (entry.mime !== mimeByExtension[extname(source).toLowerCase()]) throw new Error(`Manifest MIME does not match: ${source}`);
  }
  return manifest;
}

export function addV5ImageDimensions(html) {
  const manifest = loadV5ImageDimensions();
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    const src = tag.match(/\bsrc\s*=\s*(["'])(.*?)\1/i)?.[2];
    if (!src) throw new Error('V5 image is missing src');
    const key = normalizeV5ImageSource(src);
    const dimensions = manifest[key];
    if (!dimensions) throw new Error(`V5 image has no dimension manifest entry: ${key}`);
    const width = tag.match(/\bwidth\s*=\s*(["'])(.*?)\1/i)?.[2];
    const height = tag.match(/\bheight\s*=\s*(["'])(.*?)\1/i)?.[2];
    if (width || height) {
      if (width !== String(dimensions.width) || height !== String(dimensions.height)) {
        throw new Error(`V5 image dimensions do not match manifest: ${key}`);
      }
      return tag;
    }
    return tag.replace(/\s*\/?>$/, (closing) => ` width="${dimensions.width}" height="${dimensions.height}"${closing}`);
  });
}

export function preserveV5ImageLayout(html, stem) {
  if (stem !== 'products') return html;
  if (typeof html !== 'string' || !html) throw new Error(`${stem}: V5 HTML must be a non-empty string`);
  const sourceCount = html.split(V5_PRODUCTS_GALLERY_RULE_BEFORE_DIMENSIONS).length - 1;
  const protectedCount = html.split(V5_PRODUCTS_GALLERY_RULE_WITH_DIMENSIONS).length - 1;
  if (sourceCount !== 1 || protectedCount !== 0) {
    throw new Error(
      `${stem}: expected one unprotected gallery image rule and no pre-existing protected rule`,
    );
  }
  return html.replace(
    V5_PRODUCTS_GALLERY_RULE_BEFORE_DIMENSIONS,
    V5_PRODUCTS_GALLERY_RULE_WITH_DIMENSIONS,
  );
}

function mimeForPath(source) {
  const mime = mimeByExtension[extname(source).toLowerCase()];
  if (!mime) throw new Error(`Unsupported manifest image extension: ${source}`);
  return mime;
}

function parseSvgDimensions(bytes, source) {
  const svg = bytes.toString('utf8');
  const viewBox = svg.match(/\bviewBox\s*=\s*(["'])\s*[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?[\s,]+[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?[\s,]+(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)\s*\1/i);
  if (!viewBox) throw new Error(`SVG has no usable viewBox: ${source}`);
  const width = Number(viewBox[2]);
  const height = Number(viewBox[3]);
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new Error(`SVG viewBox dimensions must be positive integers: ${source}`);
  }
  return { width, height };
}

function collectManifestSources() {
  const sources = new Set();
  for (const stem of publicStems) {
    const file = join(designDemos, `${stem}-v5.html`);
    assertRegularFile(file, `${stem} generated V5 page`);
    const html = externalizeV5DataImages(readFileSync(file, 'utf8'), stem);
    for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
      const src = match[0].match(/\bsrc\s*=\s*(["'])(.*?)\1/i)?.[2];
      if (!src) throw new Error(`${stem}: image is missing src`);
      sources.add(normalizeV5ImageSource(src));
    }
    for (const match of html.matchAll(/media\/v5-inline\/[a-f0-9]{16}\.(?:jpg|png|svg|webp)/g)) {
      sources.add(normalizeV5ImageSource(match[0]));
    }
  }
  return [...sources].sort();
}

function generateV5ImageDimensions() {
  const sources = collectManifestSources();
  const resolved = new Map();
  for (const source of sources) {
    const file = resolve(designDemos, source);
    if (!isInside(repo, file)) throw new Error(`Manifest image escapes the repository: ${source}`);
    assertRegularFile(file, source);
    if (!isInside(repo, realpathSync(file))) throw new Error(`Manifest image resolves outside the repository: ${source}`);
    resolved.set(source, file);
  }

  const rasterSources = sources.filter((source) => mimeForPath(source) !== 'image/svg+xml');
  const sips = spawnSync('/usr/bin/sips', [
    '-g', 'pixelWidth', '-g', 'pixelHeight', ...rasterSources.map((source) => resolved.get(source)),
  ], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (sips.error || sips.status !== 0) throw new Error(`sips failed: ${sips.error?.message ?? sips.stderr.trim()}`);
  const sipsDimensions = new Map();
  let currentFile = null;
  for (const line of sips.stdout.split(/\r?\n/)) {
    if (line && !/^\s/.test(line)) {
      currentFile = line.trim();
      sipsDimensions.set(currentFile, {});
      continue;
    }
    const property = line.match(/^\s+pixel(Width|Height):\s+(\d+)\s*$/);
    if (property && currentFile) sipsDimensions.get(currentFile)[property[1].toLowerCase()] = Number(property[2]);
  }

  const manifest = {};
  for (const source of sources) {
    const file = resolved.get(source);
    const bytes = readFileSync(file);
    const mime = mimeForPath(source);
    validateV5MediaSignature(bytes, mime, source);
    const dimensions = mime === 'image/svg+xml' ? parseSvgDimensions(bytes, source) : sipsDimensions.get(file);
    if (!Number.isInteger(dimensions?.width) || dimensions.width <= 0
      || !Number.isInteger(dimensions?.height) || dimensions.height <= 0) {
      throw new Error(`sips returned invalid dimensions for ${source}`);
    }
    manifest[source] = { width: dimensions.width, height: dimensions.height, sha256: sha256(bytes), mime };
  }
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { images: sources.length, rasterImages: rasterSources.length, svgImages: sources.length - rasterSources.length };
}

export function restoreV5PerformanceChangesForVisualHash(bodyHtml, stem) {
  if (!existsSync(manifestPath)) return bodyHtml;
  const manifest = loadV5ImageDimensions();
  let restored = bodyHtml.replace(
    /(<img\b[^>]*?) width="\d+" height="\d+"(\s*\/?>)/g,
    '$1$2',
  );
  for (const [source, entry] of Object.entries(manifest)) {
    if (!source.startsWith('media/v5-inline/')) continue;
    const file = resolve(designDemos, source);
    assertRegularFile(file, `Visual-hash asset ${source}`);
    const bytes = readFileSync(file);
    if (sha256(bytes) !== entry.sha256) throw new Error(`Visual-hash asset differs from manifest: ${source}`);
    restored = restored.replaceAll(source, `data:${entry.mime};base64,${bytes.toString('base64')}`);
  }
  const videoSource = originalInlineVideoByStem[stem];
  if (videoSource) {
    const file = resolve(designDemos, videoSource);
    const bytes = readFileSync(file);
    restored = restored.replaceAll(videoSource, `data:video/mp4;base64,${bytes.toString('base64')}`);
  }
  return restored;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1 || args[0] !== '--write-manifest') {
    throw new Error('Usage: node scripts/v5-seo-assets.mjs --write-manifest');
  }
  process.stdout.write(`${JSON.stringify(generateV5ImageDimensions(), null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
