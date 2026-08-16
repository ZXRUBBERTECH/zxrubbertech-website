# V5 Japanese, Korean, and Persian Multilingual Design

**Date:** 2026-08-16
**Status:** Approved
**Production baseline:** `6f84d51dac660ff1bdb5a38c7cf87dbb69a0812f`

## Objective

Extend the only production V5 site from five languages to eight by adding complete Japanese, Korean, and Iranian-standard Persian versions of all seven canonical page roles. Preserve the current production design, media, verified facts, form integration, historical redirect inventory, and English `x-default` fallback.

The implementation uses isolated multi-agent worktrees. Three catalog agents may work in parallel, while the primary agent remains the sole owner of shared configuration, checkers, generated output, candidate assembly, and deployment.

## Search Behavior Principle

- English remains the global fallback and `x-default` target.
- A visitor is never redirected by IP address, browser language, cookie, or JavaScript language detection.
- Search engines receive complete, reciprocal `hreflang` clusters and may choose the result matching the searcher's language.
- A locale becomes indexable only after its full visible page content, SEO text, navigation, runtime messages, and form guidance are localized and independently reviewed.
- Machine-generated drafts are not published directly and are not exposed in the sitemap or `hreflang` cluster before review.

## Fixed Locale Registry

| Locale ID | URL prefix | `html lang` | `hreflang` | `og:locale` | Direction | Label | Short label | Turnstile |
|---|---|---|---|---|---|---|---|---|
| `ja` | `ja` | `ja` | `ja` | `ja_JP` | `ltr` | `日本語` | `JA` | `ja` |
| `ko` | `ko` | `ko` | `ko` | `ko_KR` | `ltr` | `한국어` | `KO` | `ko` |
| `fa` | `fa` | `fa` | `fa` | `fa_IR` | `rtl` | `فارسی` | `FA` | `fa` |

Persian content uses Iranian-standard Persian. The internal ID, URL prefix, HTML language, `hreflang`, hidden form language, and Turnstile language are all `fa`. Region specificity is expressed only by `og:locale=fa_IR` and by the catalog's language standard.

## Canonical Route Matrix

Each of the eight locales exposes the same seven roles:

1. Home
2. Products
3. Rubber Compounds
4. Industries
5. Capabilities
6. FAQ
7. Quote

The three new locale route sets are:

```text
/ja/                  /ko/                  /fa/
/ja/products/         /ko/products/         /fa/products/
/ja/rubber-compounds/ /ko/rubber-compounds/ /fa/rubber-compounds/
/ja/industries/       /ko/industries/       /fa/industries/
/ja/capabilities/     /ko/capabilities/     /fa/capabilities/
/ja/faq/              /ko/faq/              /fa/faq/
/ja/quote/            /ko/quote/            /fa/quote/
```

## Fixed Acceptance Counts

| Metric | Current | Required result |
|---|---:|---:|
| Locales | 5 | 8 |
| Page roles | 7 | 7 |
| Canonical pages | 35 | 56 |
| New canonical pages | 0 | 21 |
| `hreflang` links per page | 6 | 9 |
| Total `hreflang` links | 210 | 504 |
| OG alternates per page | 4 | 7 |
| Sitemap URLs | 35 | 56 |
| Language anchors per page | 15 | 24 |
| Total language anchors | 525 | 1,344 |
| Quote pages | 5 | 8 |
| Quote runtime messages | 70 | 112 |
| Legacy fallback pages | 25 | 25 |
| Cloudflare redirect rows | 50 | 50 |
| HTTP route checks | 60 | 81 |
| Chromium page/viewport checks | 70 | 112 |

Counts derived from the locale registry must be computed rather than copied as new magic constants. Historical fallback and Cloudflare counts remain explicit fixed invariants because they describe legacy inventory rather than current locale count.

## Translation Contract

Each new catalog must match the accepted English contract:

- exactly 531 translation keys;
- exactly seven `pages` objects;
- exactly seven `seo` objects with `title`, `description`, and `breadcrumb`;
- the existing 508 localization operations: 370 HTML text, 122 attributes, and 16 JavaScript strings;
- all 12 required industrial glossary concepts;
- all five verified fact renderings;
- all 19 protected literals with occurrence counts equal to English;
- all 19 `operation.preserve` values byte-for-byte unchanged;
- no empty strings, unknown keys, missing keys, malformed JSON, or duplicate catalog identity.

Protected integration values include:

- Formspree endpoint ID `mrpzqado`;
- Turnstile Site Key `0x4AAAAAAENHOMMn_zK0WuNN`;
- `martin@zxrubbertech.com`;
- WhatsApp `+86 152 5622 5135` and its exact `wa.me` URL;
- legal company names, brand, material abbreviations, URLs, technical codes, and verified production facts.

No secret key may appear in any source, catalog, generated page, report, or archive.

