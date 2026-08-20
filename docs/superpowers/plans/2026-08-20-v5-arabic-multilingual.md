# V5 Modern Standard Arabic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add complete Modern Standard Arabic versions of all seven V5 page roles, producing a nine-language, 63-page production release without changing verified facts, media, form services, or historical redirects.

**Architecture:** The primary Agent exclusively owns shared source, checkers, generated output, integration, archive, and deployment. One Arabic catalog Agent works in an isolated worktree and creates exactly one 531-key locale JSON; separate read-only language Reviewer, technical Reviewer, and Gatekeeper Agents validate each stage and automatically release passing gates.

**Tech Stack:** Static HTML, Node.js ES modules, JSON catalogs, Git worktrees, GitHub Pages, Chrome DevTools Protocol acceptance, Cloudflare Turnstile, Formspree.

## Global Constraints

- Production, remote, Pages, and rollback baseline are exactly `1e0c849355c7bf3774db565d6c7a10c01d3522eb` until the authorized final push.
- Code foundation is exactly `8d09537b6d810e03b7693b998dd624dce509b6e3`; its direct parent is the production baseline and its only changed file is `scripts/check-v5-acceptance.mjs`.
- D0 design commit is exactly `a7d927a24e197a1fedf006253a9905aa6b8ddc04`, direct parent `8d09537b6d810e03b7693b998dd624dce509b6e3`, with exactly the PRD and design paths.
- Work only in isolated worktrees. Never edit, stage, clean, reset, move, or delete anything in `/Users/ren/Documents/zxrubbertech-website/zxrubbertech-website`.
- Generated HTML is never hand-edited. Change V5 build source, generate to a repository-external root, validate, then mechanically materialize accepted bytes.
- The new locale ID is exactly `ar`; it uses region-neutral Modern Standard Arabic and `dir="rtl"`.
- English remains `x-default`; do not add IP, browser-language, cookie, or localStorage redirects.
- Final counts are 9 locales, 7 roles, 63 canonical pages, 10 `hreflang` links per page, 630 total `hreflang` links, 63 sitemap URLs, 27 language anchors per page, and 1,701 anchors total.
- Historical inventory remains 25 fallback pages and 50 Cloudflare CSV rows. CSV SHA-256 remains `8d17b3226a266ff4539cf9a6721e4854992121663aeebd60354b3e73cf76fb63`.
- Current V5 Formspree endpoint is exactly `https://formspree.io/f/mrpzqado`; Turnstile Site Key is exactly `0x4AAAAAAENHOMMn_zK0WuNN`. These values override the obsolete historical Formspree value in `AGENTS.md`.
- Keep `robots.txt`, `CNAME`, `.nojekyll`, media, Logo, map, email, WhatsApp, company facts, technical data, existing eight catalogs, the 508-operation contract, and the 19 protected literals unchanged except for registry-driven multilingual HTML metadata and controls.
- Automated tests must not solve Turnstile or send a real Formspree submission. Attempted, actual, and real Formspree POST counts must remain zero and intercepted URLs must be an empty array.
- Local acceptance has zero redirect rows. Production acceptance separately checks all 50 Cloudflare rows.
- A normal in-scope failure returns to the responsible Agent for repair and re-review. Only a HOLD condition from the approved design stops for user input.
- Never force push. Deployment is one non-force push of the exact accepted candidate after independent Reviewer and Gatekeeper PASS.
- Cloudflare, Formspree, Turnstile, and Search Console writes are outside scope.

## Evidence, Fixture, and Cleanup Contract

- Evidence root is exactly `/tmp/zxrubbertech-ar-evidence-20260820`. Every formal report is created once with `O_EXCL`/Node `wx`; an existing target is HOLD. Expected-red reports are immutable diagnostics, while Gatekeeper/Reviewer PASS reports additionally require `status: "PASS"` and `failures: []`.
- Raw checker stdout is first captured to a unique `mktemp` file, then published with `/tmp/zxrubbertech-ar-evidence-20260820/publish-exclusive.mjs`. That helper must be created with the exact source below and have SHA-256 `2d9e9908b47f7923151ceb4c6854f27cf739e574d241566645a40bf207409ca5`:

```js
#!/usr/bin/env node
import { constants, copyFileSync, lstatSync } from "node:fs";
const [source, target] = process.argv.slice(2);
if (!source || !target) throw new Error("usage: publish-exclusive.mjs <source> <target>");
if (!lstatSync(source).isFile()) throw new Error(`source is not a regular file: ${source}`);
copyFileSync(source, target, constants.COPYFILE_EXCL);
```

- The publisher source is itself written once with `apply_patch`, never shell redirection. Each stdout-producing red check uses `mktemp`, records the checker exit, publishes through the helper, then removes only the unique temporary capture in a `finally`/trap. Revision runs use a new `-rN` evidence name; no prior report is deleted, truncated, or overwritten.
- Exact formal evidence paths are frozen as follows: `a0-baseline.json`, `a0-scope-gatekeeper.json`, `a1-registry-gatekeeper.json`, `ar-terminology-proposal.json`, `ar-terminology-review.json`, `ar-catalog-review.json`, `a4-catalog-gatekeeper.json`, `a5-release-gatekeeper.json`, `a6-release-gatekeeper.json`, `a7-local-acceptance.json`, `a7-local-reviewer.json`, `a7-local-gatekeeper.json`, `a8-candidate.json`, `a8-candidate-reviewer.json`, `a8-candidate-gatekeeper.json`, `a9-archive.json`, `a9-archive-reviewer.json`, `a9-predeploy-gatekeeper.json`, `a9-pages.json`, `a9-production-acceptance.json`, `a9-production-reviewer.json`, `a9-production-gatekeeper.json`, and `a10-final-gatekeeper.json`, all under the evidence root. A diagnosed rerun uses `-r2`, `-r3`, and so on and binds the superseded report SHA.
- Temporary release roots, mutation fixtures, catalog worktree/branch, browser profiles, local servers, archive extraction, and downloaded Pages artifacts are repository-external. They are retained only until the consuming Reviewer and Gatekeeper evidence is sealed, then removed in `finally`; the accepted final release remains until archive/Pages/production verification completes. Formal evidence, ZIP, and sidecar are never removed. Cleanup must run after both PASS and FAIL and be recorded.
- The isolated repository requires two workflow-owned locked ignored inputs before any scope gate. First, copy (never symlink) outer `/private/tmp/zxrubbertech-ar-scope-fixtures-20260821/outer` to `/private/tmp/zxrubbertech-ar.bcvYCd/design-demos`; require 406 regular files and manifest `e33a60bc7c29daf8dd9a5971e9e90afe80ac580edcb0016501b91d4f96a4602b`. Second, overlay only missing ignored files from `/private/tmp/zxrubbertech-ar-scope-fixtures-20260821/inner` into `/private/tmp/zxrubbertech-ar.bcvYCd/zxrubbertech-website/design-demos`; before overlay every existing target file must exist and be byte-identical in the locked source, and afterward both trees must have 504 regular files and manifest `d57db817833fa62f85983716c0380559e2d3646e97b6dc310c01ecf7e8b80240`. Reject symlinks, special entries, target-only files, or byte differences. These inputs are ignored scope fixtures and must not change Git status or enter a commit. The stable source directory is retained through A10 and may not be cleaned by another workflow.

## Exact File Ownership

### Documentation seal

- Existing D0: `.claude/prds/v5-arabic-multilingual.md`
- Existing D0: `docs/superpowers/specs/2026-08-20-v5-arabic-multilingual-design.md`
- Create D1: `docs/superpowers/plans/2026-08-20-v5-arabic-multilingual.md`

### A0 scope hardening

- Modify: `scripts/check-v5-scope.mjs`
- Modify: `scripts/v5-protected-baseline.json`

### A1 registry

- Modify: `scripts/v5-i18n-config.mjs`
- Modify: `scripts/v5-language-controls.mjs`
- Modify: `scripts/check-v5-i18n.mjs`
- Modify: `scripts/check-v5-i18n-mutations.mjs`

### A2 terminology, Unicode, and RTL contract

- Modify: `scripts/v5-i18n/glossary.json`
- Modify: `scripts/v5-i18n-transform.mjs`
- Modify: `scripts/check-v5-i18n.mjs`
- Modify: `scripts/check-v5-i18n-mutations.mjs`

### A3/A4 catalog

- Create in isolated author worktree: `scripts/v5-i18n/ar.json`
- Import byte-identically into integration: `scripts/v5-i18n/ar.json`

### A5 release behavior

