#!/usr/bin/env python3
"""
Regenerate sitemap.xml with international (hreflang) annotations.

Covers the 4 homepages, the products hub, and every product page, each in
en/de/zh/ru. Every <url> carries the full xhtml:link alternate cluster so
Google understands the language relationships. Run after adding pages:
  python3 scripts/build_sitemap.py
Keep the slug list in sync with scripts/build_products.py.
"""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = "https://www.zxrubbertech.com"
LASTMOD = "2026-07-12"
PREFIXES = ["", "de/", "zh/", "ru/"]  # en is ""
HREFLANGS = [("en", ""), ("de", "de/"), ("zh", "zh/"), ("ru", "ru/")]

SLUGS = [
    "suspension-bushing", "shock-absorber-dust-cover", "ball-joint-dust-cover",
    "wire-harness-sheath", "rubber-wheel",
]

# (suffix, priority, changefreq)
PAGES = [("", "1.0", "monthly"), ("products/", "0.8", "monthly")]
PAGES += [(f"products/{s}/", "0.7", "monthly") for s in SLUGS]


def alternates(suffix):
    lines = [f'    <xhtml:link rel="alternate" hreflang="{hl}" href="{SITE}/{pfx}{suffix}"/>'
             for hl, pfx in HREFLANGS]
    lines.append(f'    <xhtml:link rel="alternate" hreflang="x-default" href="{SITE}/{suffix}"/>')
    return "\n".join(lines)


def url_entry(loc, suffix, priority):
    return (f"  <url>\n    <loc>{loc}</loc>\n{alternates(suffix)}\n"
            f"    <lastmod>{LASTMOD}</lastmod>\n    <changefreq>monthly</changefreq>\n"
            f"    <priority>{priority}</priority>\n  </url>")


def main():
    out = ['<?xml version="1.0" encoding="UTF-8"?>',
           '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
           '        xmlns:xhtml="http://www.w3.org/1999/xhtml">']
    for suffix, base_pri, _ in PAGES:
        for pfx in PREFIXES:
            loc = f"{SITE}/{pfx}{suffix}"
            # homepage keeps 1.0 for en, 0.9 for localized; other pages flat
            pri = base_pri
            if suffix == "" and pfx != "":
                pri = "0.9"
            out.append(url_entry(loc, suffix, pri))
    out.append("</urlset>")
    with open(os.path.join(ROOT, "sitemap.xml"), "w", encoding="utf-8") as f:
        f.write("\n".join(out) + "\n")
    total = len(PAGES) * len(PREFIXES)
    print(f"wrote sitemap.xml with {total} url entries")


if __name__ == "__main__":
    main()
