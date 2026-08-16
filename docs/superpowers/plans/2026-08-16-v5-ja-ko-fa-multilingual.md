# V5 Japanese, Korean, and Persian Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add complete Japanese, Korean, and Iranian-standard Persian versions of all seven V5 page roles, producing an eight-language, 56-page production release without changing verified facts, media, form services, or historical redirects.

**Architecture:** The primary agent exclusively owns shared source, checkers, generated output, integration, archive, and deployment. Three catalog agents work in isolated worktrees and each creates exactly one 531-key locale JSON; read-only Reviewer and Gatekeeper agents independently validate each stage and automatically release passing gates.

**Tech Stack:** Static HTML, Node.js ES modules, JSON catalogs, Git worktrees, GitHub Pages, Playwright/Chromium browser acceptance, Cloudflare Turnstile, Formspree.

## Global Constraints

- The Git and production rollback baseline is exactly `6f84d51dac660ff1bdb5a38c7cf87dbb69a0812f`.
- Work only in isolated worktrees created from the sealed baseline; do not edit, clean, reset, or overwrite `/Users/ren/Documents/zxrubbertech-website/zxrubbertech-website`.
- Generated HTML is never hand-edited. Change V5 build source, then regenerate.
- The new locale IDs are exactly `ja`, `ko`, and `fa`; Persian is Iranian-standard Persian and uses `dir="rtl"`.
- English remains `x-default`; do not add IP, browser-language, cookie, or localStorage redirects.
- Final counts are 8 locales, 7 roles, 56 canonical pages, 9 `hreflang` links per page, 504 total `hreflang` links, 56 sitemap URLs, 24 language anchors per page, and 1,344 language anchors total.
- Historical inventory remains 25 fallback pages and 50 Cloudflare CSV rows. The accepted CSV SHA-256 remains `8d17b3226a266ff4539cf9a6721e4854992121663aeebd60354b3e73cf76fb63`.
- Keep `robots.txt`, `CNAME`, `.nojekyll`, media, Logo, map, Formspree endpoint, Turnstile Site Key, Email, WhatsApp, company facts, and technical data unchanged.
- Automated tests must not solve Turnstile or send a real Formspree submission.
- A normal in-scope failure returns to the responsible agent for repair and re-review. Only the HOLD conditions in the approved design require user input.
- Never force push. Deployment is one non-force push of the exact accepted candidate after Gatekeeper PASS.

## File Ownership

### Catalog-agent exclusive files

- Create: `scripts/v5-i18n/ja.json`
- Create: `scripts/v5-i18n/ko.json`
- Create: `scripts/v5-i18n/fa.json`

Each catalog agent may modify only its assigned file.

### Primary-agent shared files

- Modify: `scripts/v5-i18n-config.mjs`
- Modify: `scripts/v5-i18n/glossary.json`
- Modify: `scripts/v5-i18n-transform.mjs`
- Modify: `scripts/v5-language-controls.mjs`
- Modify: `scripts/v5-seo-transform.mjs`
- Modify: `scripts/build-v5-release.mjs`
- Modify: `scripts/check-v5-i18n.mjs`
- Modify: `scripts/check-v5-seo.mjs`
- Modify: `scripts/build-v5-retirement.mjs`
- Modify: `scripts/check-v5-retirement.mjs`
- Create: `scripts/check-v5-i18n-mutations.mjs`
- Create: `scripts/check-v5-acceptance.mjs`
- Modify: `scripts/archive-v5.mjs`
- Modify: `scripts/check-v5-scope.mjs`
- Modify last: `scripts/v5-protected-baseline.json`

The approved design and plan files are final-diff allowlist entries and become read-only after their commits.

### Generated files

- Regenerate: the existing 35 canonical production HTML files
- Create: seven canonical files under `ja/`
- Create: seven canonical files under `ko/`
- Create: seven canonical files under `fa/`
- Regenerate: `sitemap.xml`

---

### Task 1: Seal N0 Baseline and Evidence

**Files:**
- Read: `AGENTS.md`
- Read: all shared and immutable files listed above
- Create outside repository: `/tmp/zxrubbertech-ja-ko-fa-evidence-20260816/n0-baseline.json`

**Interfaces:**
- Consumes: production commit `6f84d51dac660ff1bdb5a38c7cf87dbb69a0812f`
- Produces: sealed baseline report with Git, Pages, production, dirty-main, checker, CSV, and immutable-file hashes

- [ ] **Step 1: Confirm the integration parent and clean status**

Run:

```bash
git rev-parse HEAD
git rev-parse origin/main
git status --porcelain=v1
```

Expected: the implementation branch descends directly from `6f84d51...`; `origin/main` is the same at sealing time; status contains no uncommitted files.

- [ ] **Step 2: Fingerprint the untouched dirty main**

Run this exact read-only fingerprint procedure and store all three hashes in N0 evidence:

```bash
DIRTY_MAIN=/Users/ren/Documents/zxrubbertech-website/zxrubbertech-website
UNTRACKED_MANIFEST=$(mktemp)
TRACKED_PATCH_SHA=$(git -C "$DIRTY_MAIN" diff --binary | shasum -a 256 | awk '{print $1}')
git -C "$DIRTY_MAIN" ls-files --others --exclude-standard -z |
  while IFS= read -r -d '' path; do
    file_sha=$(shasum -a 256 "$DIRTY_MAIN/$path" | awk '{print $1}')
    printf '%s  %s\n' "$file_sha" "$path"
  done | LC_ALL=C sort > "$UNTRACKED_MANIFEST"
UNTRACKED_MANIFEST_SHA=$(shasum -a 256 "$UNTRACKED_MANIFEST" | awk '{print $1}')
STATUS_SHA=$(git -C "$DIRTY_MAIN" status --porcelain=v1 -z | shasum -a 256 | awk '{print $1}')
printf '%s\n%s\n%s\n' "$TRACKED_PATCH_SHA" "$UNTRACKED_MANIFEST_SHA" "$STATUS_SHA"
rm "$UNTRACKED_MANIFEST"
```