- Modify: `scripts/v5-i18n-transform.mjs`
- Modify: `scripts/check-v5-i18n.mjs`
- Modify: `scripts/check-v5-seo.mjs`
- Modify: `scripts/check-v5-acceptance.mjs`
- Modify: `scripts/check-v5-i18n-mutations.mjs`

### A6 release tooling

- Modify: `scripts/archive-v5.mjs`
- Modify: `scripts/build-v5-retirement.mjs`
- Modify: `scripts/check-v5-retirement.mjs`
- Modify: `scripts/check-v5-i18n-mutations.mjs`
- Modify: `scripts/check-v5-scope.mjs`

### A8 generated production output

- Regenerate: all existing 56 canonical production HTML files
- Create: seven canonical HTML files under `ar/`
- Regenerate: `sitemap.xml`
- Modify last: `scripts/v5-protected-baseline.json`

`scripts/build-v5-release.mjs`, `scripts/v5-seo-transform.mjs`, and `scripts/v5-retirement-map.mjs` remain byte-identical unless a documented HOLD proves the approved registry-driven contract cannot pass. A7, A9, and A10 produce no repository diff.

---

### Task 1: Commit D1 Plan and Seal A0 Baseline

**Files:**
- Create: `docs/superpowers/plans/2026-08-20-v5-arabic-multilingual.md`
- Create outside repository: `/tmp/zxrubbertech-ar-evidence-20260820/a0-baseline.json`

**Interfaces:**
- Consumes: code foundation `8d09537b6d810e03b7693b998dd624dce509b6e3`, D0 `a7d927a24e197a1fedf006253a9905aa6b8ddc04`, production `1e0c849355c7bf3774db565d6c7a10c01d3522eb`
- Produces: clean D1 plan commit and sealed Git, Pages, archive, dirty-main, CSV, checker, and immutable-file evidence

- [ ] **Step 1: Commit this plan as D1**

Run:

```bash
git add -- docs/superpowers/plans/2026-08-20-v5-arabic-multilingual.md
git diff --cached --check
test "$(git diff --cached --name-only)" = "docs/superpowers/plans/2026-08-20-v5-arabic-multilingual.md"
git commit -m "docs: plan Arabic V5 locale"
test "$(git rev-parse HEAD^)" = "a7d927a24e197a1fedf006253a9905aa6b8ddc04"
test -z "$(git status --porcelain=v1)"
```

- [ ] **Step 2: Prepare immutable external helpers and the locked scope input**

Create the evidence directory, create `publish-exclusive.mjs` once with `apply_patch` from the exact source in the global evidence contract, and verify its SHA. Copy the locked `design-demos` tree only if the destination is absent; destination existence with any other manifest is HOLD:

```bash
mkdir -p /tmp/zxrubbertech-ar-evidence-20260820
test "$(shasum -a 256 /tmp/zxrubbertech-ar-evidence-20260820/publish-exclusive.mjs | awk '{print $1}')" = "2d9e9908b47f7923151ceb4c6854f27cf739e574d241566645a40bf207409ca5"
LOCKED_SCOPE_SOURCE=/private/tmp/zxrubbertech-ar-scope-fixtures-20260821/outer
LOCKED_SCOPE_TARGET=/private/tmp/zxrubbertech-ar.bcvYCd/design-demos
test -d "$LOCKED_SCOPE_SOURCE"
test ! -L "$LOCKED_SCOPE_SOURCE"
test -z "$(find "$LOCKED_SCOPE_SOURCE" \( -type l -o ! -type d ! -type f \) -print -quit)"
test "$(find "$LOCKED_SCOPE_SOURCE" -type f | wc -l | tr -d ' ')" = "406"
test "$(cd "$LOCKED_SCOPE_SOURCE" && find . -type f -print0 | LC_ALL=C sort -z | xargs -0 shasum -a 256 | shasum -a 256 | awk '{print $1}')" = "e33a60bc7c29daf8dd9a5971e9e90afe80ac580edcb0016501b91d4f96a4602b"
test ! -L "$LOCKED_SCOPE_TARGET"
if test ! -e "$LOCKED_SCOPE_TARGET"; then
  cp -R "$LOCKED_SCOPE_SOURCE" "$LOCKED_SCOPE_TARGET"
fi
test -d "$LOCKED_SCOPE_TARGET"
test ! -L "$LOCKED_SCOPE_TARGET"
test -z "$(find /private/tmp/zxrubbertech-ar.bcvYCd/design-demos \( -type l -o ! -type d ! -type f \) -print -quit)"
test "$(find /private/tmp/zxrubbertech-ar.bcvYCd/design-demos -type f | wc -l | tr -d ' ')" = "406"
test "$(cd /private/tmp/zxrubbertech-ar.bcvYCd/design-demos && find . -type f -print0 | LC_ALL=C sort -z | xargs -0 shasum -a 256 | shasum -a 256 | awk '{print $1}')" = "e33a60bc7c29daf8dd9a5971e9e90afe80ac580edcb0016501b91d4f96a4602b"

LOCKED_INNER_SOURCE=/private/tmp/zxrubbertech-ar-scope-fixtures-20260821/inner
LOCKED_INNER_TARGET=/private/tmp/zxrubbertech-ar.bcvYCd/zxrubbertech-website/design-demos
test -d "$LOCKED_INNER_SOURCE"
test -d "$LOCKED_INNER_TARGET"
test ! -L "$LOCKED_INNER_SOURCE"
test ! -L "$LOCKED_INNER_TARGET"
test -z "$(find "$LOCKED_INNER_SOURCE" \( -type l -o ! -type d ! -type f \) -print -quit)"
test -z "$(find "$LOCKED_INNER_TARGET" \( -type l -o ! -type d ! -type f \) -print -quit)"
test "$(find "$LOCKED_INNER_SOURCE" -type f | wc -l | tr -d ' ')" = "504"
test "$(cd "$LOCKED_INNER_SOURCE" && find . -type f -print0 | LC_ALL=C sort -z | xargs -0 shasum -a 256 | shasum -a 256 | awk '{print $1}')" = "d57db817833fa62f85983716c0380559e2d3646e97b6dc310c01ecf7e8b80240"
while IFS= read -r -d '' INNER_TARGET_FILE; do
  INNER_RELATIVE=${INNER_TARGET_FILE#"$LOCKED_INNER_TARGET"/}
  test -f "$LOCKED_INNER_SOURCE/$INNER_RELATIVE"
  cmp "$LOCKED_INNER_SOURCE/$INNER_RELATIVE" "$INNER_TARGET_FILE"
done < <(find "$LOCKED_INNER_TARGET" -type f -print0)
cp -R "$LOCKED_INNER_SOURCE"/. "$LOCKED_INNER_TARGET"/
test -z "$(find "$LOCKED_INNER_TARGET" \( -type l -o ! -type d ! -type f \) -print -quit)"
test "$(find "$LOCKED_INNER_TARGET" -type f | wc -l | tr -d ' ')" = "504"
test "$(cd "$LOCKED_INNER_TARGET" && find . -type f -print0 | LC_ALL=C sort -z | xargs -0 shasum -a 256 | shasum -a 256 | awk '{print $1}')" = "d57db817833fa62f85983716c0380559e2d3646e97b6dc310c01ecf7e8b80240"
test -z "$(git status --porcelain=v1)"
```

- [ ] **Step 3: Seal production and integration identities**

Require:

```bash
git merge-base --is-ancestor 1e0c849355c7bf3774db565d6c7a10c01d3522eb HEAD
test "$(git rev-parse origin/main)" = "1e0c849355c7bf3774db565d6c7a10c01d3522eb"
test "$(git ls-remote origin refs/heads/main | awk '{print $1}')" = "1e0c849355c7bf3774db565d6c7a10c01d3522eb"
test "$(git rev-parse a7d927a24e197a1fedf006253a9905aa6b8ddc04^)" = "8d09537b6d810e03b7693b998dd624dce509b6e3"
test "$(git diff --name-only 8d09537b6d810e03b7693b998dd624dce509b6e3..HEAD | LC_ALL=C sort | tr '\n' ' ')" = ".claude/prds/v5-arabic-multilingual.md docs/superpowers/plans/2026-08-20-v5-arabic-multilingual.md docs/superpowers/specs/2026-08-20-v5-arabic-multilingual-design.md "
```

Read-only GitHub checks must confirm Pages run `31926986077` and latest Pages build still bind `1e0c849355c7bf3774db565d6c7a10c01d3522eb`.

- [ ] **Step 4: Recompute the untouched dirty-main seal**

