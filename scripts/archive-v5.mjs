import { createHash } from 'node:crypto';
import {
  constants,
  copyFileSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageName = 'zxrubbertech-v5-release-candidate-2026-08-12-r2';
const archivePath = join(repo, '存档', `${packageName}.zip`);
const sidecarPath = `${archivePath}.sha256`;
const requiredFiles = [
  'AGENTS.md',
  'LOGO/ZXLOGO.png',
  'scripts/build-v5-hybrid.mjs',
  'scripts/check-v5-hybrid.mjs',
  'scripts/check-v5-scope.mjs',
  'scripts/v5-protected-baseline.json',
  'scripts/v5-footer-template.html',
  'scripts/build-v5-release.mjs',
  'scripts/check-v5-seo.mjs',
  'scripts/v5-image-dimensions.json',
  'scripts/v5-route-map.json',
  'scripts/v5-seo-assets.mjs',
  'scripts/v5-seo-config.mjs',
  'scripts/v5-seo-transform.mjs',
];
const publicV5Files = [
  'design-demos/demo-a-v5.html',
  'design-demos/products-v5.html',
  'design-demos/compounds-v5.html',
  'design-demos/industries-v5.html',
  'design-demos/capabilities-v5.html',
  'design-demos/faq-v5.html',
  'design-demos/quote-v5.html',
];
const expectedV5HtmlFiles = [
  ...publicV5Files,
  'design-demos/about-v5.html',
  'design-demos/engineering-v5.html',
  'design-demos/manufacturing-v5.html',
  'design-demos/assets-v5.html',
].sort();
const ignoredNames = new Set(['.DS_Store', 'Thumbs.db']);
const v5DocMarker = /V5|Industries V5|Products|Compounds|Home|ZX Logo/i;

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function lstatOrNull(file) {
  try {
    return lstatSync(file);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function assertInside(boundaryRoot, candidate, label) {
  const boundary = resolve(boundaryRoot);
  const target = resolve(candidate);
  const rel = relative(boundary, target);
  if (rel === '..' || rel.startsWith(`..${sep}`) || rel.startsWith('/') || rel === '') {
    if (target === boundary) return target;
    throw new Error(`${label} is outside its allowed root: ${candidate}`);
  }
  return target;
}

function assertSafeRoot(root, label) {
  const absolute = resolve(root);
  const stat = lstatOrNull(absolute);
  if (!stat) throw new Error(`${label} is missing: ${absolute}`);
  if (stat.isSymbolicLink()) throw new Error(`${label} must not be a symbolic link: ${absolute}`);
  if (!stat.isDirectory()) throw new Error(`${label} is not a directory: ${absolute}`);
  const real = realpathSync(absolute);
  if (real !== absolute) throw new Error(`${label} resolves through a symbolic link: ${absolute} -> ${real}`);
  return real;
}

function assertExistingPath(file, boundaryRoot, expectedType, label) {
  const boundary = assertSafeRoot(boundaryRoot, `${label} boundary`);
  const absolute = assertInside(boundary, file, label);
  const rel = relative(boundary, absolute);
  let current = boundary;

  for (const [index, segment] of rel.split(sep).entries()) {
    current = join(current, segment);
    const stat = lstatOrNull(current);
    if (!stat) throw new Error(`${label} is missing: ${current}`);
    if (stat.isSymbolicLink()) throw new Error(`${label} contains a symbolic link: ${current}`);
    const real = realpathSync(current);
    assertInside(boundary, real, `${label} real path`);
    if (index < rel.split(sep).length - 1 && !stat.isDirectory()) {
      throw new Error(`${label} has a non-directory parent: ${current}`);
    }
  }

  const stat = lstatSync(absolute);
  if (expectedType === 'file' && !stat.isFile()) throw new Error(`${label} is not a regular file: ${absolute}`);
  if (expectedType === 'directory' && !stat.isDirectory()) throw new Error(`${label} is not a directory: ${absolute}`);
  return absolute;
}

function assertSafeAbsentTarget(file, boundaryRoot, label) {
  const boundary = assertSafeRoot(boundaryRoot, `${label} boundary`);
  const absolute = assertInside(boundary, file, label);
  const parent = dirname(absolute);
  const parentRel = relative(boundary, parent);
  let current = boundary;
  let parentMissing = false;

  if (parentRel) {
    for (const segment of parentRel.split(sep)) {
      current = join(current, segment);
      const stat = lstatOrNull(current);
      if (!stat) {
        parentMissing = true;
        continue;
      }
      if (parentMissing) throw new Error(`${label} has an unexpected path below a missing parent: ${current}`);
      if (stat.isSymbolicLink()) throw new Error(`${label} parent must not be a symbolic link: ${current}`);
      if (!stat.isDirectory()) throw new Error(`${label} parent is not a directory: ${current}`);
      assertInside(boundary, realpathSync(current), `${label} parent real path`);
    }
  }

  const stat = lstatOrNull(absolute);
  if (stat?.isSymbolicLink()) throw new Error(`${label} must not be a symbolic link: ${absolute}`);
  if (stat) {
    assertInside(boundary, realpathSync(absolute), `${label} real path`);
    throw new Error(`Refusing to overwrite existing ${label}: ${absolute}`);
  }
  return absolute;
}

function toRepoRelative(file) {
  const rel = relative(repo, file);
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || resolve(repo, rel) !== resolve(file)) {
    throw new Error(`Archive input is outside the repository: ${file}`);
  }
  return rel.split(sep).join('/');
}

function walkFiles(root, boundaryRoot, { ignoreMetadata = true } = {}) {
  const safeRoot = assertExistingPath(root, boundaryRoot, 'directory', 'archive directory input');
  const files = [];
  for (const name of readdirSync(safeRoot).sort()) {
    if (ignoreMetadata && ignoredNames.has(name)) continue;
    const absolute = join(safeRoot, name);
    const stat = lstatSync(absolute);
    if (stat.isSymbolicLink()) throw new Error(`Archive tree contains a symbolic link: ${absolute}`);
    assertInside(boundaryRoot, realpathSync(absolute), 'archive tree real path');
    if (stat.isDirectory()) files.push(...walkFiles(absolute, boundaryRoot, { ignoreMetadata }));
    else if (stat.isFile()) files.push(absolute);
    else throw new Error(`Archive tree contains an unsupported file type: ${absolute}`);
  }
  return files;
}

function discoverInputs() {
  const demos = join(repo, 'design-demos');
  assertExistingPath(demos, repo, 'directory', 'design-demos input directory');
  const v5Html = readdirSync(demos)
    .filter((name) => name.endsWith('-v5.html'))
    .map((name) => assertExistingPath(join(demos, name), repo, 'file', 'V5 HTML input'));
  const media = walkFiles(join(demos, 'media'), repo);
  const docs = walkFiles(join(repo, 'docs', 'superpowers'), repo)
    .filter((file) => v5DocMarker.test(basename(file)) || v5DocMarker.test(readFileSync(file, 'utf8')));
  const fixed = [...requiredFiles, 'scripts/archive-v5.mjs'].map((file) => join(repo, file));

  return [...new Set([...fixed, ...v5Html, ...media, ...docs].map(toRepoRelative))].sort();
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repo,
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: options.capture ? 'utf8' : undefined,
  });

  if (result.error) throw new Error(`Unable to run ${command}: ${result.error.message}`);
  if (result.status !== 0) {
    const details = options.capture ? `\n${result.stderr || result.stdout}`.trimEnd() : '';
    throw new Error(`${command} ${args.join(' ')} failed with status ${result.status}${details}`);
  }
  return options.capture ? result.stdout.trim() : '';
}