Do not stage, clean, reset, move, or delete anything in that worktree.

- [ ] **Step 3: Run the current five-language green suite**

```bash
LOCKED_SOURCE=/private/tmp/zxrubbertech-url-integration.d35C2P/design-demos
LOCKED_TARGET="$(dirname "$PWD")/design-demos"
if test ! -e "$LOCKED_TARGET"; then
  mkdir -p "$LOCKED_TARGET"
  rsync -a "$LOCKED_SOURCE/" "$LOCKED_TARGET/"
fi
diff -qr "$LOCKED_SOURCE" "$LOCKED_TARGET"
N0_RELEASE_PARENT=$(mktemp -d /tmp/zxrubbertech-v5-n0-release.XXXXXX)
RELEASE_ROOT="$N0_RELEASE_PARENT/release"
node scripts/build-v5-release.mjs --output="$RELEASE_ROOT"
node scripts/build-v5-retirement.mjs --root="$RELEASE_ROOT"
node scripts/check-v5-scope.mjs
node scripts/check-v5-hybrid.mjs
node scripts/check-v5-seo.mjs --gate=all --profile=preview
node scripts/check-v5-i18n.mjs --gate=all --profile=preview
node scripts/check-v5-seo.mjs --gate=all --profile=release --root="$RELEASE_ROOT"
node scripts/check-v5-i18n.mjs --gate=all --profile=release --root="$RELEASE_ROOT"
node scripts/check-v5-retirement.mjs --root="$RELEASE_ROOT"
git diff --check
```

Expected current metrics: scope 902, hybrid 7/8, locales 5, pages 35, `hreflang` 210, sitemap 35, fallbacks 25, CSV rows 50.

- [ ] **Step 4: Have Gatekeeper seal the report**

Gatekeeper independently verifies GitHub Pages, 35/35 production pages, the 50-row CSV hash, immutable inputs, and all commands. It writes evidence outside the repository and returns `PASS` with `failures=[]`.

No repository commit is created by this task.

### Task 2: Build the Eight-Locale Registry and Fail-Closed Red Contract

**Files:**
- Modify: `scripts/v5-i18n-config.mjs`
- Modify: `scripts/check-v5-i18n.mjs`
- Create: `scripts/check-v5-i18n-mutations.mjs`

**Interfaces:**
- Consumes: existing five-locale registry and seven page stems
- Produces: `V5_LOCALES` entries with explicit `direction`; dynamic registry metrics; red checks for missing new catalogs

- [ ] **Step 1: Add direction to every locale and register the three new locales**

Use these exact definitions:

```js
ja: Object.freeze({
  prefix: 'ja', htmlLang: 'ja', hreflang: 'ja', ogLocale: 'ja_JP',
  direction: 'ltr', label: '日本語', shortLabel: 'JA', turnstileLanguage: 'ja',
}),
ko: Object.freeze({
  prefix: 'ko', htmlLang: 'ko', hreflang: 'ko', ogLocale: 'ko_KR',
  direction: 'ltr', label: '한국어', shortLabel: 'KO', turnstileLanguage: 'ko',
}),
fa: Object.freeze({
  prefix: 'fa', htmlLang: 'fa', hreflang: 'fa', ogLocale: 'fa_IR',
  direction: 'rtl', label: 'فارسی', shortLabel: 'FA', turnstileLanguage: 'fa',
}),
```

Add `direction: 'ltr'` to `en`, `de`, `zh-CN`, `ru`, and `tr`.

- [ ] **Step 2: Replace current-locale magic counts with registry formulas**

```js
const localeCount = Object.keys(config.V5_LOCALES).length;
const roleCount = config.V5_PAGE_STEMS.length;
const routeCount = localeCount * roleCount;
const hreflangsPerPage = localeCount + 1;
const hreflangLinks = routeCount * hreflangsPerPage;
const anchorsPerPage = localeCount * 3;
```

Keep historical `expectedLegacyLocales`, legacy paths 25, hosts 2, and CSV rows 50 fixed.

- [ ] **Step 3: Run the registry test before catalogs exist**

```bash
node scripts/check-v5-i18n.mjs --gate=registry --profile=preview
node scripts/check-v5-i18n.mjs --gate=all --profile=preview
```

Expected: registry reports exactly 8 locales, 7 roles, 56 routes, and 9 `hreflang` values; full preview exits nonzero because `ja.json`, `ko.json`, and `fa.json` do not exist.

- [ ] **Step 4: Implement and run the deterministic mutation harness**

Create `scripts/check-v5-i18n-mutations.mjs` with this CLI:

```bash
node scripts/check-v5-i18n-mutations.mjs --suite=registry --report=/tmp/v5-registry-mutations.json
node scripts/check-v5-i18n-mutations.mjs --suite=release --root=/tmp/complete-green-release --report=/tmp/v5-release-mutations.json
```

The harness creates a complete temporary fixture per case, applies exactly one mutation, runs the public checker CLI, and records `case`, fixture SHA, exit code, expected signal, actual signal, unaffected metrics, and `missingFileNoise`. Registry cases are unknown locale, duplicate prefix, `fa.direction=ltr`, wrong locale metadata, incorrect `x-default`, empty inventory, and malformed registry module.

Run:

```bash
MUTATION_REPORT=$(mktemp /tmp/zxrubbertech-v5-registry-mutations.XXXXXX.json)
node scripts/check-v5-i18n-mutations.mjs --suite=registry --report="$MUTATION_REPORT"
```

Expected: every case exits nonzero with its exact named signal and `missingFileNoise=0`.

- [ ] **Step 5: Commit the registry contract**

```bash
git add scripts/v5-i18n-config.mjs scripts/check-v5-i18n.mjs scripts/check-v5-i18n-mutations.mjs
git diff --cached --check
git commit -m "feat: define Japanese Korean Persian locale contract"
```

- [ ] **Step 6: Obtain automatic N1 Gatekeeper PASS**