Use a repository-external Node helper at `/tmp/zxrubbertech-ar-evidence-20260820/dirty-fingerprint.mjs`; create it once with `apply_patch` and store its SHA in `a0-baseline.json`. Its canonical algorithm is frozen as follows:

1. Run `git -C /Users/ren/Documents/zxrubbertech-website/zxrubbertech-website diff --binary` with raw stdout bytes; those bytes are the exact `.tracked.patch` output.
2. Run `git -C /Users/ren/Documents/zxrubbertech-website/zxrubbertech-website ls-files --others --exclude-standard -z`. Split only on NUL, reject an invalid UTF-8 path, sort paths with `Buffer.compare(Buffer.from(a), Buffer.from(b))`, reject anything not a regular file, and create each record as `{path,bytes,sha256}` from raw file bytes.
3. Serialize the untracked document as `JSON.stringify({version:1,files}, null, 2) + '\n'`; those bytes are the exact `.untracked.json` output.
4. Compute the two SHA-256 values. Serialize the fingerprint seed as `JSON.stringify({version:1,trackedPatchSha256,untrackedManifestSha256}, null, 2) + '\n'`; `fingerprintSha256` is the SHA-256 of those seed bytes.
5. Serialize `.fingerprint.json` as `JSON.stringify({version:1,trackedPatchSha256,untrackedManifestSha256,fingerprintSha256}, null, 2) + '\n'`.
6. Write the three outputs only with Node `flag:'wx'` to the exact prefix `/tmp/zxrubbertech-ar-evidence-20260820/a0-dirty-main`; any existing output is HOLD.
7. Require the three newly produced files to be byte-identical to `/tmp/zxrubbertech-ja-ko-fa-evidence-20260816/n9-recovered-current.tracked.patch`, `.untracked.json`, and `.fingerprint.json`, and require the canonical N10 report `/tmp/zxrubbertech-ja-ko-fa-evidence-20260816/n10-final-gatekeeper-evidence.json` SHA-256 to remain `3cbadbb38f41daac2291ef9234db4950f18fa0fff889ed9f712624686c0fceee`.

Require the previously sealed values:

```text
tracked patch SHA-256: 40bef901f6f614450c76dd470ef0a16b32d7d823fb185194b97820580ef5f802
untracked manifest SHA-256: eb27fd5f8127dbd939c42ed96b550be2c3c419b2e5bde4eff96d3d2e43d92be5
canonical dirty fingerprint: 96811a5ec4f8a86090d2d554b81cd51072aac3576d40355b1346244e0b7295c1
```

Do not stage, clean, reset, move, or delete anything in the dirty worktree.

- [ ] **Step 5: Run the current eight-language green suite**

Build to a fresh repository-external root, then require:

```bash
A0_RELEASE_PARENT=$(mktemp -d /tmp/zxrubbertech-ar-a0-release.XXXXXX)
A0_RELEASE_ROOT="$A0_RELEASE_PARENT/release"
node scripts/build-v5-release.mjs --output="$A0_RELEASE_ROOT"
node scripts/build-v5-retirement.mjs --root="$A0_RELEASE_ROOT"
node scripts/check-v5-scope.mjs
node scripts/check-v5-hybrid.mjs
node scripts/check-v5-seo.mjs --gate=all --profile=preview
node scripts/check-v5-i18n.mjs --gate=all --profile=preview
node scripts/check-v5-seo.mjs --gate=all --profile=release --root="$A0_RELEASE_ROOT"
node scripts/check-v5-i18n.mjs --gate=all --profile=release --root="$A0_RELEASE_ROOT"
node scripts/check-v5-retirement.mjs --root="$A0_RELEASE_ROOT"
git diff --check
```

Expected: scope 923; registry 8/7/56/9; release 56/504/56; retirement 56/25/25/50/56; release inventory 521; CSV SHA `8d17b3226a266ff4539cf9a6721e4854992121663aeebd60354b3e73cf76fb63`.

- [ ] **Step 6: Exclusive-create A0 evidence and obtain Gatekeeper PASS**

Create the evidence directory if absent:

```bash
mkdir -p /tmp/zxrubbertech-ar-evidence-20260820
```

Create `/tmp/zxrubbertech-ar-evidence-20260820/a0-baseline.json` with filesystem flag `wx`. It records D0/D1/code/production SHAs, Pages run/build, prior archive SHA `f18f084404c429f45e729faa582ce245447564415f366194fe6b8d8125e82efe`, all dirty seals, CSV seal, suite metrics, immutable hashes, `status: "PASS"`, and `failures: []`.

Gatekeeper independently recomputes the same data before releasing Task 2. Evidence targets must not be overwritten.

### Task 2: Harden Scope for All Existing English V5 Pages

**Files:**
- Modify: `scripts/check-v5-scope.mjs`
- Modify: `scripts/v5-protected-baseline.json`

**Interfaces:**
- Consumes: clean 923-entry production baseline
- Produces: clean 928-entry current-production baseline covering all 56 canonical pages

- [ ] **Step 1: Write the failing scope inventory test**

Add these exact production roots to `productionRoots` in `scripts/check-v5-scope.mjs`:

```js
'rubber-compounds', 'industries', 'capabilities', 'faq', 'quote'
```

Do not write the baseline yet.

- [ ] **Step 2: Run the old-baseline red check**

```bash
set -euo pipefail
SCOPE_RED_TMP=$(mktemp /tmp/zxrubbertech-ar-a0-scope-red.XXXXXX)
trap 'rm -f -- "$SCOPE_RED_TMP"' EXIT INT TERM
set +e
node scripts/check-v5-scope.mjs > "$SCOPE_RED_TMP"
SCOPE_RED_EXIT=$?
set -e
node /tmp/zxrubbertech-ar-evidence-20260820/publish-exclusive.mjs \
  "$SCOPE_RED_TMP" /tmp/zxrubbertech-ar-evidence-20260820/a0-scope-red.json
rm -f -- "$SCOPE_RED_TMP"
trap - EXIT INT TERM
test "$SCOPE_RED_EXIT" = "1"
```

Require `protectedFiles=928`, `modified=[]`, `missing=[]`, and exact `unexpected` paths:

```text
zxrubbertech-website/capabilities/index.html
zxrubbertech-website/faq/index.html
zxrubbertech-website/industries/index.html
zxrubbertech-website/quote/index.html
zxrubbertech-website/rubber-compounds/index.html
```

- [ ] **Step 3: Write and verify the hardened baseline**

```bash
ZX_V5_SCOPE_BASELINE_APPROVED=1 node scripts/check-v5-scope.mjs --write-baseline
node scripts/check-v5-scope.mjs
```

Compare old versus new baseline semantically: added=5, removed=0, hashChanged=0, unchanged=923. Recompute every stored path hash. Require final scope 928 with missing/modified/unexpected all zero.

- [ ] **Step 4: Commit and obtain A0-scope Gatekeeper PASS**

```bash
git add -- scripts/check-v5-scope.mjs scripts/v5-protected-baseline.json
git diff --cached --check
git commit -m "test: protect all English V5 pages"
test -z "$(git status --porcelain=v1)"
```

Gatekeeper independently verifies the exact two-file commit, 923→928 semantic delta, five exact roots, full A0 suite, remote/dirty seals, and creates `/tmp/zxrubbertech-ar-evidence-20260820/a0-scope-gatekeeper.json` with `wx`, SHA-256, PASS, and no failures.

### Task 3: Register Arabic and Establish the Missing-Catalog Red Gate

**Files:**
- Modify: `scripts/v5-i18n-config.mjs`
- Modify: `scripts/v5-language-controls.mjs`
- Modify: `scripts/check-v5-i18n.mjs`
- Modify: `scripts/check-v5-i18n-mutations.mjs`

**Interfaces:**
- Consumes: eight-locale registry and seven fixed page stems
- Produces: frozen ninth-locale identity and exact missing-`ar.json` red behavior

- [ ] **Step 1: Add the exact registry entry**

Append after `fa`:

```js
ar: Object.freeze({
  prefix: 'ar',
  htmlLang: 'ar',
  hreflang: 'ar',
  ogLocale: 'ar_SA',
  direction: 'rtl',
  label: 'العربية',
  shortLabel: 'AR',
  turnstileLanguage: 'ar',
}),
```

At the same time add exact `ar: 'اللغة'` to the frozen `V5_LANGUAGE_CONTROL_LABELS` in `scripts/v5-language-controls.mjs`. This is part of A1 because the transform imports language controls at module load and exact label/registry key parity must remain true. Update the checker's frozen expected locale order to exactly `en,de,zh-CN,ru,tr,ja,ko,fa,ar`. Do not change historical legacy locale sets.

- [ ] **Step 2: Run the intended red state**