function validateInputs(inputs) {
  for (const file of requiredFiles) {
    assertExistingPath(join(repo, file), repo, 'file', `required V5 archive input ${file}`);
  }
  for (const file of inputs) {
    assertExistingPath(join(repo, ...file.split('/')), repo, 'file', `discovered V5 archive input ${file}`);
  }

  const discoveredV5Html = inputs.filter((file) => /^design-demos\/[^/]+-v5\.html$/.test(file)).sort();
  const missingPages = expectedV5HtmlFiles.filter((file) => !discoveredV5Html.includes(file));
  const unexpectedPages = discoveredV5Html.filter((file) => !expectedV5HtmlFiles.includes(file));
  if (missingPages.length || unexpectedPages.length || discoveredV5Html.length !== 11) {
    throw new Error(
      `Expected the exact 11-file V5 HTML set; found ${discoveredV5Html.length}.` +
      `\nMissing:\n- ${missingPages.join('\n- ') || '(none)'}` +
      `\nUnexpected:\n- ${unexpectedPages.join('\n- ') || '(none)'}`,
    );
  }
  if (!inputs.some((file) => file.startsWith('design-demos/media/'))) {
    throw new Error('The complete design-demos/media directory is missing or empty');
  }
}

function parsePassingCheck(name, output) {
  let report;
  try {
    report = JSON.parse(output);
  } catch {
    throw new Error(`${name} did not return a single JSON report`);
  }
  if (report?.status !== 'PASS') throw new Error(`${name} did not report PASS`);
  return report;
}

