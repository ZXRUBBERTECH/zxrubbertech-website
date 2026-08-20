# V5 Modern Standard Arabic Expansion Design

**Date:** 2026-08-20

**Status:** Approved approach, pending written-spec review

**Production baseline:** `1e0c849355c7bf3774db565d6c7a10c01d3522eb`

**Implementation foundation:** `8d09537b6d810e03b7693b998dd624dce509b6e3`

## 1. Goal

Add a complete Modern Standard Arabic (`ar`) version of all seven V5 page roles by following the same catalog, release, review, archive, deployment, and production-acceptance process used for Japanese, Korean, and Persian.

Arabic is a complete ninth locale, not a translated header or a single landing page. The public routes are:

- `/ar/`
- `/ar/products/`
- `/ar/rubber-compounds/`
- `/ar/industries/`
- `/ar/capabilities/`
- `/ar/faq/`
- `/ar/quote/`

The pages target Arabic-speaking industrial buyers across the Middle East. They use region-neutral Modern Standard Arabic. No country-specific Saudi, Emirati, or Egyptian content variants are created.

## 2. Selected Approach

The selected approach is a registry-driven ninth locale integrated into the existing V5 release system.

Rejected alternatives:

1. An Arabic homepage only would create incomplete language navigation, thin content, and broken reciprocal `hreflang` clusters.
2. Separate country or dialect variants would add duplicated content and unsupported market assumptions.
3. Automatic browser-language or IP redirects would interfere with crawling and user choice.

English remains `x-default`. Language changes use real links. No automatic locale redirect is introduced.

## 3. Locale Contract