```bash
set -euo pipefail
node scripts/check-v5-i18n.mjs --gate=registry --profile=preview
A1_RED_TMP=$(mktemp /tmp/zxrubbertech-ar-a1-missing-catalog.XXXXXX)
trap 'rm -f -- "$A1_RED_TMP"' EXIT INT TERM
set +e
node scripts/check-v5-i18n.mjs --gate=all --profile=preview > "$A1_RED_TMP"
A1_RED_EXIT=$?
set -e
node /tmp/zxrubbertech-ar-evidence-20260820/publish-exclusive.mjs \
  "$A1_RED_TMP" /tmp/zxrubbertech-ar-evidence-20260820/a1-missing-catalog-red.json
rm -f -- "$A1_RED_TMP"
trap - EXIT INT TERM
test "$A1_RED_EXIT" = "1"
```

Registry must report 9 locales, 7 roles, 63 routes, and 10 `hreflang` values. Full preview must fail only because `scripts/v5-i18n/ar.json` is missing.

- [ ] **Step 3: Extend and run registry mutations**

Add exact cases for unknown locale, duplicate prefix, duplicate `hreflang`, wrong `ar.direction`, wrong `ar.ogLocale`, wrong `x-default`, misordered registry, empty inventory, and malformed registry module. Each fixture must preserve all non-target metrics, exit nonzero with the named signal, and report `missingFileNoise=0`.

```bash
test ! -e /tmp/zxrubbertech-ar-evidence-20260820/a1-registry-mutations.json
node scripts/check-v5-i18n-mutations.mjs \
  --suite=registry \
  --report=/tmp/zxrubbertech-ar-evidence-20260820/a1-registry-mutations.json
```

- [ ] **Step 4: Commit and obtain A1 Gatekeeper PASS**

```bash
git add -- scripts/v5-i18n-config.mjs scripts/v5-language-controls.mjs \
  scripts/check-v5-i18n.mjs scripts/check-v5-i18n-mutations.mjs
git diff --cached --check
test "$(git diff --cached --name-only | LC_ALL=C sort | tr '\n' ' ')" = "scripts/check-v5-i18n-mutations.mjs scripts/check-v5-i18n.mjs scripts/v5-i18n-config.mjs scripts/v5-language-controls.mjs "
git commit -m "feat: define Arabic V5 locale contract"
```

Gatekeeper verifies the exact four-file allowlist, registry 9/7/63/10, exact `اللغة` control label, expected missing-catalog red state with no label-contract noise, all registry mutations, unchanged existing eight catalogs, scope 928, clean status, remote seal, and dirty-main seal.

### Task 4: Freeze Arabic Terminology, Unicode, Facts, and Shared RTL Contract

**Files:**
- Modify: `scripts/v5-i18n/glossary.json`
- Modify: `scripts/v5-i18n-transform.mjs`
- Modify: `scripts/check-v5-i18n.mjs`
- Modify: `scripts/check-v5-i18n-mutations.mjs`
- Create outside repository: terminology proposal and review evidence

**Interfaces:**
- Consumes: English 531-key catalog, 508 operations, 12 glossary terms, five verified facts, and Persian RTL implementation
- Produces: reviewed Arabic term/fact definitions, distinct Arabic character validator, and registry-driven shared RTL transform

- [ ] **Step 1: Dispatch an Arabic terminology author**

The author is read-only with respect to the repository and exclusive-creates `/tmp/zxrubbertech-ar-evidence-20260820/ar-terminology-proposal.json`. The proposal must contain these exact 12 values:

```text
rubber compound = خلطة مطاطية
molded rubber parts = أجزاء مطاطية مقولبة
rubber-to-metal bonding = ربط المطاط بالمعدن
compression molding = القولبة بالضغط
injection molding = القولبة بالحقن
extrusion = البثق
tooling = القوالب وأدوات الإنتاج
traceability = قابلية التتبع
batch release = اعتماد الدفعة الإنتاجية
drawing = رسم فني
sample = عينة
project requirements = متطلبات المشروع
```

It also contains the five exact renderings and occurrence contract:

```text
annualCompoundCapacity = حوالي ٣٬٠٠٠ طن متري (1)
annualMoldedComponents = أكثر من ١٥ مليون قطعة مطاطية مقولبة في السنة (1)
inquiryAcknowledgement = خلال ٢٤ ساعة (4)
regularCompoundMoq = ٢ طن متري (1)
quotationWindow = من ٢ إلى ٧ أيام عمل (1)
```

- [ ] **Step 2: Obtain independent terminology Reviewer PASS**

A non-author Reviewer checks industrial meaning, MSA naturalness, numbers, units, approximation, “more than”, quality-release semantics, and the 24-hour acknowledgement boundary. It exclusive-creates `/tmp/zxrubbertech-ar-evidence-20260820/ar-terminology-review.json`, binds the proposal SHA, and reports PASS with no failures.

- [ ] **Step 3: Add the approved glossary values serially**

The primary Agent adds only `ar` values under the existing 12 terms and five verified-fact rendering keys. Existing locale values, source facts, and `preservedLiterals` remain byte-equivalent after JSON semantic comparison.

- [ ] **Step 4: Write Arabic Unicode and script validation**

Implement a distinct `validateArabicCatalog` path. It requires valid UTF-8, no BOM, NFC, Arabic-script prose, Arabic Yeh `ي`, Arabic Kaf `ك`, and Arabic-Indic fact digits. It rejects:

```text
Persian Yeh ی and Persian Kaf ک
Persian letters پ چ ژ گ
Persian digits ۰۱۲۳۴۵۶۷۸۹
Arabic presentation forms U+FB50–U+FDFF and U+FE70–U+FEFF
U+061C, U+200E, U+200F
U+202A–U+202E, U+2066–U+2069
ZWJ U+200D, ZWNJ U+200C, tatweel U+0640
Han, Hiragana, Katakana, Hangul, or Cyrillic residue
unapproved English residue
```

Extend normalization checks to `ar`. Do not weaken Persian-specific `ی/ک`, Persian digits, or ZWNJ rules.

- [ ] **Step 5: Refactor Persian-only directionality into a shared RTL transform**

Select RTL behavior from `V5_LOCALES[locale].direction === 'rtl'`. Rename exported constants and markers to locale-neutral RTL names. Both `fa` and `ar` receive one scoped RTL style block and semantic `<bdi dir="ltr">` wrappers around the existing approved technical literals. Quote directions remain name/company/message=`auto`, email/phone=`ltr`, with no `dirname`.

The transform must reject duplicate markers, nested/unapproved `<bdi>`, hidden bidi controls, and media/logo/map/decorative-geometry selectors or mirror transforms.

- [ ] **Step 6: Register deferred catalog mutations and run eight-locale regressions**

Register distinct cases for each prohibited Arabic character/control class, facts, glossary terms, protected literals, BOM, fatal UTF-8, missing/duplicate key, and English residue. Full execution is deferred until `ar.json` exists in Task 6.

Run:

```bash
node --check scripts/v5-i18n-transform.mjs
node --check scripts/check-v5-i18n.mjs
node --check scripts/check-v5-i18n-mutations.mjs
for locale in en de zh-CN ru tr ja ko fa; do
  node scripts/check-v5-i18n.mjs --gate=catalog --profile=preview --locale="$locale"
done
```

- [ ] **Step 7: Commit and obtain A2 Gatekeeper PASS**

```bash
git add -- scripts/v5-i18n/glossary.json scripts/v5-i18n-transform.mjs \
  scripts/check-v5-i18n.mjs scripts/check-v5-i18n-mutations.mjs
git diff --cached --check
git commit -m "feat: enforce Arabic V5 language quality"
```

Gatekeeper verifies exact file ownership, proposal/Reviewer hashes, term/fact exactness, separate Arabic/Persian contracts, shared RTL positive and negative fixtures, existing eight-locale catalog regressions, remote/dirty seals, and clean status.

### Task 5: Create and Independently Review the Arabic Catalog

**Files:**
- Create in isolated author worktree: `scripts/v5-i18n/ar.json`
- Create outside repository: author checker evidence and independent Reviewer evidence

**Interfaces:**
- Consumes: frozen A2 foundation, English key order, reviewed terminology, facts, literals, and operations
- Produces: one one-file Arabic catalog commit approved for byte-identical import

- [ ] **Step 1: Create the isolated catalog worktree**