function runPreflightChecks(releaseRoot) {
  const scope = parsePassingCheck(
    'V5 scope checker',
    run(process.execPath, ['scripts/check-v5-scope.mjs'], { capture: true }),
  );
  const content = parsePassingCheck(
    'V5 content checker',
    run(process.execPath, ['scripts/check-v5-hybrid.mjs'], { capture: true }),
  );
  if (content.publicPages !== 7) throw new Error(`V5 content checker reported ${content.publicPages} public pages, expected 7`);
  const previewSeo = parsePassingCheck(
    'V5 preview SEO checker',
    run(process.execPath, ['scripts/check-v5-seo.mjs', '--gate=all', '--profile=preview'], { capture: true }),
  );
  const releaseSeo = parsePassingCheck(
    'V5 release SEO checker',
    run(
      process.execPath,
      ['scripts/check-v5-seo.mjs', '--gate=all', '--profile=release', '--root', releaseRoot],
      { capture: true },
    ),
  );
  return { scope, content, previewSeo, releaseSeo };
}

function validateReleaseBundle(releaseRoot) {
  const safeRoot = assertSafeRoot(releaseRoot, 'accepted V5 release root');
  const requiredReleaseFiles = [
    'index.html',
    'products/index.html',
    'rubber-compounds/index.html',
    'industries/index.html',
    'capabilities/index.html',
    'faq/index.html',
    'quote/index.html',
    'sitemap.xml',
    'robots.txt',
    'v5-release-report.json',
    'LOGO/ZXLOGO.png',
  ];
  for (const file of requiredReleaseFiles) {
    assertExistingPath(join(safeRoot, ...file.split('/')), safeRoot, 'file', `required release bundle file ${file}`);
  }

  let releaseReport;
  try {
    releaseReport = JSON.parse(readFileSync(join(safeRoot, 'v5-release-report.json'), 'utf8'));
  } catch {
    throw new Error('Accepted V5 release report is not valid JSON');
  }
  if (releaseReport?.status !== 'PASS') throw new Error('Accepted V5 release report did not record PASS');
  if (releaseReport.publicPages !== 7) {
    throw new Error(`Accepted V5 release report recorded ${releaseReport.publicPages} public pages, expected 7`);
  }
  if (realpathSync(resolve(releaseReport.outputDir ?? '')) !== safeRoot) {
    throw new Error('Accepted V5 release report outputDir does not match --release-root');
  }

  const files = walkFiles(safeRoot, safeRoot);
  return {
    root: safeRoot,
    files,
    relativeFiles: files.map((file) => relative(safeRoot, file).split(sep).join('/')).sort(),
    report: releaseReport,
  };
}

