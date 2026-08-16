import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const scriptsRoot = dirname(fileURLToPath(import.meta.url));
const repo = resolve(scriptsRoot, '..');
const supportedSuites = new Set(['registry', 'catalog', 'release', 'retirement', 'archive', 'all']);
const previewFiles = [
  'demo-a-v5.html',
  'products-v5.html',
  'compounds-v5.html',
  'industries-v5.html',
  'capabilities-v5.html',
  'faq-v5.html',
  'quote-v5.html',
];
const registryDependencies = [
  'check-v5-i18n.mjs',
  'v5-i18n-config.mjs',
  'v5-seo-config.mjs',
  'v5-route-map.json',
];

class CliError extends Error {}

function parseArgs(argv) {
  const options = {};
  for (const argument of argv) {
    const match = argument.match(/^--([a-z-]+)=(.+)$/);
    if (!match) throw new CliError(`Malformed argument: ${argument}`);
    const [, key, value] = match;
    if (!['suite', 'report', 'root'].includes(key)) throw new CliError(`Unknown argument: --${key}`);
    if (Object.hasOwn(options, key)) throw new CliError(`Duplicate argument: --${key}`);
    options[key] = value;
  }
  if (!options.suite) throw new CliError('Missing required argument: --suite');
  if (!supportedSuites.has(options.suite)) throw new CliError(`Unknown mutation suite: ${options.suite}`);
  if (!options.report) throw new CliError('Missing required argument: --report');
  const report = resolve(options.report);
  const rel = relative(repo, report);
  if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) {
    throw new CliError('Mutation report must be outside the repository');
  }
  let emptyOwnedReport = false;
  if (existsSync(report)) {
    const info = lstatSync(report);
    if (info.isSymbolicLink() || !info.isFile() || info.size !== 0) {
      throw new CliError(`Refusing to overwrite mutation report: ${report}`);
    }
    emptyOwnedReport = true;
  }
  const root = options.root ? realpathSync(resolve(options.root)) : null;
  return { suite: options.suite, report, root, emptyOwnedReport };
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function fixtureSha256(root) {
  const hash = createHash('sha256');
  const visit = (directory) => {
    for (const name of readdirSync(directory).sort()) {
      const file = join(directory, name);
      const info = lstatSync(file);
      if (info.isDirectory()) {
        visit(file);
        continue;
      }
      if (!info.isFile()) throw new Error(`Unsupported mutation fixture entry: ${file}`);
      hash.update(relative(root, file).split('\\').join('/'));
      hash.update('\0');
      hash.update(readFileSync(file));
      hash.update('\0');
    }
  };
  visit(root);
  return hash.digest('hex');
}

function replaceOnce(source, pattern, replacement, label) {
  const matches = source.match(pattern);
  if (!matches || matches.length !== 1) {
    throw new Error(`${label}: expected exactly one mutation target; found ${matches?.length ?? 0}`);
  }
  return source.replace(pattern, replacement);
}

function prepareRegistryFixture() {
  const parent = mkdtempSync(join(tmpdir(), 'zxrubbertech-v5-registry-mutation.'));
  const fixtureRepo = join(parent, 'zxrubbertech-website');
  const fixtureScripts = join(fixtureRepo, 'scripts');
  const fixturePreview = join(fixtureRepo, 'design-demos');
  mkdirSync(fixtureScripts, { recursive: true });
  mkdirSync(fixturePreview, { recursive: true });
  for (const file of registryDependencies) {
    copyFileSync(join(scriptsRoot, file), join(fixtureScripts, file));
  }
  for (const file of previewFiles) {
    copyFileSync(join(repo, 'design-demos', file), join(fixturePreview, file));
  }
  return { parent, fixtureRepo, fixtureScripts, fixturePreview };
}