Gatekeeper checks the commit's three-file allowlist, direct parent, registry 8/7/56/9, expected missing-catalog red signal, all registry mutations, clean status, and unchanged dirty-main fingerprints. PASS automatically releases Task 3; FAIL returns the same scope for repair; HOLD follows the approved design.

### Task 3: Freeze Shared Glossary, Facts, Script Rules, and RTL Transform Contract

**Files:**
- Modify: `scripts/v5-i18n/glossary.json`
- Modify: `scripts/check-v5-i18n.mjs`
- Modify: `scripts/check-v5-i18n-mutations.mjs`
- Modify: `scripts/v5-i18n-transform.mjs`
- Modify: `scripts/v5-seo-transform.mjs`

**Interfaces:**
- Consumes: repo-external terminology and fact proposals from three language agents
- Produces: one shared glossary; locale-specific validators; explicit HTML direction and bidi-safe transformation primitives

- [ ] **Step 1: Dispatch three read-only terminology proposals in parallel**

Each language agent returns translations for the 12 glossary terms and these five exact facts without editing the repository:

```text
approximately 3,000 metric tons
more than 15 million molded rubber components per year
within 24 hours
2 metric tons
2–7 business days
```

Three read-only language Reviewers who did not author the proposals independently check industrial meaning, units, numbers, time ranges, and natural language. Only Reviewer-PASS values may be written by the primary agent to `glossary.json`, serially.

- [ ] **Step 2: Add locale-specific script and encoding validation**

Implement these exact rules:

```text
ja: valid UTF-8, NFC, Japanese prose and catalog kana; reject half-width Katakana
    and unapproved Hangul/Cyrillic/Arabic script.
ko: valid UTF-8, NFC, Hangul prose; reject decomposed Hangul Jamo and unapproved
    kana/Cyrillic/Arabic script.
fa: valid UTF-8, NFC, Arabic-script prose and Persian characters; reject Arabic
    ي/ك in prose, presentation forms, BOM, isolated ZWJ, U+202A–U+202E, and
    U+2066–U+2069; permit semantic U+200C.
```

All locales retain protected-literal, English-residue, 12-term, five-fact, and exact key-set checks.

- [ ] **Step 3: Generate explicit `lang` and `dir` attributes**

Release output must contain exactly:

```html
<html lang="ja" dir="ltr">
<html lang="ko" dir="ltr">
<html lang="fa" dir="rtl">
```

Preview behavior and seven accepted English inputs remain unchanged.

- [ ] **Step 4: Add bidi-safe transform hooks without adding form fields**

For Persian output only, mark existing email, phone, URLs, WhatsApp, company English names, model/material codes, and fixed technical identifiers as LTR isolates. Set user-entered name, company, and message controls to `dir="auto"`; set email and phone controls to `dir="ltr"`. Do not add `dirname`.

- [ ] **Step 5: Register catalog mutation cases and run foundation regressions**

Add Japanese without kana, half-width Katakana, Korean without Hangul, decomposed Hangul Jamo, Persian without Arabic script, Arabic `ي/ك`, hidden bidi controls, modified protected literals/facts, and missing glossary terms to the harness's `catalog` suite. Do not claim the suite passes before the three complete catalogs exist. At this gate run:

```bash
node --check scripts/check-v5-i18n.mjs
node --check scripts/check-v5-i18n-mutations.mjs
node --check scripts/v5-i18n-transform.mjs
node --check scripts/v5-seo-transform.mjs
for locale in en de zh-CN ru tr; do
  node scripts/check-v5-i18n.mjs --gate=catalog --profile=preview --locale="$locale"
done
```

The full catalog mutation suite runs immediately after all three catalogs are integrated in Task 4.

- [ ] **Step 6: Commit shared language QA infrastructure**

```bash
git add scripts/v5-i18n/glossary.json scripts/check-v5-i18n.mjs \
  scripts/check-v5-i18n-mutations.mjs scripts/v5-i18n-transform.mjs scripts/v5-seo-transform.mjs
git diff --cached --check
git commit -m "feat: enforce Japanese Korean Persian language quality"
```

- [ ] **Step 7: Obtain automatic N2 Gatekeeper PASS**

Gatekeeper verifies the five-file allowlist, three language-Reviewer reports, 12 terms and five facts per locale, protected literals, the registered catalog mutation case inventory, syntax checks, existing five-locale catalog regressions, exact `lang/dir` transformation, clean status, and unchanged dirty-main fingerprints. Full Unicode/script/bidi mutation execution is explicitly deferred to Task 4 after the three complete catalogs exist. PASS automatically releases catalog work.

### Task 4: Create Three Catalogs in Parallel Isolated Worktrees

**Files:**
- Create: `scripts/v5-i18n/ja.json`
- Create: `scripts/v5-i18n/ko.json`
- Create: `scripts/v5-i18n/fa.json`

**Interfaces:**
- Consumes: frozen English catalog key set, shared glossary, verified facts, protected literals, and current operations hash
- Produces: three independent catalog commits, each touching exactly one file

- [ ] **Step 1: Create three catalog worktrees from the same shared-foundation commit**

```bash
FOUNDATION_SHA=$(git rev-parse HEAD)
JA_PARENT=$(mktemp -d /private/tmp/zxrubbertech-v5-ja-catalog.XXXXXX)
KO_PARENT=$(mktemp -d /private/tmp/zxrubbertech-v5-ko-catalog.XXXXXX)
FA_PARENT=$(mktemp -d /private/tmp/zxrubbertech-v5-fa-catalog.XXXXXX)
git worktree add -b v5-ja-catalog-20260816 "$JA_PARENT/zxrubbertech-website" "$FOUNDATION_SHA"
git worktree add -b v5-ko-catalog-20260816 "$KO_PARENT/zxrubbertech-website" "$FOUNDATION_SHA"
git worktree add -b v5-fa-catalog-20260816 "$FA_PARENT/zxrubbertech-website" "$FOUNDATION_SHA"
for worktree in "$JA_PARENT/zxrubbertech-website" "$KO_PARENT/zxrubbertech-website" "$FA_PARENT/zxrubbertech-website"; do
  test "$(git -C "$worktree" rev-parse HEAD)" = "$FOUNDATION_SHA"
  test -z "$(git -C "$worktree" status --porcelain=v1)"
done
```