```bash
AR_FOUNDATION=$(git rev-parse HEAD)
AR_PARENT=$(mktemp -d /private/tmp/zxrubbertech-v5-ar-catalog.XXXXXX)
AR_WORKTREE="$AR_PARENT/zxrubbertech-website"
git worktree add -b v5-ar-catalog-20260820 "$AR_WORKTREE" "$AR_FOUNDATION"
test "$(git -C "$AR_WORKTREE" rev-parse HEAD)" = "$AR_FOUNDATION"
test -z "$(git -C "$AR_WORKTREE" status --porcelain=v1)"
```

- [ ] **Step 2: Assign the author an exact one-file boundary**

The Arabic author may create only `scripts/v5-i18n/ar.json`. It may not edit glossary, config, checkers, HTML, sitemap, media, another catalog, or shared files. Unreviewed drafts remain only in this isolated worktree and preview/noindex fixtures.

- [ ] **Step 3: Produce and check the complete catalog**

The catalog must match English object/key order exactly: meta, shared, seven pages, seven SEO groups, and runtime. It must satisfy 531 keys, 508 operations, 12 terms, five facts with `1/1/4/1/1` occurrences, 19 literals with 57 total occurrences, and all Arabic language rules.

Run in the author worktree:

```bash
set -euo pipefail
AR_CHECK_TMP=$(mktemp /tmp/zxrubbertech-ar-catalog-check.XXXXXX)
trap 'rm -f -- "$AR_CHECK_TMP"' EXIT INT TERM
node scripts/check-v5-i18n.mjs --gate=catalog --profile=preview --locale=ar > "$AR_CHECK_TMP"
node /tmp/zxrubbertech-ar-evidence-20260820/publish-exclusive.mjs \
  "$AR_CHECK_TMP" /tmp/zxrubbertech-ar-evidence-20260820/ar-catalog-check.json
rm -f -- "$AR_CHECK_TMP"
trap - EXIT INT TERM
git diff --check
git add -- scripts/v5-i18n/ar.json
git diff --cached --check
git commit -m "feat: add Arabic V5 catalog"
```

The author returns commit, direct parent, catalog SHA-256, checker report SHA-256, exact one-file diff, and clean status.

- [ ] **Step 4: Perform full independent Arabic review**

A non-author language Reviewer reads all 531 values and checks MSA naturalness, industrial terminology, facts, quality-release meaning, SEO title/description/breadcrumb, ARIA, placeholders, Quote runtime, validation messages, privacy text, address, mixed-direction values, and absence of dialect or machine phrasing.

FAIL returns precise catalog keys and suggested corrections to the author. PASS exclusive-creates `/tmp/zxrubbertech-ar-evidence-20260820/ar-catalog-review.json`; it binds foundation, author commit, parent, catalog SHA, checker SHA, Reviewer identity, `status: "PASS"`, and `failures: []`.

- [ ] **Step 5: Amend only the author commit until Reviewer PASS**

Corrections modify only `ar.json`, rerun the full catalog checker, produce a new exclusive evidence path with a revision suffix, and amend the author commit while preserving the same foundation parent. Old FAIL reports remain immutable.

### Task 6: Import Arabic and Execute the Complete Catalog Mutation Gate

**Files:**
- Create in integration: `scripts/v5-i18n/ar.json`

**Interfaces:**
- Consumes: independent Arabic Reviewer PASS report
- Produces: byte-identical reviewed catalog in integration and full catalog mutation evidence

- [ ] **Step 1: Verify the author commit and import without rewriting**

Require one changed path, direct parent equal to the A2 foundation, and hashes equal to Reviewer evidence. Then:

```bash
AR_COMMIT=$(jq -r .commit /tmp/zxrubbertech-ar-evidence-20260820/ar-catalog-review.json)
git cherry-pick "$AR_COMMIT"
test "$(shasum -a 256 scripts/v5-i18n/ar.json | awk '{print $1}')" = "$(jq -r .catalogSha256 /tmp/zxrubbertech-ar-evidence-20260820/ar-catalog-review.json)"
```

Any conflict is HOLD; do not resolve or rewrite it manually.

- [ ] **Step 2: Run all nine catalog gates**

```bash
for locale in en de zh-CN ru tr ja ko fa ar; do
  node scripts/check-v5-i18n.mjs --gate=catalog --profile=preview --locale="$locale"
done
```

Require each catalog to report 531 keys and 508 operations. Existing eight catalog file hashes must equal A0.

- [ ] **Step 3: Run every catalog mutation**

```bash
test ! -e /tmp/zxrubbertech-ar-evidence-20260820/a4-catalog-mutations.json
node scripts/check-v5-i18n-mutations.mjs \
  --suite=catalog \
  --report=/tmp/zxrubbertech-ar-evidence-20260820/a4-catalog-mutations.json
```

Every case exits 1, names the exact locale/key/expected/actual signal, preserves green metrics, and has `missingFileNoise=0`. Raw invalid UTF-8 and BOM cases must reach the strict catalog reader rather than generic malformed-JSON preflight.

- [ ] **Step 4: Obtain A3/A4 Gatekeeper PASS**

Gatekeeper verifies common foundation, exact one-file author/import diffs, byte identity, full Reviewer report, 531/508/12/5/19 metrics, all Arabic mutation classes, old eight catalog hashes, clean integration, remote/dirty seals, and exclusive evidence hashes.

### Task 7: Integrate Controls, SEO, Form, Shared RTL, and Acceptance Schema

**Files:**
- Modify: `scripts/v5-i18n-transform.mjs`
- Modify: `scripts/check-v5-i18n.mjs`
- Modify: `scripts/check-v5-seo.mjs`
- Modify: `scripts/check-v5-acceptance.mjs`
- Modify: `scripts/check-v5-i18n-mutations.mjs`

**Interfaces:**
- Consumes: nine-locale registry and reviewed Arabic catalog
- Produces: temporary nine-language release pages and fail-closed release/acceptance checks

- [ ] **Step 1: Regress the already-registered localized control label**

Require the A1 `ar: 'اللغة'` label to remain byte-identical and confirm every page has three groups × nine real same-role links, 27 anchors per page, registry order, and one exact `aria-current` per group. Do not edit `scripts/v5-language-controls.mjs` in A5.

- [ ] **Step 2: Generalize RTL checks without weakening Persian**

Update i18n, SEO, and acceptance checks to require RTL for both `fa` and `ar`, zero RTL markers on LTR locales, approved locale-specific `<bdi dir="ltr">` content only, logical CSS, no hidden controls, and no media/logo/map/decorative-geometry mirroring. Add a release mutation that reflects an approved decorative selector and require a precise failure; do not allow reflection matrices, `scaleX(-1)`, or locale-specific decorative exceptions.

Report exact per-locale RTL metrics:

```json
{
  "persianRtlViewportChecks": 14,
  "arabicRtlViewportChecks": 14,
  "rtlViewportChecks": 28
}
```

- [ ] **Step 3: Generalize SEO and structure validation**

Require each release page to have self canonical, ten exact reciprocal `hreflang` mappings, eight unique OG alternates, localized title/description/breadcrumb, exact `lang/dir`, same-language internal links, approved schema, and invariant media hashes. Structure normalization may remove only exact approved RTL `<bdi dir="ltr">literal</bdi>` wrappers for `fa` and `ar`; arbitrary `<bdi>` or extra DOM remains a failure.

- [ ] **Step 4: Validate all nine Quote workflows**

Require nine exact Formspree targets, nine Site Keys/widgets, nine hidden locale values, correct Turnstile languages, and 126 localized runtime-message checks. Keep the acceptance interface exact: `interactionEvidence.quoteValidation` is an ordered nine-record array in locale order `en,de,zh-CN,ru,tr,ja,ko,fa,ar`; every record contains exact `locale`, `ok:true`, `empty`, `badEmail`, and `withoutTurnstile` objects. The Arabic record additionally proves hidden locale `ar`, Turnstile language `ar`, name/company/message=`auto`, email/phone=`ltr`, no `dirname`, and exact Formspree action. Do not invent a `formEvidence` or 126-record acceptance array. The 126 runtime messages are instead verified by the release i18n form gate's exact ordered key/result inventory and bound into archive preflight evidence. Existing IDs and backend fields remain exact.

- [ ] **Step 5: Preserve the accepted lazy-image failure contract**

The committed 45-second concurrent image wait from `8d09537b6d810e03b7693b998dd624dce509b6e3` must remain present. Listeners attach before eager/high triggering; error/timeout/naturalWidth=0 remain failures; no asset allowlist, scroll workaround, or HTTP substitute is introduced.

- [ ] **Step 6: Build a repository-external release and run release mutations**

