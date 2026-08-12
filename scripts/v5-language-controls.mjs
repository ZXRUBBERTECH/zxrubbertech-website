import { SEO_BASE_URL } from './v5-seo-config.mjs';
import { getLocalizedRoute, V5_LOCALES, V5_PAGE_STEMS } from './v5-i18n-config.mjs';

export const V5_LANGUAGE_ALLOWED_FRAGMENTS = Object.freeze(new Set([
  'c-automotive',
  'c-sealing',
  'c-appliance',
  'c-industrial',
  'c-industrial-diaphragms',
  'compound-primary',
  'contact',
]));

export const V5_LANGUAGE_ALLOWED_QUERY_KEYS = Object.freeze(new Set(['industry']));

const CONTROL_STYLE = `
/* V5:LANGUAGE CONTROLS START */
.v5-language-switcher{position:relative;flex:none}
.v5-language-switcher .v5-language-switcher__button{display:flex;align-items:center;gap:6px;background:none;border:1px solid var(--line);border-radius:2px;color:var(--ink-dim);padding:8px 10px;cursor:pointer;transition:color .25s,border-color .25s}
.v5-language-switcher .v5-language-switcher__button b{font:700 12px/1 ui-monospace,Menlo,monospace;letter-spacing:.1em}
.v5-language-switcher .v5-language-switcher__button i{font-style:normal;font-size:8px;opacity:.7;transition:transform .25s}
.v5-language-switcher .v5-language-switcher__button:hover,.v5-language-switcher .v5-language-switcher__button:focus-visible,.v5-language-switcher[data-open="true"] .v5-language-switcher__button{color:var(--ink);border-color:var(--accent)}
.v5-language-switcher .v5-language-switcher__button:focus-visible,.v5-language-switcher .v5-language-switcher__menu a:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
.v5-language-switcher[data-open="true"] .v5-language-switcher__button i{transform:rotate(180deg)}
.v5-language-switcher .v5-language-switcher__menu{position:absolute;top:calc(100% + 12px);right:0;z-index:80;min-width:172px;background:rgba(14,21,34,.97);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);border:1px solid var(--line);border-radius:3px;padding:6px;box-shadow:0 18px 50px rgba(0,0,0,.5)}
.v5-language-switcher .v5-language-switcher__menu[hidden]{display:none}
.v5-language-switcher .v5-language-switcher__menu a{display:block;width:100%;color:var(--ink-dim);font-size:13.5px;line-height:1.3;padding:9px 12px;border-radius:2px;transition:background .2s,color .2s}
.v5-language-switcher .v5-language-switcher__menu a:hover,.v5-language-switcher .v5-language-switcher__menu a:focus-visible{background:rgba(255,255,255,.06);color:var(--ink)}
.v5-language-switcher .v5-language-switcher__menu a[aria-current="page"]{color:var(--accent)}
.v5-language-switcher .v5-language-switcher__menu a[aria-current="page"]::after{content:"✓";float:right;font-size:11px}
.v5-language-mobile{position:static;inset:auto;z-index:auto;display:flex;flex-wrap:wrap;gap:8px;margin-top:28px;padding-top:22px;border-top:1px solid var(--line)}
.v5-language-mobile a{display:inline-block;color:var(--ink-dim);border:1px solid var(--line);border-radius:99px;font-size:13px;font-weight:600;line-height:1.2;padding:8px 14px;transition:color .25s,border-color .25s}
.v5-language-mobile a:hover,.v5-language-mobile a:focus-visible{color:var(--ink);border-color:var(--accent)}
.v5-language-mobile a:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
.v5-language-mobile a[aria-current="page"]{color:var(--accent);border-color:var(--accent)}
.v5-language-footer{position:static;inset:auto;z-index:auto;display:flex;justify-content:flex-end;align-items:center;flex-wrap:wrap;gap:8px 14px;padding:20px 0 0;border-top:1px solid var(--line);color:#6f7d90;font-size:12px;line-height:1.5}
.v5-language-footer>span{color:var(--ink-dim)}
.v5-language-footer a{color:#b9c4d3;text-decoration:none}
.v5-language-footer a:hover,.v5-language-footer a:focus-visible{color:var(--accent)}
.v5-language-footer a:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
.v5-language-footer a[aria-current="page"]{color:var(--accent);text-decoration:underline;text-underline-offset:4px}
@media(max-width:1139px){.v5-language-switcher{display:none}}
@media(max-width:620px){.v5-language-footer{justify-content:flex-start;gap:8px 12px}}
/* V5:LANGUAGE CONTROLS END */
`;