function shanghaiTimestamp(date = new Date()) {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date).map(({ type, value }) => [type, value]),
  );
  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second} Asia/Shanghai`;
}

function snapshotMetadata() {
  const gitRevision = run('git', ['rev-parse', 'HEAD'], { capture: true });
  const statusOutput = run('git', ['status', '--porcelain=v1', '--untracked-files=all'], { capture: true });
  const gitStatus = statusOutput ? statusOutput.split('\n') : [];
  return {
    snapshotTimestamp: shanghaiTimestamp(),
    gitRevision,
    gitWorktreeState: gitStatus.length ? 'dirty' : 'clean',
    gitStatus,
  };
}

function summarizeInputs(inputs, releaseBundle, preflightChecks, metadata) {
  const v5HtmlFiles = inputs.filter((file) => /^design-demos\/[^/]+-v5\.html$/.test(file));
  const mediaFiles = inputs.filter((file) => file.startsWith('design-demos/media/'));
  const documentFiles = inputs.filter((file) => file.startsWith('docs/superpowers/'));
  return {
    archivePath,
    sidecarPath,
    fileCount: inputs.length,
    totalBytes: inputs.reduce((total, file) => total + statSync(join(repo, file)).size, 0),
    v5HtmlFiles: v5HtmlFiles.length,
    publicV5Pages: publicV5Files.length,
    mediaFiles: mediaFiles.length,
    documentFiles: documentFiles.length,
    releaseRoot: releaseBundle.root,
    releaseFiles: releaseBundle.relativeFiles.length,
    releaseBytes: releaseBundle.files.reduce((total, file) => total + statSync(file).size, 0),
    releaseReport: releaseBundle.report,
    preflightChecks,
    ...metadata,
  };
}

function copyInputs(inputs, packageRoot) {
  for (const file of inputs) {
    const source = assertExistingPath(
      join(repo, ...file.split('/')),
      repo,
      'file',
      `archive copy source ${file}`,
    );
    const destination = join(packageRoot, ...file.split('/'));
    mkdirSync(dirname(destination), { recursive: true });
    assertExistingPath(dirname(destination), packageRoot, 'directory', `archive copy destination parent ${file}`);
    assertSafeAbsentTarget(destination, packageRoot, `archive copy destination ${file}`);
    copyFileSync(source, destination, constants.COPYFILE_EXCL);
    assertExistingPath(destination, packageRoot, 'file', `staged archive file ${file}`);
  }
}

function copyReleaseBundle(releaseBundle, packageRoot) {
  for (const source of releaseBundle.files) {
    const file = relative(releaseBundle.root, source).split(sep).join('/');
    const verifiedSource = assertExistingPath(source, releaseBundle.root, 'file', `release bundle source ${file}`);
    const destination = join(packageRoot, 'release', ...file.split('/'));
    mkdirSync(dirname(destination), { recursive: true });
    assertExistingPath(dirname(destination), packageRoot, 'directory', `release bundle destination parent ${file}`);
    assertSafeAbsentTarget(destination, packageRoot, `release bundle destination ${file}`);
    copyFileSync(verifiedSource, destination, constants.COPYFILE_EXCL);
    assertExistingPath(destination, packageRoot, 'file', `staged release bundle file ${file}`);
  }
}

function makeReadme(metadata, inputs, releaseFiles) {
  const included = inputs.map((file) => `- \`${file}\``).join('\n');
  const includedRelease = releaseFiles.map((file) => `- \`release/${file}\``).join('\n');
  const gitStatus = metadata.gitStatus.length ? metadata.gitStatus.join('\n') : '(clean)';
  return `# ZHIXIN V5 Release Candidate Archive

- Snapshot time: ${metadata.snapshotTimestamp}
- Source Git revision: ${metadata.gitRevision}
- Git worktree state: ${metadata.gitWorktreeState}
- Integrity authority: SHA256SUMS records the exact archived file contents, including ignored design-demos outputs/media that Git status does not enumerate.
- Scope: local V5 release candidate; not deployed
- Preview entry page: design-demos/demo-a-v5.html
- Clean-route release entry page: release/index.html
- Validation: scope, hybrid, preview SEO and extracted release SEO checks

## Exact Git status at snapshot time

\`\`\`text
${gitStatus}
\`\`\`

## Restore into the complete original workspace

The scope checker depends on protected V4 and production files that are intentionally not stored in this V5-only archive. It also expects the original workspace layout: the repository plus the sibling outer \`design-demos/\` directory under the repository's parent. Start with that complete original workspace. Copy only the contents of the archive's top-level \`${packageName}/\` folder into the repository root; do not nest the top-level package folder inside the repository.

Set these two paths, inspect the dry-run, then perform the overlay:

\`\`\`bash
ZX_V5_EXTRACT_ROOT="/absolute/path/to/extracted/archive"
ZX_V5_REPO_ROOT="/absolute/path/to/complete/original/workspace/zxrubbertech-website"
test -f "$ZX_V5_EXTRACT_ROOT/${packageName}/SHA256SUMS"
test -f "$ZX_V5_REPO_ROOT/scripts/check-v5-scope.mjs"
test -d "$(dirname "$ZX_V5_REPO_ROOT")/design-demos"
(
  cd "$ZX_V5_EXTRACT_ROOT/${packageName}"
  shasum -a 256 -c SHA256SUMS
)
rsync -ain --exclude 'release/' --exclude 'SHA256SUMS' --exclude 'V5-ARCHIVE-README.md' "$ZX_V5_EXTRACT_ROOT/${packageName}/" "$ZX_V5_REPO_ROOT/"
rsync -a --exclude 'release/' --exclude 'SHA256SUMS' --exclude 'V5-ARCHIVE-README.md' "$ZX_V5_EXTRACT_ROOT/${packageName}/" "$ZX_V5_REPO_ROOT/"
cd "$ZX_V5_REPO_ROOT"
node scripts/check-v5-scope.mjs
node scripts/check-v5-hybrid.mjs
node scripts/check-v5-seo.mjs --gate=all --profile=preview
node scripts/check-v5-seo.mjs --gate=all --profile=release --root "$ZX_V5_EXTRACT_ROOT/${packageName}/release"
\`\`\`

Do not overwrite newer work without reviewing the \`rsync --dry-run\` output.

## Included source files

${included}

## Included clean-route release files

The \`release/\` directory is the verified, non-deployed clean-route bundle. It is excluded from the repository overlay commands above.

${includedRelease}
`;
}