The locale registry gains exactly this ordered entry after `fa`:

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
})
```

`ar_SA` is only the valid Open Graph `language_TERRITORY` serialization used for social metadata. Google language targeting stays region-neutral through `lang="ar"` and `hreflang="ar"`; no Saudi-only content or geo-targeting is implied.

The localized language-control label is `اللغة`.

## 4. Exact Release Metrics

The complete release contract becomes:

| Metric | Required value |
|---|---:|
| Locales | 9 |
| Page roles per locale | 7 |
| Canonical pages | 63 |
| `hreflang` links per page | 10 |
| Total `hreflang` links | 630 |
| OG locale alternates per page | 8 |
| Sitemap URLs | 63 |
| Language-control groups per page | 3 |
| Language anchors per page | 27 |
| Total language anchors | 1,701 |
| Quote pages | 9 |
| Quote runtime-message checks | 126 |
| Local/production HTTP routes | 88 |
| Browser viewport checks | 126 |
| RTL viewport checks | 28 (`fa` 14 + `ar` 14) |
| Historical fallback pages | 25 |
| Cloudflare CSV rows | 50 |
| Complete release files | 528 |
| Pages deployment subset | 527 |
| Protected scope entries | 935 |

Route, SEO, control, form, and browser matrix counts are derived from the frozen locale registry and seven-role inventory. Historical redirects remain a deliberately frozen matrix. Release-file count `528`, Pages subset count `527`, and protected-scope count `935` are sealed inventory constants that must also be proven from exact path manifests rather than accepted from arithmetic alone.

## 5. Historical URL and Cloudflare Boundary

Arabic has no historical production URLs. Therefore it has no legacy product fallback pages and no Cloudflare redirect rows.

The existing historical matrix remains exactly:

- 25 fallback pages for `en`, `de`, `zh-CN`, `ru`, and `tr`
- 50 apex/www Cloudflare CSV rows
- accepted CSV SHA-256 `8d17b3226a266ff4539cf9a6721e4854992121663aeebd60354b3e73cf76fb63`

This is the same rule already used for Japanese, Korean, and Persian. It does not remove or suppress Arabic public links; the seven new `/ar/` canonical routes are normal indexable pages.

## 6. Catalog and Terminology Contract

Create `scripts/v5-i18n/ar.json` with the exact English catalog topology:

- 531 localized content keys
- 508 transformation operations
- seven page groups
- seven SEO groups with `title`, `description`, and `breadcrumb`
- all Quote validation and runtime messages
- 19 protected literals at exact occurrence counts
- five verified facts at exact occurrence counts
- 12 required industrial glossary terms

Preferred Modern Standard Arabic terminology:

| English | Arabic |
|---|---|
| rubber compound | خلطة مطاطية |
| molded rubber parts | أجزاء مطاطية مقولبة |
| rubber-to-metal bonding | ربط المطاط بالمعدن |
| compression molding | القولبة بالضغط |
| injection molding | القولبة بالحقن |
| extrusion | البثق |
| tooling | القوالب وأدوات الإنتاج |
| traceability | قابلية التتبع |
| batch release | اعتماد الدفعة الإنتاجية |
| drawing | رسم فني |
| sample | عينة |
| project requirements | متطلبات المشروع |

`batch release` always means quality approval of a production batch. It must never be translated as shipping, dispatch, or warehouse release.

Verified fact renderings are frozen as:

```text
annualCompoundCapacity: حوالي ٣٬٠٠٠ طن متري
annualMoldedComponents: أكثر من ١٥ مليون قطعة مطاطية مقولبة في السنة
inquiryAcknowledgement: خلال ٢٤ ساعة
regularCompoundMoq: ٢ طن متري
quotationWindow: من ٢ إلى ٧ أيام عمل
```

Every occurrence of the 24-hour fact means acknowledgement of receipt, not a complete technical or commercial response.

The exact verified-fact occurrence counts are `1 / 1 / 4 / 1 / 1` in the order shown above.

## 7. Arabic Unicode and Language Quality

Arabic and Persian share RTL layout but must not share their language-specific character validator.

Arabic prose must:

- be valid UTF-8 without a BOM and be NFC-normalized;
- contain Arabic-script Modern Standard Arabic;
- use Arabic Yeh `ي` (U+064A) and Arabic Kaf `ك` (U+0643);
- use Arabic-Indic digits `٠١٢٣٤٥٦٧٨٩` in the frozen fact renderings;
- reject Persian Yeh `ی`, Persian Kaf `ک`, Persian digits, and the Persian-specific letters `پ چ ژ گ`;
- reject Arabic presentation forms, U+061C, U+200E, U+200F, U+202A–U+202E, U+2066–U+2069, ZWJ U+200D, ZWNJ U+200C, tatweel U+0640, and foreign-script residue;
- reject unapproved English residue, placeholders, TODO text, Arabizi, dialect-only wording, and machine-translation artifacts.

ASCII technical literals, brand names, abbreviations, email, phone, and URLs remain unchanged. Visible mixed-direction literals are isolated with semantic `<bdi dir="ltr">` markup; hidden direction-control characters are forbidden.

An Arabic catalog author may modify only `scripts/v5-i18n/ar.json` in an isolated worktree. An independent non-author Reviewer performs a full 531-key language review covering terminology, facts, SEO, ARIA, placeholders, runtime messages, and natural industrial MSA. Automated checks alone cannot approve the catalog.

Before independent Reviewer PASS, any machine-assisted or unreviewed Arabic draft may exist only outside the integration repository or in the isolated Arabic author worktree and its preview/noindex fixtures. It must not be merged into integration or enter a release, materialization, sitemap, archive, Pages artifact, or production commit.

## 8. Shared RTL Architecture

Refactor the Persian-specific RTL transform into a shared RTL transform selected by the locale registry's `direction` field while retaining locale-specific language validation and approved LTR-literal handling.

Both `fa` and `ar` must have:

- `<html lang="..." dir="rtl">`;
- logical CSS properties and `text-align:start` for semantic text flows;
- natural-language labels without forced uppercase or letter spacing;
- `name`, `company`, and `message` fields with `dir="auto"`;
- `email` and `phone` fields with `dir="ltr"`;
- no `dirname` fields;
- keyboard and focus order consistent with the actual DOM.

RTL must not mirror the Logo, photos, videos, product media, map, map marker, or decorative geometry. The transform remains deterministic and refuses duplicate RTL markers or pre-existing bidi wrappers.

## 9. Language Controls, SEO, and Form

Every one of the 63 pages receives three language-control groups with nine real same-role links. Each group has one exact `aria-current` entry. The Arabic language label is localized in desktop, mobile, and footer controls.

Each page must have:

- a self-referencing canonical URL;
- ten reciprocal `hreflang` links: nine locales plus English `x-default`;
- localized `title`, meta description, breadcrumb, and `inLanguage`;
- one locale-specific `og:locale` and eight unique alternates;
- same-language internal links;
- unchanged media and approved schema restrictions.

The Arabic Quote page keeps the existing backend contract and adds only the normal locale values:

- hidden `language="ar"`;
- Turnstile `data-language="ar"`;
- unchanged Formspree endpoint `https://formspree.io/f/mrpzqado`;
- unchanged Turnstile Site Key `0x4AAAAAAENHOMMn_zK0WuNN`;
- unchanged field names, contact details, and validation behavior.