const CONTROL_SCRIPT = `
<!-- V5:LANGUAGE SCRIPT START -->
<script>
(()=>{
  const root=document.querySelector('.v5-language-switcher');
  if(root){
    const button=root.querySelector('.v5-language-switcher__button');
    const menu=root.querySelector('.v5-language-switcher__menu');
    const items=[...menu.querySelectorAll('a[data-language-link]')];
    const setOpen=(open,{focusItem=false,restoreFocus=false}={})=>{
      root.dataset.open=String(open);
      button.setAttribute('aria-expanded',String(open));
      menu.hidden=!open;
      if(open&&focusItem)items[0]?.focus();
      if(!open&&restoreFocus)button.focus();
    };
    button.addEventListener('click',()=>setOpen(menu.hidden));
    button.addEventListener('keydown',event=>{
      if(event.key==='ArrowDown'){
        event.preventDefault();
        setOpen(true,{focusItem:true});
      }
      if(event.key==='Escape')setOpen(false);
    });
    menu.addEventListener('keydown',event=>{
      const index=items.indexOf(document.activeElement);
      if(event.key==='Escape'){
        event.preventDefault();
        setOpen(false,{restoreFocus:true});
      }else if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
        event.preventDefault();
        const next=event.key==='Home'?0:event.key==='End'?items.length-1:
          (index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;
        items[next]?.focus();
      }
    });
    document.addEventListener('click',event=>{
      if(!root.contains(event.target))setOpen(false);
    });
  }

  const allowedFragments=new Set(${JSON.stringify([...V5_LANGUAGE_ALLOWED_FRAGMENTS])});
  const current=new URL(window.location.href);
  document.querySelectorAll('a[data-language-link]').forEach(link=>{
    const target=new URL(link.getAttribute('href'),window.location.origin);
    if(target.pathname.endsWith('/quote/')){
      const industry=current.searchParams.get('industry');
      if(industry)target.searchParams.set('industry',industry);
    }
    const fragment=current.hash.slice(1);
    if(allowedFragments.has(fragment))target.hash=fragment;
    link.setAttribute('href',target.pathname+target.search+target.hash);
  });
})();
</script>
<!-- V5:LANGUAGE SCRIPT END -->
`;