## Locale-Specific Quality Rules

### Japanese

- Prose must contain Japanese script and the catalog as a whole must contain Hiragana or Katakana; Han characters alone cannot satisfy the language check.
- Half-width Katakana is rejected.
- Unapproved Hangul, Cyrillic, and Arabic-script residues are rejected.
- English residue is allowed only through the explicit protected/technical allowlist.
- Strings must be valid UTF-8 and NFC.

### Korean

- Prose must contain Hangul.
- Decomposed Hangul Jamo and non-NFC strings are rejected.
- Unapproved Hiragana, Katakana, Cyrillic, and Arabic-script residues are rejected.
- English residue is allowed only through the explicit protected/technical allowlist.

### Persian

- Prose must contain Arabic script and the catalog must demonstrate Persian-specific characters.
- Arabic Yeh `ي` and Kaf `ك` are rejected in Persian prose in favor of `ی` and `ک`, except an explicit allowlist if a genuine quotation requires them.
- Semantic ZWNJ `U+200C` is allowed; BOM, presentation forms, isolated ZWJ, and hidden bidi override/embed/isolate controls are rejected.
- Strings must be valid UTF-8 and NFC. Blind NFKC normalization is forbidden.
- Unapproved Han, Hangul, Hiragana, Katakana, and Cyrillic residues are rejected.

All three catalogs receive independent translation review. A review failure returns the catalog to its owning agent; it does not expand shared-file ownership.

## Persian RTL Contract

Persian pages use one shared template and must render:

```html
<html lang="fa" dir="rtl">
```

All other locales render `dir="ltr"`. Direction is an explicit frozen locale-registry property and is not inferred from language text.

RTL support is a scoped semantic adaptation, not a redesign:

- use `html[dir="rtl"]` selectors and logical properties for navigation, labels, menus, and content flow;
- do not mirror the logo, photography, video, map, diagrams, or decorative coordinates;
- isolate email, phone, URLs, WhatsApp, company English names, model names, and rubber material codes as LTR;
- use `dir="auto"` for user-entered name, company, and message fields;
- retain `dir="ltr"` for email and phone inputs;
- do not add new Formspree backend fields or `dirname` fields;
- remove disruptive letter spacing and uppercase behavior only within Persian natural-language text;
- preserve the existing visual hierarchy, colors, spacing system, media, Header, Footer, Logo, and map.

## SEO Contract

Every one of the 56 canonical pages must contain:

- exactly one localized H1;
- a localized title, meta description, breadcrumb, and visible content;
- a self-referencing canonical URL;
- a reciprocal nine-link `hreflang` cluster containing all eight locales plus `x-default` to English;
- the correct `og:locale` and seven `og:locale:alternate` values;
- unchanged schema policy: no unsupported `Product` or `FAQPage` rich-result claims;
- the accepted media inventory and hashes;
- current-locale internal navigation and same-page language switching;
- one unique `aria-current` locale in each language-control group.

The sitemap must contain exactly the ordered 56 canonical URLs. `robots.txt` must remain byte-identical.

## Form Contract

All eight Quote pages retain the existing backend and field inventory. New pages add only the locale value already supported by the hidden `language` field:

```html
<input type="hidden" name="language" value="ja">
<input type="hidden" name="language" value="ko">
<input type="hidden" name="language" value="fa">
```

For each new locale:

- Formspree action remains `https://formspree.io/f/mrpzqado`;
- Turnstile `data-language` matches the locale ID;
- all 14 form/runtime messages are localized;
- HTML constraint validation and the Turnstile token guard remain active;
- error states retain entered values;
- Email and WhatsApp fallbacks remain clickable;
- automated acceptance must not solve Turnstile or send a real submission.

Real submissions, Formspree settings, recipient settings, and Cloudflare Turnstile settings are outside this implementation.

## Legacy URL and Cloudflare Boundary

Japanese, Korean, and Persian had no previous production pages. Therefore they receive no legacy fallback pages and no Cloudflare redirects.

The following remain exact:

- 25 legacy fallback pages;
- 50 Cloudflare list rows;
- Cloudflare list ID `ed916c1ab3254a3481b9b6836d0e2934`;
- Cloudflare rule ID `f53197fc99e044e08950b876da162f40`;
- accepted CSV SHA-256 `8d17b3226a266ff4539cf9a6721e4854992121663aeebd60354b3e73cf76fb63`.

Retirement tooling must accept 56 current V5 canonical URLs while keeping the historical five-language fallback matrix fixed.

## Multi-Agent Ownership

### Primary Agent

The primary agent is the only writer for shared files, integration, generated pages, baseline updates, candidate assembly, archive creation, and deployment. It cannot approve its own gate.

### Catalog Agents

Each catalog agent works in an independent worktree and owns exactly one file:

- Japanese: `scripts/v5-i18n/ja.json`
- Korean: `scripts/v5-i18n/ko.json`
- Persian: `scripts/v5-i18n/fa.json`

Catalog agents may return glossary and verified-fact proposals in repo-external evidence, but they may not edit the shared glossary, registry, checkers, templates, generated pages, or another catalog.

### Reviewer

The Reviewer is read-only and validates translation meaning, terminology, facts, SEO, browser behavior, forms, RTL, deterministic output, diff scope, and evidence hashes. It returns only PASS, FAIL, or HOLD.

### Gatekeeper

The Gatekeeper is read-only and independently reruns required checks. It automatically releases a successful gate and cannot repair files, commit, push, deploy, or mutate external services.

Agents never share a writable worktree. Parallel work is restricted to non-overlapping catalog files. All shared-file changes are serial.

## Automatic Gate Authorization

The user's approval of this design authorizes normal execution through local implementation, archive creation, one non-force push of the exact accepted candidate to `main`, GitHub Pages automatic deployment, and production verification.

For an in-scope test failure, the responsible agent repairs the same approved scope, rebuilds, and returns for review without requesting user approval.

Execution enters HOLD and contacts the user only when:

- a diff exceeds the approved allowlist;
- a verified fact or business commitment is contradictory or unsupported;
- `origin/main` moves after sealing and cannot be safely fast-forwarded;
- authentication, 2FA, or external permission blocks the authorized action;
- Cloudflare, Formspree settings, GSC writes, media, visual design, or additional languages would need changes;
- the Pages artifact cannot be proven identical to the accepted candidate;
- repeated repairs cannot satisfy the gates without expanding scope.

## Gate Sequence

1. **N0 — Seal production baseline.** Bind local clean integration, `origin/main`, current Pages deployment, production routes, dirty-main fingerprint, current check results, and the accepted Cloudflare CSV hash.
2. **N1 — Generalize the eight-locale contract.** Add registry direction and dynamic count formulas. Prove current five-locale inputs fail the new contract and malformed/unknown/duplicate inputs fail closed.
3. **N2 — Freeze glossary and facts.** Catalog agents propose terminology; the primary agent serially writes the shared glossary and locale-specific validation rules.
4. **N3 — Parallel catalog creation.** Three agents create one 531-key catalog each in isolated worktrees.
5. **N4 — Catalog review and mutation tests.** Run script, residue, terminology, fact, protected-literal, encoding, normalization, and bidi-negative fixtures per locale.
6. **N5 — Shared integration and RTL.** Merge catalogs; generate language controls, SEO, forms, internal routes, `lang/dir`, and Persian-only RTL behavior in a repository-external bundle.
7. **N6 — Deterministic release and retirement.** Produce 56 pages, 504 `hreflang` links, 56 sitemap URLs, 25 fallbacks, and 50 unchanged Cloudflare rows in two byte-identical builds.
8. **N7 — Browser and HTTP acceptance.** Run 81 HTTP checks and 112 desktop/mobile Chromium checks plus targeted cross-engine RTL/Quote/menu checks. Do not submit a real form.
9. **N8 — Candidate, archive, and independent review.** Materialize generated production pages, rebuild the scope baseline, commit an atomic candidate, create the external archive and sidecar, and obtain Reviewer and Gatekeeper PASS.
10. **N9 — Deployment and production verification.** Confirm remote baseline has not moved, perform one non-force push, wait for the exact GitHub Pages commit, and verify 56 canonical pages plus all 50 historical redirects.
11. **N10 — SEO handoff.** Confirm the existing sitemap URL exposes 56 pages and record GSC monitoring guidance without submitting repeated indexing requests.

## File Boundaries

Expected shared implementation scope is limited to the current V5 locale registry, glossary, localization and SEO transforms, language controls, release/retirement builders and checkers, archive tooling, scope checker/baseline, generated canonical HTML, and `sitemap.xml`.

The following must remain byte-identical unless a gate proves a required generated-only change already described above:

- seven accepted V5 English design inputs;
- V5 media, Logo, images, videos, and map;
- `robots.txt`, `CNAME`, `.nojekyll`, and GitHub workflow;
- Formspree endpoint and field names;
- Turnstile Site Key;
- Cloudflare CSV and redirect inventory;
- 25 historical fallback pages;
- verified facts, contacts, legal names, and technical data;
- unrelated multilingual pages, product-detail history, and all non-V5 sources.

Generated HTML must never be hand-edited. Every production page change originates in the approved V5 build source and is regenerated through the release builder.

## Rollback

The rollback Git baseline is `6f84d51dac660ff1bdb5a38c7cf87dbb69a0812f`. Rollback uses a normal revert or restoration commit; force push and destructive reset are forbidden. Cloudflare requires no rollback because its list and rule are not changed by this feature.