- [ ] **Step 2: Assign one exclusive file per agent**

Agent prompts must state:

```text
JA may create only scripts/v5-i18n/ja.json.
KO may create only scripts/v5-i18n/ko.json.
FA may create only scripts/v5-i18n/fa.json.
Do not edit glossary, config, checkers, HTML, sitemap, media, or another catalog.
```

- [ ] **Step 3: Produce complete catalogs**

Each catalog must contain the exact 531 English translation keys, seven page objects, seven SEO objects, and 14 localized Quote/runtime messages. Preserve every approved literal and numeric fact at the required occurrence count.

- [ ] **Step 4: Run per-agent catalog checks**

Run the matching command in each worktree:

```bash
node scripts/check-v5-i18n.mjs --gate=catalog --profile=preview --locale=ja
node scripts/check-v5-i18n.mjs --gate=catalog --profile=preview --locale=ko
node scripts/check-v5-i18n.mjs --gate=catalog --profile=preview --locale=fa
```

The agent returns commit SHA, parent SHA, file hash, key count, check-output hash, and clean status.

- [ ] **Step 5: Independently review each catalog**

A Reviewer that did not author the file checks terminology, facts, script, natural SEO phrasing, protected literals, runtime messages, and residue. FAIL returns only that catalog to its owner. PASS reports `failures=[]` and does not modify files.

Each Reviewer must exclusive-create one exact path; an existing target is HOLD and must never be overwritten:

```text
/tmp/zxrubbertech-ja-ko-fa-evidence-20260816/ja-catalog-review.json
/tmp/zxrubbertech-ja-ko-fa-evidence-20260816/ko-catalog-review.json
/tmp/zxrubbertech-ja-ko-fa-evidence-20260816/fa-catalog-review.json
```

Each report must contain this exact schema:

```json
{
  "status": "PASS",
  "locale": "ja",
  "foundationSha": "64 lowercase hexadecimal characters",
  "commit": "64 lowercase hexadecimal characters",
  "parentSha": "64 lowercase hexadecimal characters",
  "catalogPath": "scripts/v5-i18n/ja.json",
  "catalogSha256": "64 lowercase hexadecimal characters",
  "checkerReportSha256": "64 lowercase hexadecimal characters",
  "reviewerId": "independent reviewer task identity",
  "failures": []
}
```

The Korean and Persian reports use their own locale/path. Reviewer code writes with filesystem flag `wx`; it validates the author commit has exactly one changed file before reporting PASS.

- [ ] **Step 6: Import the three one-file commits serially**

The primary agent verifies each diff contains one expected path, then imports evidence-bound commits in this order:

```bash
JA_COMMIT=$(jq -r .commit /tmp/zxrubbertech-ja-ko-fa-evidence-20260816/ja-catalog-review.json)
KO_COMMIT=$(jq -r .commit /tmp/zxrubbertech-ja-ko-fa-evidence-20260816/ko-catalog-review.json)
FA_COMMIT=$(jq -r .commit /tmp/zxrubbertech-ja-ko-fa-evidence-20260816/fa-catalog-review.json)
git cherry-pick "$JA_COMMIT"
git cherry-pick "$KO_COMMIT"
git cherry-pick "$FA_COMMIT"
```

After import, run all three catalog gates. No shared-file conflict may be auto-resolved.

Run the complete catalog mutation suite from the integrated worktree:

```bash
CATALOG_MUTATION_REPORT=/tmp/zxrubbertech-ja-ko-fa-evidence-20260816/catalog-mutations.json
node scripts/check-v5-i18n-mutations.mjs --suite=catalog --report="$CATALOG_MUTATION_REPORT"
```

Expected: every case exits nonzero with exact locale/key/expected/actual diagnostics and `missingFileNoise=0`.

- [ ] **Step 7: Obtain automatic N3/N4 Gatekeeper PASS**

Gatekeeper verifies the common foundation SHA, one-file diffs, three language-Reviewer reports, 531 keys per catalog, 508 operations, 12 terms, five facts, 19 protected literals, all catalog mutations, exact imported SHAs, clean integration, and unchanged dirty-main fingerprints. PASS releases shared release integration.

### Task 5: Integrate Language Controls, SEO, Form, and Persian RTL

**Files:**
- Modify: `scripts/v5-language-controls.mjs`
- Modify: `scripts/v5-seo-transform.mjs`
- Modify: `scripts/check-v5-i18n.mjs`
- Modify: `scripts/check-v5-seo.mjs`
- Modify: `scripts/check-v5-i18n-mutations.mjs`
- Modify: `scripts/v5-i18n-transform.mjs`

**Interfaces:**
- Consumes: eight-locale registry and three reviewed catalogs
- Produces: temporary eight-language release pages with complete controls, SEO, form localization, internal routing, and scoped RTL

- [ ] **Step 1: Make language controls registry-driven**

Every page must contain exactly three control groups, eight real anchors per group, 24 anchors per page, registry order, and one `aria-current` per group. Same-role links, products/compounds fragments, Quote query values, and mobile fragments remain localized.

- [ ] **Step 2: Add scoped RTL CSS**

Use `html[dir="rtl"]` and logical properties for semantic direction. Do not mirror media, Logo, map, or decorative coordinates. Remove disruptive uppercase/letter-spacing only for Persian natural-language elements. Existing seven English design inputs remain byte-identical.

- [ ] **Step 3: Make SEO clusters registry-driven**

Each release page must have self canonical, nine reciprocal `hreflang` links, correct `og:locale`, seven OG alternates, localized title/description/breadcrumb, and existing schema restrictions.

- [ ] **Step 4: Validate eight Quote pages**