function writeManifest(packageRoot) {
  const manifestPath = join(packageRoot, 'SHA256SUMS');
  const entries = walkFiles(packageRoot, packageRoot, { ignoreMetadata: false })
    .filter((file) => file !== manifestPath)
    .map((file) => relative(packageRoot, file).split(sep).join('/'))
    .sort();
  const contents = entries.map((file) => `${sha256(join(packageRoot, ...file.split('/')))}  ${file}`).join('\n');
  assertSafeAbsentTarget(manifestPath, packageRoot, 'SHA256SUMS output');
  writeFileSync(manifestPath, `${contents}\n`, { encoding: 'utf8', flag: 'wx' });
  assertExistingPath(manifestPath, packageRoot, 'file', 'SHA256SUMS output');
  return entries.length;
}

function parseManifest(manifestPath) {
  const entries = [];
  const lines = readFileSync(manifestPath, 'utf8').trimEnd().split('\n');
  for (const [index, line] of lines.entries()) {
    const match = line.match(/^([a-f0-9]{64}) {2}(.+)$/);
    if (!match) throw new Error(`Invalid SHA256SUMS line ${index + 1}`);
    const [, expectedHash, file] = match;
    if (
      file.includes('\0') ||
      file.startsWith('/') ||
      file === '.' ||
      file === '..' ||
      file.startsWith('../') ||
      file.endsWith('/..') ||
      file.includes('/../')
    ) {
      throw new Error(`Unsafe SHA256SUMS path: ${file}`);
    }
    entries.push({ expectedHash, file });
  }
  return entries;
}

