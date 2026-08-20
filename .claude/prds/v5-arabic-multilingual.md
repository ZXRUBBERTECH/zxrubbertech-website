---
name: v5-arabic-multilingual
description: Add complete Modern Standard Arabic coverage to all seven V5 website roles.
status: backlog
created: 2026-08-20T15:24:41Z
---

# PRD: v5-arabic-multilingual

## Executive Summary

Add Modern Standard Arabic as the ninth complete V5 locale, using the same catalog, reciprocal SEO, RTL, release, review, archive, deployment, and production-acceptance workflow used for Japanese, Korean, and Persian.

The normative technical design is `docs/superpowers/specs/2026-08-20-v5-arabic-multilingual-design.md`.

## Problem Statement

The website currently supports English, German, Simplified Chinese, Russian, Turkish, Japanese, Korean, and Persian. Arabic-speaking industrial buyers have no Arabic page set and may receive an English or another-language result. A complete Arabic locale is needed so Google can index and serve Arabic URLs for Arabic-language searches.

## User Stories

### Arabic-speaking buyer

As an Arabic-speaking industrial buyer, I want every V5 page role in natural Modern Standard Arabic so that I can evaluate products, capabilities, materials, FAQs, and the quote workflow without changing language.

Acceptance criteria:

- Seven indexable `/ar/` routes exist and return the correct Arabic content.
- Navigation, SEO, validation messages, ARIA labels, and the Quote workflow are localized.
- Pages render right-to-left without mirroring media, Logo, or map.

### Search crawler

As a search crawler, I need self-canonical Arabic URLs and complete reciprocal language clusters so that Arabic pages can be indexed and selected for Arabic queries.

Acceptance criteria:

- Every page has ten exact reciprocal `hreflang` links including English `x-default`.
- The sitemap contains 63 unique canonical URLs.
- No browser-language or IP redirect prevents crawling.

### Site operator

As the site operator, I need Arabic to use the established deterministic release process without changing business facts, services, media, forms, or historical redirects.

Acceptance criteria:

- Existing eight-language catalogs and protected facts remain unchanged.
- The 25 fallback pages and 50 Cloudflare rows remain byte-identical.
- The archive, Pages artifact, and production site match the accepted candidate.
- No real form submission occurs during testing.

## Functional Requirements

1. Register region-neutral `ar` with the locale settings specified in the normative design.
2. Provide all seven Arabic canonical routes.
3. Create a complete 531-key Arabic catalog with the frozen glossary, facts, and literals.
4. Apply shared RTL layout behavior with Arabic-specific character validation.
5. Include Arabic in all language controls, canonical clusters, `hreflang`, Open Graph alternates, sitemap, schema language, internal routes, and Quote locale fields.
6. Preserve historical redirects and external service identifiers.
7. Materialize only accepted generated pages and sitemap.
8. Archive, non-force push, verify Pages, and perform read-only production acceptance after independent Reviewer and Gatekeeper approval.

## Non-Functional Requirements

- Builds are deterministic and fail closed on missing, duplicate, malformed, or unexpected inputs.
- Arabic is valid UTF-8, NFC-normalized Modern Standard Arabic with no Persian-character contamination or hidden bidi controls.
- Desktop and mobile layouts have no horizontal or local overflow.
- Browser acceptance uses the committed 45-second concurrent lazy-image readiness contract and still rejects broken images.
- All temporary files and browser profiles stay outside the repository and are cleaned on success or failure.
- Agents use isolated worktrees and exact file allowlists.

## Success Criteria

- Registry reports `9 locales / 7 roles / 63 routes / 10 hreflang values`.
- Release reports `63 pages / 630 hreflang links / 63 sitemap URLs`.
- Local acceptance passes 88 HTTP routes, 126 viewports, 28 RTL viewports, nine Quote workflows, zero redirect rows, and zero form requests.
- Production acceptance passes the same page and browser matrix plus all 50 Cloudflare redirects, with zero form requests.
- Protected scope first hardens the current eight-language production inventory from 923 to 928 entries, then finishes with 935 entries and no unexpected, modified, or missing files.
- The final archive and Pages artifact match the accepted deterministic release.

## Constraints & Assumptions

- Arabic means region-neutral Modern Standard Arabic.
- `og:locale` uses `ar_SA` only as valid Open Graph serialization; Google targeting remains `ar`.
- English remains `x-default`.
- Production baseline and rollback revision are `1e0c849355c7bf3774db565d6c7a10c01d3522eb`.
- Implementation starts from the validated QA foundation `8d09537b6d810e03b7693b998dd624dce509b6e3`.
- Existing verified business facts are authoritative; no certifications, specifications, prices, or claims are invented.

## Out of Scope

- Saudi, Emirati, Egyptian, or other country-specific Arabic variants.
- Arabic dialect pages.
- New Arabic legacy redirects or Cloudflare rows.
- Cloudflare, Turnstile, Formspree, or Search Console configuration changes.
- Real CAPTCHA completion or form submission.
- New products, articles, certifications, specifications, facts, media, contacts, or unrelated layout redesign.
- Repeated sitemap submission or mass URL indexing requests.

## Dependencies

- Existing V5 English catalog and 508-operation transformation contract.
- Existing release, retirement, archive, acceptance, SEO, and scope checkers.
- Existing eight-language production plus the validated QA foundation containing the lazy-image acceptance fix.
- Independent Arabic terminology, catalog, Reviewer, and Gatekeeper agents.