These current V5 values take precedence over the historical Formspree value still present in the legacy `AGENTS.md` description.

No real form submission or CAPTCHA completion is allowed during testing.

## 10. Multi-Agent Ownership and Gates

The main Agent owns all shared files and integration. No two writing Agents share a worktree.

Before A0, documentation is sealed in two clean commits based on the code foundation `8d09537b6d810e03b7693b998dd624dce509b6e3`:

1. a design commit containing only `.claude/prds/v5-arabic-multilingual.md` and `docs/superpowers/specs/2026-08-20-v5-arabic-multilingual-design.md`;
2. after user review, a plan commit containing only `docs/superpowers/plans/2026-08-20-v5-arabic-multilingual.md`.

A0 starts from the clean plan commit, records both documentation commit SHAs, and proves that the only changes since the code foundation are those three documentation paths.

1. **A0 — Baseline seal and scope hardening:** freeze production `1e0c849...`, foundation `8d09537...`, remote, archive, CSV, protected files, and dirty-main fingerprint. Add the five currently omitted English canonical role roots to scope, prove the old 923-entry baseline reports exactly five unexpected paths with no missing or modified files, then rebuild the current-production baseline to exactly 928 entries before Arabic work starts.
2. **A1 — Registry and control-label parity:** add `ar` and exact `ar: 'اللغة'` to the frozen language-control labels in the same atomic Gate, because `v5-i18n-transform.mjs` imports the language-control module at load time and that module requires exact registry/label key parity. Then prove the expected missing-catalog red state and run registry mutations.
3. **A2 — Terminology and QA contract:** an Arabic terminology author proposes 12 terms and five facts; a different Reviewer approves them; the main Agent integrates glossary and Unicode/RTL checks.
4. **A3 — Catalog:** an isolated author creates only `ar.json`; an independent Reviewer returns precise key-level corrections until PASS.
5. **A4 — Catalog integration:** the main Agent imports the approved catalog and runs all Arabic and existing-locale mutations.
6. **A5 — Release behavior:** regress the already-registered nine-language controls and integrate SEO, forms, shared RTL, and the acceptance schema.
7. **A6 — Release tooling:** update deterministic release, retirement, archive, mutation, and scope contracts while preserving historical redirects.
8. **A7 — Local acceptance:** test 88 HTTP routes, 126 Chromium viewports, 28 RTL viewports, all interactions, and zero form submissions.
9. **A8 — Materialization:** copy only accepted generated pages and sitemap, rebuild the protected baseline, and create the candidate commit.
10. **A9 — Release:** create a unique archive, obtain independent Reviewer and Gatekeeper PASS, perform one non-force push, verify the exact Pages artifact, and run production acceptance.
11. **A10 — SEO handoff:** verify the live 63-URL sitemap and provide read-only Search Console monitoring guidance.

Ordinary implementation or translation failures return to the responsible Agent. Gatekeepers automatically release the next gate when evidence is PASS with `failures=[]`.

HOLD is limited to remote movement, dirty-main drift, unauthorized file expansion, business-fact conflict, authentication or external-permission requirements, artifact mismatch, or a required change to Cloudflare, Formspree, Turnstile settings, Search Console, media, contacts, or unrelated layouts.