```bash
A5_RELEASE_PARENT=$(mktemp -d /tmp/zxrubbertech-v5-ar-a5-release.XXXXXX)
A5_RELEASE_ROOT="$A5_RELEASE_PARENT/release"
node scripts/build-v5-release.mjs --output="$A5_RELEASE_ROOT"
node scripts/check-v5-i18n.mjs --gate=release --profile=release --root="$A5_RELEASE_ROOT"
node scripts/check-v5-i18n.mjs --gate=form --profile=release --root="$A5_RELEASE_ROOT"
node scripts/check-v5-seo.mjs --gate=all --profile=release --root="$A5_RELEASE_ROOT"
test ! -e /tmp/zxrubbertech-ar-evidence-20260820/a5-release-mutations.json
node scripts/check-v5-i18n-mutations.mjs \
  --suite=release \
  --root="$A5_RELEASE_ROOT" \
  --report=/tmp/zxrubbertech-ar-evidence-20260820/a5-release-mutations.json
```

Require release 9/63/630/63, controls 27 anchors/page, form 9/126/real0, SEO 63/630/63, and precise failures for anchor, `aria-current`, canonical, `hreflang`, `dir`, RTL wrapper, media mirror, Turnstile, hidden locale, Formspree, Site Key, backend fields, English internal link, and extra DOM mutations. Every fixture retains 63 canonical pages and `missingFileNoise=0`.

- [ ] **Step 7: Commit and obtain A5 Gatekeeper PASS**

```bash
git add -- scripts/v5-i18n-transform.mjs scripts/check-v5-i18n.mjs scripts/check-v5-seo.mjs \
  scripts/check-v5-acceptance.mjs scripts/check-v5-i18n-mutations.mjs
git diff --cached --check
test "$(git diff --cached --name-only | LC_ALL=C sort | tr '\n' ' ')" = "scripts/check-v5-acceptance.mjs scripts/check-v5-i18n-mutations.mjs scripts/check-v5-i18n.mjs scripts/check-v5-seo.mjs scripts/v5-i18n-transform.mjs "
git commit -m "feat: integrate Arabic V5 release behavior"
```

Gatekeeper independently rebuilds, reruns all release mutations, verifies exact file ownership, 9/63/630/63, controls 27/page, form 9/126, RTL fa/ar, lazy-image behavior, immutable services/media/catalogs, scope 928, remote/dirty seals, and clean status.

### Task 8: Generalize Retirement, Archive, Mutation, and Scope Tooling

**Files:**
- Modify: `scripts/archive-v5.mjs`
- Modify: `scripts/build-v5-retirement.mjs`
- Modify: `scripts/check-v5-retirement.mjs`
- Modify: `scripts/check-v5-i18n-mutations.mjs`
- Modify: `scripts/check-v5-scope.mjs`

**Interfaces:**
- Consumes: complete 63-page release
- Produces: deterministic 528-file bundle, fixed historical redirect boundary, new archive schema, and deferred Arabic scope root

- [ ] **Step 1: Require complete nine-locale release input**

Full retirement/archive accepts only exact locale order `en,de,zh-CN,ru,tr,ja,ko,fa,ar`, 63 page records, 630 `hreflang` links, and 63 sitemap URLs. Single `--locale=ar` output remains valid only for catalog QA and must be rejected before retirement/archive writes.

- [ ] **Step 2: Preserve the historical redirect matrix**

Retirement accepts 63 current V5 URLs but keeps exact legacy locales `en,de,zh-CN,ru,tr`, 25 fallback pages, two hosts, and 50 CSV rows. `ja`, `ko`, `fa`, and `ar` have zero legacy fallback pages. CSV bytes, order, final LF, and SHA remain unchanged.

- [ ] **Step 3: Update the archive contract exactly**

Set package identity `zxrubbertech-v5-ar-release-candidate-2026-08-20-rc1` and rollback `1e0c849355c7bf3774db565d6c7a10c01d3522eb`. Add `scripts/check-v5-acceptance.mjs` to `archive-v5.mjs`'s exact required source inventory so the archive preserves the actual 45-second image-wait harness that produced the report. Require nine exact catalogs, 63 page records, 630 `hreflang`, 63 sitemap URLs, 528 release files, 88/88 HTTP, 126/126 browser, Persian14, Arabic14, RTL28, `interactionEvidence.quoteValidation` as the exact ordered nine-record locale array defined in A5, exact Arabic hidden locale/Turnstile/input-direction fields, `clickPaths.arabicFocusOrder=true`, `formspreeAttemptedPostRequests=0`, `formspreePostRequests=0`, `realSubmissions=0`, `formspreeInterceptedUrls=[]`, and 25/50 historical inventory. Archive preflight must independently rerun the release i18n form gate and bind its exact Quote-pages9/runtime-messages126 result under `preflightChecks.releaseI18n.form`, rather than introducing an acceptance runtime array. The deployment manifest must persist Quote pages9, runtime messages126, all RTL/browser/HTTP counts, and zero/empty Formspree evidence, not only the acceptance report SHA.

The accepted release-manifest serialization remains LC_ALL=C sorted POSIX paths with lines `<sha256>  ./<path>\n` and a final LF.

- [ ] **Step 4: Add Arabic to future scope roots without writing the baseline**

Add only `ar` to `productionRoots`. Since `ar/` does not yet exist, scope continues to pass at 928. Do not modify `scripts/v5-protected-baseline.json` in this task.

- [ ] **Step 5: Run deterministic double builds**

```bash
RELEASE_A=$(mktemp -d /tmp/zxrubbertech-v5-ar-a.XXXXXX)
RELEASE_B=$(mktemp -d /tmp/zxrubbertech-v5-ar-b.XXXXXX)
node scripts/build-v5-release.mjs --output="$RELEASE_A"
node scripts/build-v5-retirement.mjs --root="$RELEASE_A"
node scripts/build-v5-release.mjs --output="$RELEASE_B"
node scripts/build-v5-retirement.mjs --root="$RELEASE_B"
```

Generate exact sorted path/hash manifests, require `528` lines for each, compare manifests byte-for-byte, and require `diff -qr` empty. Decomposition is exact:

```text
63 canonical HTML
25 fallback HTML
435 media
1 Logo
1 sitemap
1 robots
1 release report
1 Cloudflare CSV
= 528 files
```

- [ ] **Step 6: Run retirement and archive mutations**

```bash
test ! -e /tmp/zxrubbertech-ar-evidence-20260820/a6-retirement-mutations.json
test ! -e /tmp/zxrubbertech-ar-evidence-20260820/a6-archive-mutations.json
node scripts/check-v5-i18n-mutations.mjs \
  --suite=retirement --root="$RELEASE_A" \
  --report=/tmp/zxrubbertech-ar-evidence-20260820/a6-retirement-mutations.json
node scripts/check-v5-i18n-mutations.mjs \
  --suite=archive --root="$RELEASE_A" \
  --report=/tmp/zxrubbertech-ar-evidence-20260820/a6-archive-mutations.json
```

Mutations must reject Arabic legacy fallback/CSV entries, changed fallback targets/count, any CSV byte/order/newline change, single-locale input, old 56-page/504-hreflang/81-HTTP/112-browser/14-RTL schema fields independently, missing Arabic RTL count or wrong Arabic exact 14-key order, false `clickPaths.arabicFocusOrder`, delete-one/duplicate-one/reordered/wrong-Arabic records in the 126-browser array or ordered nine-record `interactionEvidence.quoteValidation`, wrong/missing `preflightChecks.releaseI18n.form` Quote-pages9/runtime-messages126 evidence, wrong package, wrong rollback, manifest drift, extra file, symlink, or special file. Complete green fixtures report 63/25/25/50/63 and `missingFileNoise=0`.

- [ ] **Step 7: Commit and obtain A6 Gatekeeper PASS**

```bash
git add -- scripts/archive-v5.mjs scripts/build-v5-retirement.mjs \
  scripts/check-v5-retirement.mjs scripts/check-v5-i18n-mutations.mjs \
  scripts/check-v5-scope.mjs
git diff --cached --check
git commit -m "build: generalize V5 release for Arabic"
```

Gatekeeper independently verifies exact ownership, complete-versus-single behavior, byte-identical 528-file builds, 63 current URLs, fixed 25/50 legacy inventory, CSV/robots/media exactness, scope 928, archive identity/rollback, all mutations, remote/dirty seals, and clean status.

### Task 9: Run Full Local HTTP and Chromium Acceptance

**Files:**
- No repository changes
- Create outside repository: final release, manifests, acceptance JSON, screenshots, browser logs, and Reviewer/Gatekeeper evidence

**Interfaces:**
- Consumes: clean A6 commit and deterministic release
- Produces: accepted 528-file release and local acceptance report binding 88 HTTP routes and 126 canonical viewport checks

