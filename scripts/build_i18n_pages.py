#!/usr/bin/env python3
"""
Pre-render per-language static pages for SEO.

Reads the English source `index.html` (which contains the JS i18n dictionary
and English fallback text) and generates fully-localized static pages at
/de/index.html, /zh/index.html, /ru/index.html. Each generated page bakes the
translated text into the HTML (so crawlers get real localized content instead
of JS-swapped text), sets the correct <html lang>, localized <title>/meta/OG,
a self-referencing canonical, and marks its own language active in the switcher.

The reciprocal hreflang block already lives in the source <head> and is copied
verbatim into every page.

Regenerate after editing content:  python3 scripts/build_i18n_pages.py
Requires the i18n JSON produced by scripts/extract_i18n.mjs.
"""
import json, os, re, sys
from bs4 import BeautifulSoup

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = "https://www.zxrubbertech.com"

LANGS = {
    "de": {"html_lang": "de",    "locale": "de_DE"},
    "zh": {"html_lang": "zh-CN", "locale": "zh_CN"},
    "ru": {"html_lang": "ru",    "locale": "ru_RU"},
    "tr": {"html_lang": "tr",    "locale": "tr_TR"},
}

SKIP_PREFIX = ("http://", "https://", "//", "/", "#", "mailto:", "tel:", "data:", "javascript:")


def clip(text, limit=160):
    text = " ".join(text.split())
    if len(text) <= limit:
        return text
    cut = text[:limit]
    sp = cut.rfind(" ")
    return (cut[:sp] if sp > 40 else cut).rstrip(" ,.;:") + "…"


def build(lang, cfg, src_html, i18n):
    tr = i18n[lang]
    soup = BeautifulSoup(src_html, "html.parser")

    soup.html["lang"] = cfg["html_lang"]

    # Bake translations into every data-i18n element (mirrors runtime setLang).
    for el in soup.select("[data-i18n]"):
        key = el.get("data-i18n")
        if key not in tr:
            continue
        val = tr[key]
        if el.name in ("input", "textarea"):
            el["placeholder"] = val
        else:
            el.clear()
            el.append(val)

    # Make relative asset URLs (mainly <img src>) root-absolute so they resolve
    # from the /xx/ sub-directory.
    for el in soup.find_all(src=True):
        v = el["src"]
        if v and not v.startswith(SKIP_PREFIX):
            el["src"] = "/" + v
    for el in soup.find_all(href=True):
        v = el["href"]
        if v and not v.startswith(SKIP_PREFIX):
            el["href"] = "/" + v

    # Keep visitors in their language: rewrite internal product links
    # /products/... -> /<lang>/products/... on the localized pages.
    for a in soup.find_all("a", href=True):
        if a["href"].startswith("/products/"):
            a["href"] = f"/{lang}{a['href']}"

    page_url = f"{SITE}/{lang}/"
    title = f"ZHIXIN RUBBER TECH | {tr.get('hero.title', '')}".strip(" |")
    desc = clip(tr.get("hero.desc", ""))

    def set_meta(attr, name, value):
        m = soup.find("meta", attrs={attr: name})
        if m:
            m["content"] = value

    if soup.title:
        soup.title.string = title
    set_meta("name", "description", desc)
    set_meta("property", "og:title", title)
    set_meta("property", "og:description", desc)
    set_meta("property", "og:url", page_url)
    set_meta("property", "og:locale", cfg["locale"])
    set_meta("name", "twitter:title", title)
    set_meta("name", "twitter:description", desc)

    can = soup.find("link", rel="canonical")
    if can:
        can["href"] = page_url

    # Active state in the language switcher.
    for a in soup.select(".lang-dropdown a"):
        classes = a.get("class", [])
        hl = a.get("hreflang")
        if hl == lang:
            if "active" not in classes:
                classes.append("active")
        elif "active" in classes:
            classes.remove("active")
        a["class"] = classes

    out_dir = os.path.join(ROOT, lang)
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, "index.html"), "w", encoding="utf-8") as f:
        f.write(str(soup))
    return page_url


def main():
    with open(os.path.join(ROOT, "index.html"), encoding="utf-8") as f:
        src_html = f.read()
    i18n_path = os.environ.get("I18N_JSON")
    if not i18n_path or not os.path.exists(i18n_path):
        sys.exit("Set I18N_JSON to the path produced by extract_i18n.mjs")
    with open(i18n_path, encoding="utf-8") as f:
        i18n = json.load(f)
    for lang, cfg in LANGS.items():
        url = build(lang, cfg, src_html, i18n)
        print(f"generated {lang}/index.html  ->  {url}")


if __name__ == "__main__":
    main()