function parseCheckerReport(result) {
  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

function runRegistryChecker(fixture, extraArgs = []) {
  return spawnSync(process.execPath, [
    realpathSync(join(fixture.fixtureScripts, 'check-v5-i18n.mjs')),
    '--gate=registry',
    '--profile=preview',
    `--root=${fixture.fixturePreview}`,
    ...extraArgs,
  ], {
    cwd: fixture.fixtureRepo,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
}

function runRegistryCase(testCase) {
  const fixture = prepareRegistryFixture();
  try {
    const greenResult = runRegistryChecker(fixture);
    const greenReport = parseCheckerReport(greenResult);
    const expectedGreenMetrics = { locales: 8, pageRoles: 7, routes: 56, hreflangsPerPage: 9 };
    const greenMetrics = greenReport?.registry ?? null;
    const greenPassed = greenResult.status === 0
      && greenReport?.status === 'PASS'
      && JSON.stringify(greenMetrics) === JSON.stringify(expectedGreenMetrics);

    const configFile = join(fixture.fixtureScripts, 'v5-i18n-config.mjs');
    if (testCase.mutateConfig) {
      const source = readFileSync(configFile, 'utf8');
      writeFileSync(configFile, testCase.mutateConfig(source), 'utf8');
    }
    if (testCase.emptyInventory) {
      for (const file of previewFiles) rmSync(join(fixture.fixturePreview, file));
    }
    const result = runRegistryChecker(fixture, testCase.extraArgs ?? []);
    const checkerReport = parseCheckerReport(result);
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    const signalFound = output.includes(testCase.expectedSignal);
    const exitMatches = result.status === testCase.expectedExit;
    const missingFileNoise = (output.match(/missing (?:file|page)|file does not exist/gi) ?? []).length;
    return {
      case: testCase.name,
      fixtureSha256: fixtureSha256(fixture.fixtureRepo),
      greenExitCode: greenResult.status,
      greenMetrics,
      expectedGreenMetrics,
      unaffectedMetricsMatch: greenPassed,
      exitCode: result.status,
      expectedExitCode: testCase.expectedExit,
      expectedSignal: testCase.expectedSignal,
      actualSignalFound: signalFound,
      mutationMetrics: checkerReport?.registry ?? null,
      missingFileNoise,
      status: greenPassed && exitMatches && signalFound && missingFileNoise === 0 ? 'PASS' : 'FAIL',
      greenStdoutSha256: sha256(greenResult.stdout ?? ''),
      greenStderrSha256: sha256(greenResult.stderr ?? ''),
      stdoutSha256: sha256(result.stdout ?? ''),
      stderrSha256: sha256(result.stderr ?? ''),
      output: output.trim(),
    };
  } finally {
    rmSync(fixture.parent, { recursive: true, force: true });
  }
}

function registryCases() {
  return [
    {
      name: 'unknown-locale',
      expectedExit: 2,
      expectedSignal: 'Unknown locale: xx',
      extraArgs: ['--locale=xx'],
    },
    {
      name: 'duplicate-prefix',
      expectedExit: 1,
      expectedSignal: 'Duplicate locale prefix: de',
      mutateConfig: (source) => replaceOnce(
        source,
        /ja: Object\.freeze\(\{\n\s+prefix: 'ja'/g,
        "ja: Object.freeze({\n    prefix: 'de'",
        'duplicate-prefix',
      ),
    },
    {
      name: 'persian-direction-ltr',
      expectedExit: 1,
      expectedSignal: 'Locale definition does not match the approved registry: fa',
      mutateConfig: (source) => replaceOnce(
        source,
        /fa: Object\.freeze\(\{([\s\S]*?)direction: 'rtl'/g,
        "fa: Object.freeze({$1direction: 'ltr'",
        'persian-direction-ltr',
      ),
    },
    {
      name: 'japanese-og-locale',
      expectedExit: 1,
      expectedSignal: 'Locale definition does not match the approved registry: ja',
      mutateConfig: (source) => replaceOnce(source, /ogLocale: 'ja_JP'/g, "ogLocale: 'ja_US'", 'japanese-og-locale'),
    },
    {
      name: 'x-default-not-english',
      expectedExit: 1,
      expectedSignal: 'x-default for demo-a must equal the English equivalent',
      mutateConfig: (source) => replaceOnce(source, /const english = localeEntries\[0\];/g, 'const english = localeEntries[1];', 'x-default-not-english'),
    },
    {
      name: 'empty-preview-inventory',
      expectedExit: 2,
      expectedSignal: 'Empty preview page inventory',
      emptyInventory: true,
    },
    {
      name: 'malformed-registry-module',
      expectedExit: 1,
      expectedSignal: 'V5 locale registry is missing or invalid',
      mutateConfig: () => 'export {\n',
    },
  ];
}

function runSuite({ suite, root }) {
  if (suite === 'registry') return registryCases().map(runRegistryCase);
  throw new CliError(`Mutation suite is registered but not implemented yet: ${suite}${root ? ` (${root})` : ''}`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const cases = runSuite(options);
  const failures = cases.filter((testCase) => testCase.status !== 'PASS').map((testCase) => testCase.case);
  const report = {
    checker: 'v5-i18n-mutations',
    status: failures.length === 0 ? 'PASS' : 'FAIL',
    suite: options.suite,
    cases,
    failures,
  };
  mkdirSync(dirname(options.report), { recursive: true });
  writeFileSync(options.report, `${JSON.stringify(report, null, 2)}\n`, {
    encoding: 'utf8',
    flag: options.emptyOwnedReport ? 'w' : 'wx',
  });
  process.stdout.write(`${JSON.stringify(report)}\n`);
  if (failures.length > 0) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  const report = { checker: 'v5-i18n-mutations', status: 'FAIL', error: error.message };
  process.stderr.write(`${JSON.stringify(report)}\n`);
  process.exitCode = error instanceof CliError ? 2 : 1;
}