### 10.1 Exact Gate File Ownership

The following implementation allowlists are exact. A Gate may modify a listed file even if an earlier Gate also modified it, but it may not add another path without a documented HOLD and a new design decision.

- **A0 scope hardening:** `scripts/check-v5-scope.mjs`, `scripts/v5-protected-baseline.json`.
- **A1 registry and control-label parity:** `scripts/v5-i18n-config.mjs`, `scripts/v5-language-controls.mjs`, `scripts/check-v5-i18n.mjs`, `scripts/check-v5-i18n-mutations.mjs`.
- **A2 terminology and QA contract:** `scripts/v5-i18n/glossary.json`, `scripts/v5-i18n-transform.mjs`, `scripts/check-v5-i18n.mjs`, `scripts/check-v5-i18n-mutations.mjs`.
- **A3 catalog author:** only `scripts/v5-i18n/ar.json` in its isolated catalog worktree.
- **A4 catalog integration:** only `scripts/v5-i18n/ar.json`, imported byte-identically from the independently approved catalog commit. Integration binds the author commit, catalog file SHA-256, checker evidence SHA-256, and Reviewer evidence SHA-256. Manual conflict resolution or catalog rewriting is forbidden.
- **A5 release behavior:** `scripts/v5-i18n-transform.mjs`, `scripts/check-v5-i18n.mjs`, `scripts/check-v5-seo.mjs`, `scripts/check-v5-acceptance.mjs`, `scripts/check-v5-i18n-mutations.mjs`; `scripts/v5-language-controls.mjs` is a byte-identical regression input at this Gate.
- **A6 release tooling:** `scripts/archive-v5.mjs`, `scripts/build-v5-retirement.mjs`, `scripts/check-v5-retirement.mjs`, `scripts/check-v5-i18n-mutations.mjs`, `scripts/check-v5-scope.mjs`.
- **A8 materialization:** exactly the registry-derived 63 canonical `index.html` files, `sitemap.xml`, and `scripts/v5-protected-baseline.json`.
- **A7, A9, and A10:** no repository diff. A7 and A10 are read-only validation; A9 creates only repository-external archive/evidence before the authorized external push.

`scripts/build-v5-release.mjs`, `scripts/v5-seo-transform.mjs`, and `scripts/v5-retirement-map.mjs` are expected to remain unchanged because they are registry-driven; their behavior is still covered by every full regression and negative test.

The main Agent integrates work but never approves its own Gate. The Arabic author, language Reviewer, technical Reviewer, and Gatekeeper are separate roles. Reviewers and Gatekeepers are read-only and independent of each other. Every formal evidence file is created outside the repository with exclusive-create semantics, records its SHA-256, has `status: "PASS"`, `failures: []`, and is never overwritten.

## 11. Deterministic Build, Scope, and Archive

Two empty-directory full builds must produce byte-identical 528-file manifests. Single-locale Arabic output remains valid for catalog QA but is rejected by retirement and archive workflows.

The historical redirect system remains 25 fallback pages and 50 CSV rows. A complete local acceptance root contains 63 canonical pages plus those 25 fallback pages, producing 88 HTTP routes.

Materialization copies only the 63 canonical HTML files and `sitemap.xml` from the accepted bundle. The A0-hardened 928-entry baseline must then fail with exactly:

- `unexpected=7` for the seven new Arabic routes;
- `modified=57` for all 56 existing canonical HTML files plus `sitemap.xml`;
- `missing=0`.

The new baseline contains 935 protected entries. Generated HTML is never hand-edited.

The archive path is exactly `/Users/ren/Documents/zxrubbertech-website/存档/zxrubbertech-v5-ar-release-candidate-2026-08-20-rc1.zip`; its sidecar path is exactly `/Users/ren/Documents/zxrubbertech-website/存档/zxrubbertech-v5-ar-release-candidate-2026-08-20-rc1.zip.sha256`. Archive, sidecar, and archive evidence use exclusive-create semantics. If either archive target already exists, the workflow enters HOLD; it may not overwrite, delete, or rename the target to `rc2`. Its rollback revision remains the current production content commit `1e0c849355c7bf3774db565d6c7a10c01d3522eb`. The local QA-only image-wait commit is included in the final fast-forward feature history but is not pushed separately.