- [ ] **Step 1: Rebuild the final release twice**

Use fresh external roots, run full release plus retirement, and require both 528-file manifests to match the A6 contract. Select one immutable root as `ACCEPTED_RELEASE_ROOT`; record its manifest SHA-256.

- [ ] **Step 2: Run the committed acceptance harness**

```bash
ACCEPTANCE_REPORT=/tmp/zxrubbertech-ar-evidence-20260820/a7-local-acceptance.json
test ! -e "$ACCEPTANCE_REPORT"
node scripts/check-v5-acceptance.mjs \
  --root="$ACCEPTED_RELEASE_ROOT" \
  --output="$ACCEPTANCE_REPORT" \
  --browser="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

Local HTTP results are exact ordered 63 canonical plus 25 fallback routes, all status 200; local redirect rows equal zero. Browser results are exact ordered 63 pages × `1280x900,390x844` =126 unique checks.

- [ ] **Step 3: Require every page invariant**

Each browser record has one H1, zero horizontal/local overflow, zero broken images, zero failed videos, zero migration console errors, three control groups × nine links, one current locale per group, exact self canonical, exact ten-key `hreflang` mapping, correct `lang/dir`, same-locale internal navigation, and no media/logo/map/decorative-geometry reflection.

- [ ] **Step 4: Require interaction, RTL, and form evidence**

For each of the seven page roles, start on English and use real CDP mouse/keyboard input to activate exact `a[data-locale="ar"]`; require a trusted click, same-role Arabic pathname, and `html lang="ar"`. Also exercise products/compounds fragments, Quote industry/contact, mobile fragments, Email, WhatsApp, map, Tab/Arrow/Escape, Persian focus order, and Arabic focus order. The exact `clickPaths` schema requires `samePageLanguageRoles=7` and `arabicFocusOrder=true`; report mutations must reject a false value, a missing role, or a switch that still targets `ja`.

Test `fa` and `ar` at both viewports for exact RTL layout, mixed-direction literals, form fields, numbers, punctuation, no mirrored media, and no mirrored map. Require Persian14, Arabic14, total RTL28.

Validate all nine Quote pages without solving Turnstile or submitting. Require `interactionEvidence.quoteValidation` to be exact ordered unique locale records `en,de,zh-CN,ru,tr,ja,ko,fa,ar`, each `ok:true` with the A5 field schema, localized required/email/verification messages, hidden locale, Turnstile language, preserved values, `formspreeAttemptedPostRequests=0`, `formspreePostRequests=0`, `realSubmissions=0`, and `formspreeInterceptedUrls=[]`. Separately rerun the release i18n form gate and bind its exact Quote-pages9/runtime-messages126 result; do not duplicate those 126 messages into the acceptance JSON.

- [ ] **Step 5: Prove the image wait remains fail closed**

Run a repository-external fixture containing a delayed valid lazy image, an HTTP-200 corrupt image, and a 404 image. The delayed valid image passes; corrupt and 404 images fail and appear in `brokenImages`. No source exception is allowed.

- [ ] **Step 6: Obtain independent Reviewer and Gatekeeper PASS**

Reviewer rebuilds expected 88/126/28 ordered key sets from registry and retirement map, checks the report and representative Arabic/Persian Products+Quote desktop/mobile pages, and validates Formspree interception logs. Gatekeeper independently reruns the full harness from a fresh 528-file release.

Both create separate `wx` reports under `/tmp/zxrubbertech-ar-evidence-20260820/`, bind the acceptance/report/manifest/harness SHAs, report PASS with no failures, and leave no browser/server/profile processes.

### Task 10: Materialize 63 Pages, Rebuild Scope, and Create the Candidate

**Files:**
- Regenerate: 56 existing canonical production HTML files
- Create: seven `ar` canonical production HTML files
- Regenerate: `sitemap.xml`
- Modify: `scripts/v5-protected-baseline.json`

**Interfaces:**
- Consumes: accepted 528-file release and local acceptance PASS
- Produces: atomic 65-path materialization commit and clean deployment candidate

- [ ] **Step 1: Copy only accepted generated outputs**

Freeze the exact locale-ID→directory map as `en→""`, `de→de`, `zh-CN→zh`, `ru→ru`, `tr→tr`, `ja→ja`, `ko→ko`, `fa→fa`, `ar→ar`, and page-file order as `index.html`, `products/index.html`, `rubber-compounds/index.html`, `industries/index.html`, `capabilities/index.html`, `faq/index.html`, `quote/index.html`. A repository-external Node copier must derive a 63-record ordered manifest from those two arrays, append exactly one `sitemap.xml` record, reject duplicate/absolute/escaping paths and symlinks, verify each source against the accepted release page record or sitemap SHA, create parent directories, and copy exactly those 64 outputs with `copyFileSync`.

It exclusive-creates `/tmp/zxrubbertech-ar-evidence-20260820/a8-materialization-manifest.json` with exact top-level shape `{status:"PASS",files:[...],failures:[]}`. `files.length` is 64; every target is a unique repository-relative POSIX path. Page records use `{kind:"page",locale,prefix,pageFile,source,target,sha256}`. The single final sitemap record uses `{kind:"sitemap",locale:null,prefix:null,pageFile:"sitemap.xml",source:"$ACCEPTED_RELEASE_ROOT/sitemap.xml",target:"sitemap.xml",sha256}`, with the environment variable resolved to its absolute real path before serialization. `source` is always an absolute regular file under the accepted external release; `target` is never absolute and never contains `..`.

The mapping deliberately writes English at repository root and maps registry ID `zh-CN` to directory `zh`; it must never create `/en/` or `/zh-CN/`. Do not copy report, fallback, CSV, robots, media, screenshots, or evidence.

After copying, compare every repository target byte-for-byte with the accepted release and its page record SHA.

- [ ] **Step 2: Prove the 928 baseline red state**

```bash
set -euo pipefail
A8_SCOPE_TMP=$(mktemp /tmp/zxrubbertech-ar-a8-scope-red.XXXXXX)
trap 'rm -f -- "$A8_SCOPE_TMP"' EXIT INT TERM
set +e
node scripts/check-v5-scope.mjs > "$A8_SCOPE_TMP"
A8_SCOPE_EXIT=$?
set -e
node /tmp/zxrubbertech-ar-evidence-20260820/publish-exclusive.mjs \
  "$A8_SCOPE_TMP" /tmp/zxrubbertech-ar-evidence-20260820/a8-scope-red.json