function verifyExtractedArchive(extractRoot) {
  assertExistingPath(extractRoot, extractRoot, 'directory', 'archive extraction root');
  const topLevelEntries = readdirSync(extractRoot).sort();
  if (topLevelEntries.length !== 1 || topLevelEntries[0] !== packageName) {
    throw new Error(
      `Extracted archive must contain only the ${packageName} top-level directory; found: ` +
      (topLevelEntries.join(', ') || '(empty)'),
    );
  }
  const packageRoot = join(extractRoot, packageName);
  assertExistingPath(packageRoot, extractRoot, 'directory', 'extracted archive package root');
  const manifestPath = join(packageRoot, 'SHA256SUMS');
  assertExistingPath(manifestPath, packageRoot, 'file', 'extracted SHA256SUMS');

  const entries = parseManifest(manifestPath);
  const seen = new Set();
  for (const { expectedHash, file } of entries) {
    if (seen.has(file)) throw new Error(`Duplicate SHA256SUMS path: ${file}`);
    seen.add(file);
    const absolute = join(packageRoot, ...file.split('/'));
    assertInside(packageRoot, absolute, `extracted manifest entry ${file}`);
    assertExistingPath(absolute, packageRoot, 'file', `extracted manifest entry ${file}`);
    const actualHash = sha256(absolute);
    if (actualHash !== expectedHash) {
      throw new Error(`Checksum mismatch for extracted file: ${file}`);
    }
  }

  const extractedFiles = walkFiles(packageRoot, packageRoot, { ignoreMetadata: false })
    .map((file) => relative(packageRoot, file).split(sep).join('/'))
    .filter((file) => file !== 'SHA256SUMS')
    .sort();
  const manifestedFiles = [...seen].sort();
  if (JSON.stringify(extractedFiles) !== JSON.stringify(manifestedFiles)) {
    throw new Error('Extracted archive file set does not match SHA256SUMS');
  }
  return entries.length;
}

function assertTargetsAbsent() {
  assertSafeAbsentTarget(archivePath, repo, 'V5 archive ZIP');
  assertSafeAbsentTarget(sidecarPath, repo, 'V5 archive SHA-256 sidecar');
}

function removeOwnedOutput(file, attempted, label) {
  if (!attempted) return;
  const stat = lstatOrNull(file);
  if (!stat) return;
  if (stat.isSymbolicLink()) throw new Error(`Refusing to remove symbolic-link ${label}: ${file}`);
  assertInside(repo, realpathSync(file), `${label} cleanup path`);
  if (!stat.isFile()) throw new Error(`Refusing to remove non-file ${label}: ${file}`);
  unlinkSync(file);
}