Require eight exact Formspree targets, eight widgets, eight hidden locale fields, and 112 runtime-message checks. New hidden values are `ja`, `ko`, and `fa`; Turnstile language values are the same. Record `realSubmissions=0`.

- [ ] **Step 5: Build a repository-external integration bundle**

```bash
RELEASE_ROOT=$(mktemp -d /tmp/zxrubbertech-v5-ja-ko-fa-release.XXXXXX)
node scripts/build-v5-release.mjs --output="$RELEASE_ROOT"
```

Expected release report: locales 8, pages 56, `hreflang` 504, sitemap 56.

- [ ] **Step 6: Run control, form, and SEO mutations**

Extend `scripts/check-v5-i18n-mutations.mjs` with the `release` cases listed below, then run the harness against complete copies of the green bundle:

```bash
RELEASE_MUTATION_REPORT=/tmp/zxrubbertech-ja-ko-fa-evidence-20260816/release-mutations.json
node scripts/check-v5-i18n-mutations.mjs --suite=release --root="$RELEASE_ROOT" --report="$RELEASE_MUTATION_REPORT"
```

Require precise failure for missing/duplicate language anchors, wrong `aria-current`, cross-language canonical, missing/extra `hreflang`, wrong `dir`, wrong Turnstile language, wrong hidden locale, changed Formspree ID/Site Key, changed backend fields, English internal-link leakage, and extra DOM structure. Every fixture retains 56 canonical pages and reports `missingFileNoise=0`.

- [ ] **Step 7: Commit shared integration**

```bash
git add scripts/v5-language-controls.mjs scripts/v5-seo-transform.mjs \
  scripts/check-v5-i18n.mjs scripts/check-v5-seo.mjs scripts/check-v5-i18n-mutations.mjs \
  scripts/v5-i18n-transform.mjs
git diff --cached --check
git commit -m "feat: integrate eight-language V5 release behavior"
```

- [ ] **Step 8: Obtain automatic N5 Gatekeeper PASS**

Gatekeeper independently rebuilds a repository-external release, checks 8/56/9/504/56, controls 3×8 per page, eight Quote pages and 112 messages, all release mutations, Persian `lang/dir`, immutable media/form values, clean status, and unchanged dirty-main fingerprints. PASS releases retirement/archive tooling.

### Task 6: Generalize Release, Retirement, Archive, and Scope Tooling

**Files:**
- Modify: `scripts/build-v5-release.mjs`
- Modify: `scripts/build-v5-retirement.mjs`
- Modify: `scripts/check-v5-retirement.mjs`
- Modify: `scripts/check-v5-i18n-mutations.mjs`
- Modify: `scripts/archive-v5.mjs`
- Modify: `scripts/check-v5-scope.mjs`
- Modify later: `scripts/v5-protected-baseline.json`

**Interfaces:**
- Consumes: complete temporary 56-page release
- Produces: deterministic 56-page/25-fallback bundle, exact acceptance contract, and scope coverage for the three new production roots

- [ ] **Step 1: Derive release counts from the registry**

Import `V5_PAGE_STEMS` and use `pages.length * getHreflangCluster(V5_PAGE_STEMS[0]).length` for complete-release reporting. Full release/archive builds require all eight locales; the existing single-locale form such as `--locale=ja` remains valid only for isolated catalog QA. Duplicate or unknown locale inventories fail closed.

- [ ] **Step 2: Separate current routes from historical routes**

Retirement tooling accepts 56 current V5 URLs but retains exactly the existing historical locales, 25 fallbacks, two hosts, and 50 CSV rows. Do not add `ja`, `ko`, or `fa` to `expectedLegacyLocales` or `v5-retirement-map.mjs`.

- [ ] **Step 3: Generalize archive acceptance**

Change the package identity to exactly `zxrubbertech-v5-ja-ko-fa-release-candidate-2026-08-16-rc1`. Archive preflight requires eight exact catalogs, 56 page records, 504 `hreflang` links, 56 sitemap URLs, 81 HTTP checks, 112 browser checks, nine `hreflang` links per page, 25 fallbacks, and 50 CSV rows. Rollback is `6f84d51...`.

- [ ] **Step 4: Extend scope roots but defer baseline acceptance**

Add `ja`, `ko`, and `fa` to production roots. Before those directories exist, scope may continue to pass. After the 21 new production files are materialized and before the baseline is rewritten, scope must fail with exactly 21 `unexpected` paths. Do not edit `v5-protected-baseline.json` in this task.

- [ ] **Step 5: Run deterministic double builds**

```bash
RELEASE_A=$(mktemp -d /tmp/zxrubbertech-v5-ja-ko-fa-a.XXXXXX)
RELEASE_B=$(mktemp -d /tmp/zxrubbertech-v5-ja-ko-fa-b.XXXXXX)
node scripts/build-v5-release.mjs --output="$RELEASE_A"
node scripts/build-v5-retirement.mjs --root="$RELEASE_A"
node scripts/build-v5-release.mjs --output="$RELEASE_B"
node scripts/build-v5-retirement.mjs --root="$RELEASE_B"
```

Create and compare sorted path/hash manifests:

```bash
for root in "$RELEASE_A" "$RELEASE_B"; do
  manifest="${root}.sha256"
  (
    cd "$root"
    find . -type f -print | LC_ALL=C sort |
      while IFS= read -r path; do shasum -a 256 "$path"; done
  ) > "$manifest"
done
cmp "$RELEASE_A.sha256" "$RELEASE_B.sha256"
diff -qr "$RELEASE_A" "$RELEASE_B"
test "$(wc -l < "$RELEASE_A.sha256" | tr -d ' ')" = "521"
```

Expected release inventory is exactly 521 files, derived from the sealed 500-file release plus 21 new canonical pages.

- [ ] **Step 6: Prove legacy boundaries fail closed**

Extend `scripts/check-v5-i18n-mutations.mjs` with the `retirement` and `archive` cases listed below, then run:

```bash
RETIREMENT_MUTATION_REPORT=/tmp/zxrubbertech-ja-ko-fa-evidence-20260816/retirement-mutations.json
ARCHIVE_MUTATION_REPORT=/tmp/zxrubbertech-ja-ko-fa-evidence-20260816/archive-mutations.json
node scripts/check-v5-i18n-mutations.mjs --suite=retirement --root="$RELEASE_A" --report="$RETIREMENT_MUTATION_REPORT"
node scripts/check-v5-i18n-mutations.mjs --suite=archive --root="$RELEASE_A" --report="$ARCHIVE_MUTATION_REPORT"
```

Require nonzero failure for adding a Japanese/Korean/Persian legacy redirect, changing a fallback target, changing fallback count, changing any CSV byte, accepting old 35/210/60/70/6 reports, or leaving rollback at an older SHA. All active fixtures retain complete 56/25/50 inventory with `missingFileNoise=0`.

- [ ] **Step 7: Commit tooling changes**

```bash
git add scripts/build-v5-release.mjs scripts/build-v5-retirement.mjs \
  scripts/check-v5-retirement.mjs scripts/check-v5-i18n-mutations.mjs \
  scripts/archive-v5.mjs scripts/check-v5-scope.mjs
git diff --cached --check
git commit -m "build: generalize V5 release for eight languages"
```

- [ ] **Step 8: Obtain automatic N6 Gatekeeper PASS**

Gatekeeper independently checks the exact shared-file allowlist, dynamic complete-versus-single-locale behavior, byte-identical 521-file double builds, 56 current URLs, fixed 25/50 legacy inventory, unchanged CSV/robots/media, archive package identity `zxrubbertech-v5-ja-ko-fa-release-candidate-2026-08-16-rc1`, rollback `6f84d51...`, all retirement/archive mutations, clean status, and unchanged dirty-main fingerprints.

### Task 7: Run Full HTTP and Browser Acceptance

**Files:**
- Create: `scripts/check-v5-acceptance.mjs`
- Create outside repository: acceptance JSON, screenshots, browser logs, HTTP results, and manifest hashes

**Interfaces:**
- Consumes: deterministic temporary release root
- Produces: read-only acceptance report binding 81 HTTP routes and 112 canonical page/viewports to the candidate input SHA

- [ ] **Step 1: Implement the reproducible acceptance harness**

Create `scripts/check-v5-acceptance.mjs` with this exact CLI:

```bash
node scripts/check-v5-acceptance.mjs --root=/tmp/complete-release --output=/tmp/local-acceptance.json --browser="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
node scripts/check-v5-acceptance.mjs --base-url=https://www.zxrubbertech.com/ --cloudflare-csv=cloudflare/zxrubbertech-v5-legacy-redirects.csv --output=/tmp/production-acceptance.json --browser="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

With `--root`, the script starts a repository-external static server bound to `localhost` on an OS-assigned port. With `--base-url`, it tests the deployed HTTPS site without starting a server and requires the exact accepted Cloudflare CSV. Production mode checks all 50 CSV rows across apex and www for exact 301, exact `Location`, preserved query, final 200, and target language. In both modes it blocks all Formspree POST requests and closes the browser/server in `finally`. It rejects both/neither source modes, duplicate arguments, repository-internal output, missing release files, malformed reports, unknown locale/role, and a non-Chromium browser executable.

- [ ] **Step 2: Run the full harness**

```bash
ACCEPTANCE_REPORT=/tmp/zxrubbertech-ja-ko-fa-evidence-20260816/acceptance.json
node scripts/check-v5-acceptance.mjs \
  --root="$RELEASE_A" \
  --output="$ACCEPTANCE_REPORT" \
  --browser="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

The harness verifies 56 canonical routes and 25 fallbacks over HTTP, then tests all 56 canonical pages at 1280×900 and 390×844. For every browser result require:

```text
one H1
zero horizontal or local overflow
zero broken images
zero failed videos
zero migration console errors
three language groups × eight links
one current locale per group
self canonical and nine hreflang links
localized current-locale internal navigation
```

- [ ] **Step 3: Require targeted interaction evidence**

Cover all seven page-role language switches, products and compounds fragments, Quote `industry` and `contact` navigation, mobile fragments, Email, WhatsApp, map, keyboard Tab/Arrow/Escape behavior, and Persian focus order.

- [ ] **Step 4: Require Persian RTL evidence**

Test all seven Persian pages at both viewports. Confirm reading order, menus, Footer, FAQ icons, forms, numbers, parentheses, colons, Email, phone, URLs, material codes, and preserved English names. Media and map must not be mirrored.

- [ ] **Step 5: Require Quote validation without a network submission**

Use request interception or a no-connect harness. Test empty required fields, invalid Email, valid fields without Turnstile, localized error messages, preserved values, hidden locale, and correct `data-language`. Require zero Formspree requests and record:

```json
{
  "formSubmission": "deferred",
  "realSubmissions": 0,
  "formspreePostRequests": 0
}
```

- [ ] **Step 6: Validate the report schema and hash**

```bash
node -e 'const r=require(process.argv[1]); if (r.status!=="PASS" || r.httpRoutes!==81 || r.httpPassed!==81 || r.browserPages!==56 || r.pageViewportChecks!==112 || r.pageViewportPassed!==112 || r.persianRtlViewportChecks!==14 || r.realSubmissions!==0 || r.formspreePostRequests!==0 || r.failures.length!==0) process.exit(1)' "$ACCEPTANCE_REPORT"
shasum -a 256 "$ACCEPTANCE_REPORT"
```

- [ ] **Step 7: Commit the acceptance harness**

```bash
git add scripts/check-v5-acceptance.mjs
git diff --cached --check
git commit -m "test: add eight-language V5 acceptance harness"
```

- [ ] **Step 8: Have Reviewer and Gatekeeper sign acceptance**