rm -f -- "$A8_SCOPE_TMP"
trap - EXIT INT TERM
test "$A8_SCOPE_EXIT" = "1"
```

Require `protectedFiles=935`, exact `unexpected=7` for the Arabic routes, exact `modified=57` for all existing 56 canonical HTML files plus `sitemap.xml`, and `missing=0`.

- [ ] **Step 3: Write and verify the final 935 baseline**

```bash
ZX_V5_SCOPE_BASELINE_APPROVED=1 node scripts/check-v5-scope.mjs --write-baseline
node scripts/check-v5-scope.mjs
```

Semantic baseline delta from A0-hardened 928 is added=7, removed=0, hashChanged=57, unchanged=871. Recompute every path/hash and require byte-deterministic serialization.

- [ ] **Step 4: Run the complete final suite**

```bash
node scripts/check-v5-scope.mjs
node scripts/check-v5-hybrid.mjs
node scripts/check-v5-seo.mjs --gate=all --profile=preview
node scripts/check-v5-i18n.mjs --gate=all --profile=preview
node scripts/check-v5-seo.mjs --gate=all --profile=release --root="$ACCEPTED_RELEASE_ROOT"
node scripts/check-v5-i18n.mjs --gate=all --profile=release --root="$ACCEPTED_RELEASE_ROOT"
node scripts/check-v5-retirement.mjs --root="$ACCEPTED_RELEASE_ROOT"
node --check scripts/v5-i18n-config.mjs
node --check scripts/v5-i18n-transform.mjs
node --check scripts/check-v5-i18n.mjs
node --check scripts/check-v5-seo.mjs
node --check scripts/check-v5-acceptance.mjs
node --check scripts/archive-v5.mjs
git diff --check
```

Expected: scope935; hybrid7/8; registry9/7/63/10; release9/63/630/63; retirement63/25/25/50/63; acceptance88/126/28/Post0.

- [ ] **Step 5: Verify immutable and full-index boundaries**

Require existing eight catalog hashes, `v5-i18n-baseline.json`, `v5-i18n-operations.mjs`, seven accepted V5 design inputs, 25 fallback pages, CSV, robots, media435, Logo, map, contacts, company facts, Formspree endpoint, Site Key, and backend fields to match A0 or approved source-only changes exactly.

Build an exact candidate path allowlist from D0/D1, A0–A6 commits, and the 65 A8 paths. Compare ordered name-status and full binary diff hashes. Any extra path is HOLD.

- [ ] **Step 6: Commit the materialization atomically**

Stage only the 64 output targets from the exclusive manifest plus `scripts/v5-protected-baseline.json`; require 65 staged paths and `git diff --cached --check`:

```bash
jq -j '.files[] | .target, "\u0000"' /tmp/zxrubbertech-ar-evidence-20260820/a8-materialization-manifest.json | xargs -0 git add --
git add -- scripts/v5-protected-baseline.json
test "$(git diff --cached --name-only | wc -l | tr -d ' ')" = "65"
git diff --cached --check
git commit -m "feat: add Arabic V5 locale"
test -z "$(git status --porcelain=v1)"
```

Record candidate, direct parent, production ancestor, A8 diff hash, full-index diff hash, allowlist hash, acceptance hash, release manifest hash, and clean status in exclusive candidate evidence. Independent Reviewer and Gatekeeper must both PASS before archive creation.

### Task 11: Archive, Non-Force Push, Pages Verification, and Production Acceptance

**Files:**
- No repository changes
- Create outside repository: exact ZIP, sidecar, extraction, deployment evidence, production report, Reviewer and Gatekeeper evidence

**Interfaces:**
- Consumes: clean accepted candidate, 528-file release, local acceptance PASS
- Produces: verified archive and exact GitHub Pages deployment

- [ ] **Step 1: Create the exact archive without overwrite**

```bash
ARCHIVE_PATH=/Users/ren/Documents/zxrubbertech-website/存档/zxrubbertech-v5-ar-release-candidate-2026-08-20-rc1.zip
SIDECAR_PATH=/Users/ren/Documents/zxrubbertech-website/存档/zxrubbertech-v5-ar-release-candidate-2026-08-20-rc1.zip.sha256
test ! -e "$ARCHIVE_PATH"
test ! -e "$SIDECAR_PATH"
node scripts/archive-v5.mjs \
  --release-root "$ACCEPTED_RELEASE_ROOT" \
  --acceptance-report "$ACCEPTANCE_REPORT" \
  --archive-path "$ARCHIVE_PATH"
```

Verify sidecar, unzip to a new external directory, validate no duplicate/traversal/link/special entries, verify every internal `SHA256SUMS` entry and coverage, and prove the archived release subtree is byte-identical to all 528 accepted files. Do not overwrite, delete, or rename to `rc2`.

- [ ] **Step 2: Obtain archive Reviewer and predeploy Gatekeeper PASS**

Reviewer independently validates candidate ancestry, exact full diff, Arabic review, acceptance, archive identity, rollback `1e0c849355c7bf3774db565d6c7a10c01d3522eb`, release manifest, internal checksums, and extracted bytes. Gatekeeper reruns the full suite and action-time seals.

Both exclusive-create evidence with PASS and no failures. No push occurs before both reports exist and their SHA-256 values are verified.

- [ ] **Step 3: Recheck the action-time deployment seal**

Immediately before push run the exact A0 dirty-main helper again with the new exclusive prefix `/tmp/zxrubbertech-ar-evidence-20260820/a9-predeploy-dirty-main`; bind the three new file SHAs and byte identity to `a9-predeploy-gatekeeper.json`. Never reuse or overwrite the A0 prefix. Require clean candidate; `origin/main` and `git ls-remote` both exactly `1e0c849355c7bf3774db565d6c7a10c01d3522eb`; dirty-main three seals unchanged; CSV SHA `8d17b3226a266ff4539cf9a6721e4854992121663aeebd60354b3e73cf76fb63` unchanged; archive sidecar PASS; candidate contains `8d09537b6d810e03b7693b998dd624dce509b6e3` and `1e0c849355c7bf3774db565d6c7a10c01d3522eb` as ancestors. Any remote movement is HOLD; do not rebase or force push automatically.

- [ ] **Step 4: Perform one exact non-force push**

```bash
CANDIDATE_SHA=$(git rev-parse HEAD)
git push origin "${CANDIDATE_SHA}:main"
```

Do not modify Cloudflare, Formspree, Turnstile, Search Console, or any real form.

- [ ] **Step 5: Verify the exact Pages deployment and 527-file subset**

Find the GitHub Pages workflow run whose `headSha` equals the candidate, wait for success, require latest Pages build commit exact candidate, download the exact `github-pages` artifact, and safely extract it.

From the accepted 528-file release, exclude only `v5-release-report.json` to create an ordered 527-path manifest. Require all 527 paths to exist in the Pages artifact and match byte-for-byte. Record the full artifact inventory separately without hard-coding its unrelated repository file count.

This artifact comparison is the source-byte authority. Production HTML served through Cloudflare is not required to be raw-byte-identical because the already-enabled Email Address Obfuscation feature can rewrite email markup and inject `/cdn-cgi/.../email-decode.min.js`. For every live HTML page, a fail-closed edge-diff classifier must accept only exact `__cf_email__`, `data-cfemail`, `/cdn-cgi/l/email-protection`, and `/cdn-cgi/scripts/.../email-decode.min.js` transformations; decode the Cloudflare XOR hex payload and require the recovered email and `mailto:` target to equal the artifact source. Remove only that exact injected script and reconstruct only that exact email node before comparing parsed DOM structure, attributes, text, SEO, IDs, forms, and media references. Any other live-versus-artifact difference is a failure.

- [ ] **Step 6: Run full production acceptance**

```bash
PRODUCTION_REPORT=/tmp/zxrubbertech-ar-evidence-20260820/a9-production-acceptance.json
test ! -e "$PRODUCTION_REPORT"
node scripts/check-v5-acceptance.mjs \
  --base-url=https://www.zxrubbertech.com/ \
  --cloudflare-csv=cloudflare/zxrubbertech-v5-legacy-redirects.csv \
  --output="$PRODUCTION_REPORT" \
  --browser="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

Require 88/88 HTTP logical routes, 50/50 exact first-hop 301 redirects with exact `Location`, query preservation and final200, 126/126 browser checks, Persian14, Arabic14, total RTL28, all click paths, Quote9, `formspreeAttemptedPostRequests=0`, `formspreePostRequests=0`, `realSubmissions=0`, `formspreeInterceptedUrls=[]`, no failures, and complete cleanup.

Rerun only for a diagnosed harness false-negative; retain every failed report. A rerun must use the next unused exact suffix, for example `a9-production-acceptance-r2.json`, and the new report must bind the prior report SHA and diagnosis. Runtime failures return to the responsible Gate unless they meet a HOLD condition.

- [ ] **Step 7: Obtain final production Reviewer and Gatekeeper PASS**

Independent Reviewer reconstructs exact 88/50/126/28 ordered sets from registry/map/CSV and verifies every record and the production report hash. It separately proves Pages artifact 527/527 raw-byte identity to the accepted source and live-edge structural/semantic identity after only the exact reversible Cloudflare Email Address Obfuscation normalization above; it must never claim unnormalized live HTML raw-byte identity. Gatekeeper independently recomputes remote, Pages, archive, CSV, dirty seals, production metrics, exact edge-diff classification, and zero-submission evidence.

Both create immutable external PASS reports with no failures. Report the deployed SHA, archive path/SHA, rollback, all evidence hashes, and any explicitly deferred non-blocking observation.

### Task 12: Perform Read-Only SEO and Search Console Handoff

**Files:**
- No repository changes
- No external writes

**Interfaces:**
- Consumes: final production PASS
- Produces: operator guidance for the existing Search Console property and sitemap

- [ ] **Step 1: Verify live SEO inventory**

Read-only checks require `https://www.zxrubbertech.com/sitemap.xml` to expose exactly 63 ordered canonical URLs. All nine versions of each role have reciprocal ten-link clusters, self canonical, indexable robots, localized visible content, and correct `lang/dir`.

- [ ] **Step 2: Provide Search Console guidance**

Keep the existing domain property and existing sitemap URL. Do not resubmit repeatedly and do not mass-request indexing. Recommend monitoring discovered pages moving from 56 to 63, Arabic `/ar/` Page Indexing status, and Arabic query/page/country performance over the following days and weeks.

- [ ] **Step 3: Seal A10 completion**

Gatekeeper confirms no repository diff, no Cloudflare/Formspree/Turnstile/GSC writes, production/remote candidate identity, archive sidecar, live sitemap63, and final evidence chain. Return FINAL_PASS.