function createArchive(inputs, releaseBundle, summary, metadata) {
  assertTargetsAbsent();

  let stageRoot;
  let extractRoot;
  let safeTmpRoot;
  let archiveCreated = false;
  let sidecarCreated = false;
  try {
    safeTmpRoot = assertSafeRoot(realpathSync(tmpdir()), 'system temporary directory');
    stageRoot = mkdtempSync(join(safeTmpRoot, 'zx-v5-archive-'));
    assertExistingPath(stageRoot, safeTmpRoot, 'directory', 'archive staging root');
    const packageRoot = join(stageRoot, packageName);
    mkdirSync(packageRoot, { recursive: true });
    assertExistingPath(packageRoot, stageRoot, 'directory', 'archive staging package root');
    copyInputs(inputs, packageRoot);
    copyReleaseBundle(releaseBundle, packageRoot);

    const readmePath = join(packageRoot, 'V5-ARCHIVE-README.md');
    assertSafeAbsentTarget(readmePath, packageRoot, 'V5 archive README');
    writeFileSync(
      readmePath,
      makeReadme(metadata, inputs, releaseBundle.relativeFiles),
      { encoding: 'utf8', flag: 'wx' },
    );
    assertExistingPath(readmePath, packageRoot, 'file', 'V5 archive README');
    const checksummedFiles = writeManifest(packageRoot);

    const stagedZipPath = join(stageRoot, `${packageName}.zip`);
    assertSafeAbsentTarget(stagedZipPath, stageRoot, 'staged V5 archive ZIP');
    run('/usr/bin/zip', ['-q', '-r', stagedZipPath, packageName], { cwd: stageRoot });
    assertExistingPath(stagedZipPath, stageRoot, 'file', 'staged V5 archive ZIP');

    extractRoot = mkdtempSync(join(safeTmpRoot, 'zx-v5-archive-verify-'));
    assertExistingPath(extractRoot, safeTmpRoot, 'directory', 'archive verification extraction root');
    run('/usr/bin/unzip', ['-q', stagedZipPath, '-d', extractRoot]);
    const verifiedFiles = verifyExtractedArchive(extractRoot);
    if (verifiedFiles !== checksummedFiles) {
      throw new Error(`Verified ${verifiedFiles} files but staged ${checksummedFiles} checksum entries`);
    }

    const archiveSha256 = sha256(stagedZipPath);
    assertTargetsAbsent();
    mkdirSync(dirname(archivePath), { recursive: true });
    assertExistingPath(dirname(archivePath), repo, 'directory', 'V5 archive output directory');
    assertTargetsAbsent();
    try {
      copyFileSync(stagedZipPath, archivePath, constants.COPYFILE_EXCL);
      archiveCreated = true;
      assertExistingPath(archivePath, repo, 'file', 'V5 archive ZIP');
    } catch (error) {
      if (error.code !== 'EEXIST') removeOwnedOutput(archivePath, true, 'V5 archive ZIP');
      throw error;
    }
    if (sha256(archivePath) !== archiveSha256) throw new Error('Published V5 archive ZIP hash differs from verified staging ZIP');
    assertSafeAbsentTarget(sidecarPath, repo, 'V5 archive SHA-256 sidecar');
    try {
      writeFileSync(sidecarPath, `${archiveSha256}  ${basename(archivePath)}\n`, { encoding: 'utf8', flag: 'wx' });
      sidecarCreated = true;
      assertExistingPath(sidecarPath, repo, 'file', 'V5 archive SHA-256 sidecar');
    } catch (error) {
      if (error.code !== 'EEXIST') removeOwnedOutput(sidecarPath, true, 'V5 archive SHA-256 sidecar');
      throw error;
    }

    return {
      status: 'PASS',
      ...summary,
      archivedFiles: checksummedFiles + 1,
      archiveBytes: statSync(archivePath).size,
      archiveSha256,
    };
  } catch (error) {
    removeOwnedOutput(sidecarPath, sidecarCreated, 'V5 archive SHA-256 sidecar');
    removeOwnedOutput(archivePath, archiveCreated, 'V5 archive ZIP');
    throw error;
  } finally {
    if (extractRoot) {
      assertExistingPath(extractRoot, safeTmpRoot, 'directory', 'archive verification cleanup root');
      rmSync(extractRoot, { recursive: true, force: true });
    }
    if (stageRoot) {
      assertExistingPath(stageRoot, safeTmpRoot, 'directory', 'archive staging cleanup root');
      rmSync(stageRoot, { recursive: true, force: true });
    }
  }
}

function parseArgs(args) {
  let dryRun = false;
  let releaseRoot;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--dry-run') {
      if (dryRun) throw new Error('Duplicate --dry-run argument');
      dryRun = true;
      continue;
    }
    if (arg === '--release-root') {
      if (releaseRoot) throw new Error('Duplicate --release-root argument');
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw new Error('--release-root requires a directory path');
      releaseRoot = realpathSync(resolve(value));
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  if (!releaseRoot) {
    throw new Error('Usage: node scripts/archive-v5.mjs --release-root <accepted-release-directory> [--dry-run]');
  }
  return { dryRun, releaseRoot };
}

function main() {
  const { dryRun, releaseRoot } = parseArgs(process.argv.slice(2));
  assertSafeRoot(repo, 'repository root');
  const inputs = discoverInputs();
  validateInputs(inputs);
  const releaseBundle = validateReleaseBundle(releaseRoot);
  const preflightChecks = runPreflightChecks(releaseBundle.root);
  const metadata = snapshotMetadata();
  const summary = summarizeInputs(inputs, releaseBundle, preflightChecks, metadata);

  if (dryRun) {
    console.log(JSON.stringify({ status: 'DRY_RUN', ...summary }, null, 2));
    return;
  }

  console.log(JSON.stringify(createArchive(inputs, releaseBundle, summary, metadata), null, 2));
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({ status: 'FAIL', error: error.message }, null, 2));
  process.exitCode = 1;
}