## 12. Acceptance and Failure Tests

Required positive checks include:

- registry `9/7/63/10`;
- all nine catalogs `531/508`, glossary, facts, literals, encoding, and language QA;
- release `9/63/630/63`;
- controls `3 × 9 = 27` anchors per page;
- Quote `9` pages and `126` runtime checks;
- SEO, schema, canonical, reciprocal `hreflang`, internal links, and media hashes;
- retirement `63/25/25/50/63` with unchanged CSV SHA;
- deterministic 528-file manifests;
- local acceptance: `88/88` HTTP, `126/126` browser checks, `28/28` RTL checks, `redirect rows=0`, and zero Formspree requests;
- production acceptance: `88/88` HTTP, the separate `50/50` Cloudflare redirect matrix, `126/126` browser checks, `28/28` RTL checks, and zero Formspree requests;
- cleanup of browser, server, and temporary profile on success or failure.

Fail-closed mutations cover:

- unknown, duplicate, or misordered locale registry entries;
- missing, duplicate, malformed, BOM, or invalid UTF-8 Arabic catalog;
- Persian characters or digits in Arabic, presentation forms, foreign script, and English residue;
- separate mutations for U+061C, U+200E, U+200F, each class U+202A–U+202E and U+2066–U+2069, ZWJ U+200D, ZWNJ U+200C, and tatweel U+0640;
- changed facts, protected literals, glossary terms, or `batch release` meaning;
- missing or duplicate language anchors and incorrect `aria-current`;
- cross-language canonical, missing/extra `hreflang`, English internal-link leakage, or extra DOM;
- missing `dir="rtl"`, unsafe mirrored media/map/logo, or incorrect form directions;
- wrong Turnstile language, hidden locale, Formspree endpoint, Site Key, or backend field;
- unexpected Arabic legacy fallback or Cloudflare row;
- incomplete release, manifest drift, archive identity mismatch, or modified rollback revision;
- a deliberately broken lazy image, which must still fail after the accepted 45-second concurrent image wait.

## 13. Deployment and Search Console Boundary

After archive Reviewer and Gatekeeper PASS, one non-force push updates `main`; GitHub Pages must deploy the exact candidate SHA. The deployed artifact must be the exact 527-file publishable subset of the accepted 528-file release.

The user's instruction to add Arabic, together with the existing no-per-Gate workflow authorization, covers isolated worktrees, local commits, exclusive archive creation, one exact non-force push after Gatekeeper PASS, automatic GitHub Pages deployment, and read-only production acceptance. It does not authorize Cloudflare, Formspree, Turnstile, or Search Console writes, real form submission, or archive overwrite. Immediately before the push, both local `origin/main` and `git ls-remote` must still equal `1e0c849355c7bf3774db565d6c7a10c01d3522eb`; otherwise the workflow enters HOLD.

Production acceptance is read-only. It does not change Cloudflare, Formspree, Turnstile settings, or Search Console, and it never sends a form.

The existing domain property and existing `https://www.zxrubbertech.com/sitemap.xml` remain authoritative. The sitemap naturally changes from 56 to 63 URLs. It is not repeatedly resubmitted, and the seven Arabic pages are not mass-submitted for indexing.

## 14. Success Criteria

The work is complete only when:

1. all seven Arabic pages are natural, complete Modern Standard Arabic;
2. the independent Arabic Reviewer and every automated gate pass;
3. existing eight-language catalogs, business facts, contacts, services, media, historical redirects, and protected inputs remain unchanged except for registry-driven multilingual metadata and controls;
4. the deterministic archive, Pages artifact, and production site match the accepted candidate;
5. local acceptance passes all 88 routes and 126 browser viewports with 28 RTL viewports and zero submissions, and production acceptance additionally passes all 50 Cloudflare redirects;
6. the live sitemap contains exactly 63 canonical URLs.