function assertLocaleAndStem(locale, stem) {
  if (!Object.hasOwn(V5_LOCALES, locale)) throw new Error(`Unsupported V5 locale: ${String(locale)}`);
  if (!V5_PAGE_STEMS.includes(stem)) throw new Error(`Unknown V5 page stem: ${String(stem)}`);
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function languageAnchors(activeLocale, stem, { role = null } = {}) {
  return Object.entries(V5_LOCALES).map(([locale, definition]) => {
    const attributes = [
      `href="${escapeHtml(getLocalizedRoute(locale, stem))}"`,
      `hreflang="${escapeHtml(definition.hreflang)}"`,
      `lang="${escapeHtml(definition.htmlLang)}"`,
      `data-language-link`,
      `data-locale="${escapeHtml(locale)}"`,
      ...(role ? [`role="${role}"`] : []),
      ...(locale === activeLocale ? ['aria-current="page"'] : []),
    ];
    return `<a ${attributes.join(' ')}>${escapeHtml(definition.label)}</a>`;
  }).join('\n');
}

function desktopControl(locale, stem) {
  const active = V5_LOCALES[locale];
  return `<!-- V5:LANGUAGE DESKTOP START -->
      <div class="v5-language-switcher" data-open="false">
        <button class="v5-language-switcher__button" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="v5-language-menu" aria-label="Language: ${escapeHtml(active.label)}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></svg><b>${escapeHtml(active.shortLabel)}</b><i aria-hidden="true">▾</i></button>
        <div class="v5-language-switcher__menu" id="v5-language-menu" role="menu" hidden>
${languageAnchors(locale, stem, { role: 'menuitem' }).split('\n').map((line) => `          ${line}`).join('\n')}
        </div>
      </div>
<!-- V5:LANGUAGE DESKTOP END -->`;
}

function mobileControl(locale, stem) {
  return `<!-- V5:LANGUAGE MOBILE START -->
  <nav class="v5-language-mobile" aria-label="Language">
${languageAnchors(locale, stem).split('\n').map((line) => `    ${line}`).join('\n')}
  </nav>
<!-- V5:LANGUAGE MOBILE END -->`;
}

function footerControl(locale, stem) {
  return `<!-- V5:LANGUAGE FOOTER START -->
    <nav class="v5-language-footer" aria-label="Language">
      <span>Language:</span>
${languageAnchors(locale, stem).split('\n').map((line) => `      ${line}`).join('\n')}
    </nav>
<!-- V5:LANGUAGE FOOTER END -->`;
}

function replaceExact(html, from, to, expected, label) {
  const count = html.split(from).length - 1;
  if (count !== expected) throw new Error(`${label}: expected ${expected} matches, found ${count}`);
  return html.replaceAll(from, to);
}

function replaceRegexOptional(html, pattern, replacement, label) {
  const matches = [...html.matchAll(pattern)];
  if (matches.length > 1) throw new Error(`${label}: expected at most 1 match, found ${matches.length}`);
  return matches.length === 1 ? html.replace(pattern, replacement) : html;
}

function replaceRegexExact(html, pattern, replacement, expected, label) {
  const matches = [...html.matchAll(pattern)];
  if (matches.length !== expected) throw new Error(`${label}: expected ${expected} matches, found ${matches.length}`);
  return html.replace(pattern, replacement);
}

function removeAcceptedHomePlaceholders(html) {
  let result = html;
  result = replaceRegexOptional(
    result,
    /\n      <div class="lang" data-name="lang">[\s\S]*?\n      <\/div>(?=\n      <a class="btn btn-solid" href="quote-v5\.html">)/g,
    '',
    'Accepted desktop language placeholder',
  );
  result = replaceRegexOptional(
    result,
    /\n  <div class="mlang" data-name="mlang">[\s\S]*?<\/div>(?=\n<\/div>\n<!-- SHELL:NAV AUTO END -->)/g,
    '',
    'Accepted mobile language placeholder',
  );
  result = replaceRegexOptional(
    result,
    /\/\* ---------- 语言切换\(r14[\s\S]*?(?=\/\* ---------- section scaffolding ---------- \*\/)/g,
    '',
    'Accepted language placeholder CSS',
  );
  result = replaceRegexOptional(
    result,
    /\/\* 语言切换占位\(r14[\s\S]*?\n\}\)\(\);\n/g,
    '',
    'Accepted language placeholder script',
  );
  return result;
}

export function rewriteLanguageControlState(url, locale, stem) {
  assertLocaleAndStem(locale, stem);
  let current;
  try {
    current = new URL(url, SEO_BASE_URL);
  } catch (error) {
    throw new Error(`Malformed V5 language-control URL: ${error.message}`);
  }
  const target = new URL(getLocalizedRoute(locale, stem), SEO_BASE_URL);
  if (V5_LANGUAGE_ALLOWED_QUERY_KEYS.has('industry')) {
    const industry = current.searchParams.get('industry');
    if (industry) target.searchParams.set('industry', industry);
  }
  const fragment = current.hash.slice(1);
  if (V5_LANGUAGE_ALLOWED_FRAGMENTS.has(fragment)) target.hash = fragment;
  return `${target.pathname}${target.search}${target.hash}`;
}

export function injectV5LanguageControls(html, { stem, locale } = {}) {
  if (typeof html !== 'string' || !html.trim()) throw new Error(`${stem ?? '(missing)'}: V5 HTML must be nonempty`);
  assertLocaleAndStem(locale, stem);
  if (/V5:LANGUAGE (?:CONTROLS|DESKTOP|MOBILE|FOOTER|SCRIPT) START/.test(html)) {
    throw new Error(`${stem}/${locale}: V5 language controls already exist`);
  }

  let result = removeAcceptedHomePlaceholders(html);
  result = replaceExact(result, '</style>', `${CONTROL_STYLE}\n</style>`, 1, `${stem}/${locale} style insertion`);
  result = replaceRegexExact(
    result,
    /      <a class="btn btn-solid" href="quote-v5\.html"(?: style="[^"]+")?>[^<]*<\/a>/g,
    (match) => `${desktopControl(locale, stem)}\n${match}`,
    1,
    `${stem}/${locale} desktop control insertion`,
  );
  result = replaceExact(
    result,
    '</div>\n<!-- SHELL:NAV AUTO END -->',
    `${mobileControl(locale, stem)}\n</div>\n<!-- SHELL:NAV AUTO END -->`,
    1,
    `${stem}/${locale} mobile control insertion`,
  );
  result = replaceExact(
    result,
    '    <div class="footv5-legal-row">',
    `${footerControl(locale, stem)}\n\n    <div class="footv5-legal-row">`,
    1,
    `${stem}/${locale} Footer control insertion`,
  );
  result = replaceExact(result, '</body>', `${CONTROL_SCRIPT}\n</body>`, 1, `${stem}/${locale} script insertion`);
  return result;
}