Reviewer reruns representative checks and verifies the full report contains 81/81 HTTP PASS, 112/112 browser PASS, Persian RTL 14/14 PASS, immutable hashes, and `failures=[]`.
Gatekeeper independently reruns the harness from a repository-external current build and checks the committed harness hash, report schema, result counts, zero network submissions, clean status, and unchanged dirty-main fingerprints. PASS releases materialization.

### Task 8: Materialize Generated Pages, Rebuild Scope Baseline, and Create Candidate

**Files:**
- Regenerate: all 56 canonical production HTML files
- Regenerate: `sitemap.xml`
- Modify: `scripts/v5-protected-baseline.json`

**Interfaces:**
- Consumes: accepted deterministic release and browser report
- Produces: atomic Git candidate whose ancestry starts at the sealed baseline and whose diff is entirely allowlisted

- [ ] **Step 1: Copy only accepted generated outputs from the release root**

Use this exact path loop:

```bash
PAGE_PATHS=(index.html products/index.html rubber-compounds/index.html industries/index.html capabilities/index.html faq/index.html quote/index.html)
for path in "${PAGE_PATHS[@]}"; do
  mkdir -p "$(dirname "$path")"
  cp "$RELEASE_A/$path" "$path"
done
for locale in de zh ru tr ja ko fa; do
  for path in "${PAGE_PATHS[@]}"; do
    target="$locale/$path"
    mkdir -p "$(dirname "$target")"
    cp "$RELEASE_A/$target" "$target"
  done
done
cp "$RELEASE_A/sitemap.xml" sitemap.xml
```

This copies exactly 56 canonical HTML files plus `sitemap.xml`. It does not copy reports, screenshots, fallbacks, Cloudflare CSV, `robots.txt`, media, or unrelated files.

- [ ] **Step 2: Rebuild the protected baseline last**

Before accepting a new baseline, require the old baseline to reject the generated change set with exactly 21 unexpected new-locale pages, exactly 31 modified protected paths (30 currently protected canonical HTML files plus `sitemap.xml`), and zero missing paths. The remaining five English canonical pages are enforced by the release, SEO, and i18n checkers but are not currently part of the protected-root inventory:

```bash
set +e
node scripts/check-v5-scope.mjs > /tmp/zxrubbertech-v5-scope-before-baseline.json
SCOPE_BEFORE_EXIT=$?
set -e
test "$SCOPE_BEFORE_EXIT" = "1"
node -e 'const r=require(process.argv[1]); if (r.unexpected.length!==21 || r.modified.length!==31 || r.missing.length!==0) process.exit(1)' /tmp/zxrubbertech-v5-scope-before-baseline.json
ZX_V5_SCOPE_BASELINE_APPROVED=1 node scripts/check-v5-scope.mjs --write-baseline
node scripts/check-v5-scope.mjs
```

The final protected count is exactly 923. Any other missing, unexpected, or modified path is a HOLD.

- [ ] **Step 3: Run the complete local suite**

```bash
node scripts/check-v5-scope.mjs
node scripts/check-v5-hybrid.mjs
node scripts/check-v5-seo.mjs --gate=all --profile=preview
node scripts/check-v5-i18n.mjs --gate=all --profile=preview
node scripts/check-v5-seo.mjs --gate=all --profile=release --root="$RELEASE_A"
node scripts/check-v5-i18n.mjs --gate=all --profile=release --root="$RELEASE_A"
node scripts/check-v5-retirement.mjs --root="$RELEASE_A"
git diff --check
```

Expected: all reports PASS, scope 923, hybrid 7/8, release 8/56/504/56, retirement 56/25/25/50/56.

- [ ] **Step 4: Verify exact diff boundaries**

Check `git diff --name-status 6f84d51...` against the approved allowlist, including the two committed planning documents and the two new test harnesses. Confirm five existing catalogs, English baseline/operations, seven V5 design inputs, 25 fallbacks, Cloudflare CSV, robots, media, contacts, and integration IDs match sealed hashes.

- [ ] **Step 5: Commit the candidate atomically**

```bash
git add -- scripts/v5-protected-baseline.json sitemap.xml \
  index.html {products,rubber-compounds,industries,capabilities,faq,quote}/index.html \
  {de,zh,ru,tr,ja,ko,fa}/index.html \
  {de,zh,ru,tr,ja,ko,fa}/{products,rubber-compounds,industries,capabilities,faq,quote}/index.html
git diff --cached --check
git commit -m "feat: add Japanese Korean Persian V5 locales"
```

Record candidate SHA, ancestry, full-index diff hash, allowlist hash, and clean status.

### Task 9: Archive, Gatekeeper Review, and Automatic Deployment

**Files:**
- Create outside repository: final ZIP, `.sha256` sidecar, extracted verification directory, candidate evidence, Reviewer report, Gatekeeper report

**Interfaces:**
- Consumes: clean atomic candidate and accepted release/acceptance reports
- Produces: verified archive and exact GitHub Pages deployment

- [ ] **Step 1: Build and verify the release candidate archive**

Use the exact new package identity and an outside-repository target:

```bash
ARCHIVE_DIR=/Users/ren/Documents/zxrubbertech-website/存档
ARCHIVE_PATH="$ARCHIVE_DIR/zxrubbertech-v5-ja-ko-fa-release-candidate-2026-08-16-rc1.zip"
mkdir -p "$ARCHIVE_DIR"
test ! -e "$ARCHIVE_PATH"
test ! -e "$ARCHIVE_PATH.sha256"
node scripts/archive-v5.mjs \
  --release-root "$RELEASE_A" \
  --acceptance-report "$ACCEPTANCE_REPORT" \
  --archive-path "$ARCHIVE_PATH"
(
  cd "$ARCHIVE_DIR"
  shasum -a 256 -c "$(basename "$ARCHIVE_PATH").sha256"
)
EXTRACT_ROOT=$(mktemp -d /tmp/zxrubbertech-v5-ja-ko-fa-archive.XXXXXX)
unzip -q "$ARCHIVE_PATH" -d "$EXTRACT_ROOT"
(
  cd "$EXTRACT_ROOT/zxrubbertech-v5-ja-ko-fa-release-candidate-2026-08-16-rc1"
  shasum -a 256 -c SHA256SUMS
)
```

Archive metadata must bind candidate SHA, rollback `6f84d51...`, acceptance report hash, 521-file release manifest, and exact package name.

- [ ] **Step 2: Obtain independent Reviewer and Gatekeeper PASS**

Reviewer validates candidate ancestry, exact diff, translations, browser report, release manifest, rollback, and archive. Gatekeeper independently reruns deterministic checks and returns `PASS`, evidence hashes, and `failures=[]`.

- [ ] **Step 3: Recheck the action-time deployment seal**

Immediately before push rerun the exact N0 dirty-main fingerprint commands and compare all three hashes to `n0-baseline.json`, then require:

```bash
test -z "$(git status --porcelain=v1)"
CANDIDATE_SHA=$(git rev-parse HEAD)
test "$(git rev-parse origin/main)" = "6f84d51dac660ff1bdb5a38c7cf87dbb69a0812f"
test "$(shasum -a 256 cloudflare/zxrubbertech-v5-legacy-redirects.csv | awk '{print $1}')" = "8d17b3226a266ff4539cf9a6721e4854992121663aeebd60354b3e73cf76fb63"
(
  cd "$ARCHIVE_DIR"
  shasum -a 256 -c "$(basename "$ARCHIVE_PATH").sha256"
)
```

If `origin/main` moved, stop with HOLD; do not rebase or force push automatically.

- [ ] **Step 4: Perform one non-force push**

```bash
git push origin "${CANDIDATE_SHA}:main"
```

Do not modify Cloudflare, Formspree, Turnstile settings, or GSC.

- [ ] **Step 5: Wait for the exact GitHub Pages deployment**

Use GitHub's read-only API and artifact download:

```bash
RUN_ID=$(gh run list --repo ZXRUBBERTECH/zxrubbertech-website --branch main --limit 30 \
  --json databaseId,headSha,status,conclusion \
  --jq ".[] | select(.headSha==\"$CANDIDATE_SHA\") | .databaseId" | head -n 1)
test -n "$RUN_ID"
gh run watch "$RUN_ID" --repo ZXRUBBERTECH/zxrubbertech-website --exit-status
test "$(gh api repos/ZXRUBBERTECH/zxrubbertech-website/pages/builds/latest --jq .commit)" = "$CANDIDATE_SHA"
ARTIFACT_ROOT=$(mktemp -d /tmp/zxrubbertech-v5-ja-ko-fa-pages.XXXXXX)
gh run download "$RUN_ID" --repo ZXRUBBERTECH/zxrubbertech-website --name github-pages --dir "$ARTIFACT_ROOT"
mkdir "$ARTIFACT_ROOT/extracted"
tar -xf "$ARTIFACT_ROOT/artifact.tar" -C "$ARTIFACT_ROOT/extracted"
```

Create an exact 520-path accepted release manifest, then prove those paths are a byte-identical subset of the Pages artifact. The artifact may contain other tracked repository files, so its total file count is recorded but not hardcoded:

```bash
(
  cd "$RELEASE_A"
  find . -type f ! -path './v5-release-report.json' -print | LC_ALL=C sort |
    while IFS= read -r path; do shasum -a 256 "$path"; done
) > "$ARTIFACT_ROOT/accepted.sha256"
(
  cd "$ARTIFACT_ROOT/extracted"
  while read -r expected_sha path; do
    test -f "$path"
    actual_sha=$(shasum -a 256 "$path" | awk '{print $1}')
    test "$actual_sha" = "$expected_sha"
    printf '%s  %s\n' "$actual_sha" "$path"
  done < "$ARTIFACT_ROOT/accepted.sha256"
) > "$ARTIFACT_ROOT/deployed-release-subset.sha256"
(
  cd "$ARTIFACT_ROOT/extracted"
  find . -type f -print | LC_ALL=C sort |
    while IFS= read -r path; do shasum -a 256 "$path"; done
) > "$ARTIFACT_ROOT/full-pages-artifact.sha256"
test "$(wc -l < "$ARTIFACT_ROOT/accepted.sha256" | tr -d ' ')" = "520"
test "$(wc -l < "$ARTIFACT_ROOT/deployed-release-subset.sha256" | tr -d ' ')" = "520"
cmp "$ARTIFACT_ROOT/accepted.sha256" "$ARTIFACT_ROOT/deployed-release-subset.sha256"
shasum -a 256 "$ARTIFACT_ROOT/full-pages-artifact.sha256"
```

- [ ] **Step 6: Run production verification**

Run the same committed harness against production:

```bash
PRODUCTION_REPORT=/tmp/zxrubbertech-ja-ko-fa-evidence-20260816/production-acceptance.json
node scripts/check-v5-acceptance.mjs \
  --base-url=https://www.zxrubbertech.com/ \
  --cloudflare-csv=cloudflare/zxrubbertech-v5-legacy-redirects.csv \
  --output="$PRODUCTION_REPORT" \
  --browser="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

Require 56/56 canonical pages, sitemap 56, robots unchanged, all language clusters, Quote wiring, and media. Require `productionRedirectRows=50` and `productionRedirectPassed=50`; every apex/www source must return exact 301, exact `Location`, preserve `?source=ja-ko-fa-release` before any fragment, and finish at HTTP 200 in the target language. Also require correct `html lang`, Persian `dir=rtl`, self canonical, one H1, nine `hreflang` links, three language groups, final HTTP 200, and zero real form submissions.

- [ ] **Step 7: Record SEO handoff**

Confirm `https://www.zxrubbertech.com/sitemap.xml` exposes 56 URLs. Record that the existing Search Console sitemap may be reread automatically. Do not resubmit it repeatedly and do not mass-request indexing.

- [ ] **Step 8: Report completion**

Return candidate/deployed SHA, archive path and SHA-256, exact counts, Reviewer and Gatekeeper evidence hashes, production results, rollback SHA, and any deferred non-blocking observations.
