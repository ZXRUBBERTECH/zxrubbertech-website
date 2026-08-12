import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyV5SeoHead } from './v5-seo-transform.mjs';
import {
  addV5ImageDimensions,
  externalizeV5DataImages,
  preserveV5ImageLayout,
} from './v5-seo-assets.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const innerDemos = join(root, 'design-demos');
const outerDemos = resolve(root, '..', 'design-demos');

const inner = (name) => join(innerDemos, name);
const outer = (name) => join(outerDemos, name);

const sourceMatrix = {
  'demo-a': inner('demo-a-v4-share.html'),
  products: inner('products-v4-share.html'),
  compounds: outer('solutions-v4-share.html'),
  industries: outer('industries-v4-share.html'),
  capabilities: outer('engineering-v4-share.html'),
  faq: outer('faq-v4-share.html'),
  quote: outer('quote-v4-share.html'),
  assets: inner('assets-v4-share.html'),
};

const publicStems = new Set(['demo-a', 'products', 'compounds', 'industries', 'capabilities', 'faq', 'quote']);
const v5Footer = readFileSync(join(root, 'scripts/v5-footer-template.html'), 'utf8').trim();

const approvedGate6VisibleCopy = {
  'demo-a': {
    h1: [
      '<h1>Requirements in.<br>Controlled <em>rubber</em> out.</h1>',
      '<h1>Custom rubber.<br><em>Compounds &amp; components</em>.</h1>',
    ],
    supporting: [
      '<p>ANHUI ZHIXIN MATERIAL TECHNOLOGY CO., LTD develops and manufactures rubber compounds and custom rubber components in Anhui, China.</p>',
      '<p>ANHUI ZHIXIN MATERIAL TECHNOLOGY CO., LTD manufactures custom rubber compounds and components in Ningguo, Anhui, China.</p>',
    ],
  },
  products: {
    h1: [
      '<h1>Rubber components.<br>Engineered for <em>your application</em>.</h1>',
      '<h1>Custom rubber components.<br>Built for <em>your application</em>.</h1>',
    ],
    supporting: [
      '<p class="th-sub">Explore molded rubber and rubber-metal bonded components for automotive, sealing, appliance and custom industrial applications. Application images are for reference; final geometry, materials and specifications are confirmed against project requirements.</p>',
      '<p class="th-sub">Explore custom molded rubber products and rubber-metal bonded parts for automotive, sealing, appliance and industrial applications. Images are for reference; final geometry, materials and specifications are confirmed against project requirements.</p>',
    ],
  },
  compounds: {
    h1: [
      '<h1>Compounds built around<br><em>application requirements</em>.</h1>',
      '<h1>Custom rubber compounds.<br>Built for <em>your application</em>.</h1>',
    ],
    supporting: [
      '<p class="th-sub">Explore ten core elastomer families for compound supply and molded rubber production. Polymer, color, hardness, processing route and project documents are confirmed against each application.</p>',
      '<p class="th-sub">Explore ten elastomer families—including NBR, EPDM and SBR—for custom compound supply and molded rubber production. Polymer, color, hardness and processing route are confirmed for each application.</p>',
    ],
  },
  industries: {
    h1: [
      '<h1>Engineered rubber,<br>where industry <em>moves.</em></h1>',
      '<h1>Industrial rubber.<br>Components in <em>motion</em>.</h1>',
    ],
    supporting: [
      '<p class="th-sub">Explore application-focused rubber components for mobility, equipment, transit, fluid handling and electrical systems — supported by in-house compound development, molding and rubber-to-metal bonding.</p>',
      '<p class="th-sub">Explore application-focused rubber components for mobility, industrial equipment, rail transit, fluid handling and electrical systems—supported by in-house compound development, molding and rubber-to-metal bonding.</p>',
    ],
  },
  capabilities: {
    h1: [
      '<h1>From engineering intent<br>to <em>controlled production</em>.</h1>',
      '<h1>Rubber manufacturing.<br>Engineering to <em>production</em>.</h1>',
    ],
    supporting: [
      '<p class="th-sub">We review requirements, define material and tooling routes, control compound and component production, and release against confirmed project criteria.</p>',
      '<p class="th-sub">We define material and tooling routes, then control rubber compounding, compression and injection molding, extrusion and rubber-metal bonding against project criteria.</p>',
    ],
  },
  faq: {
    h1: [
      '<h1>Rubber manufacturing,<br><em>answered clearly</em>.</h1>',
      '<h1>Rubber FAQ.<br><em>Answered clearly</em>.</h1>',
    ],
    supporting: [
      '<p class="th-sub">Practical answers on in-house processes, material selection, custom development, MOQ, quality records and export supply.</p>',
      '<p class="th-sub">Answers on rubber materials, manufacturing, custom development, MOQ, tooling, quality records, traceability and export supply.</p>',
    ],
  },
  quote: {
    h1: [
      '<h1>Start your project<br>with <em>us</em>.</h1>',
      '<h1>Rubber quote.<br><em>Start here</em>.</h1>',
    ],
    supporting: [
      '<p class="th-sub">Contact our engineering and sales team for material selection, product development and quotation support.</p>',
      '<p class="th-sub">Contact our engineering and sales team for custom rubber material selection, part development and quotation support.</p>',
    ],
  },
};

function replaceOnce(html, from, to, label) {
  const count = html.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one exact source fragment, found ${count}`);
  return html.replace(from, to);
}

function applyApprovedGate6VisibleCopy(html, stem) {
  const copy = approvedGate6VisibleCopy[stem];
  if (!copy) throw new Error(`${stem}: missing approved Gate 6 visible copy`);
  for (const [slot, [baseline, approved]] of Object.entries(copy)) {
    html = replaceOnce(html, baseline, approved, `${stem} Gate 6 ${slot}`);
  }
  return html;
}

function replaceRegexOnce(html, pattern, to, label) {
  const matches = html.match(pattern) ?? [];
  if (matches.length !== 1) throw new Error(`${label}: expected one regex source fragment, found ${matches.length}`);
  return html.replace(pattern, to);
}

function replaceExactCount(html, from, to, expectedCount, label) {
  const count = html.split(from).length - 1;
  if (count !== expectedCount) {
    throw new Error(`${label}: expected ${expectedCount} exact source fragments, found ${count}`);
  }
  return html.replaceAll(from, to);
}

function applyApprovedV5CuratedMedia(html, stem) {
  if (stem === 'demo-a') {
    html = replaceRegexOnce(
      html,
      /<figure class="mfg-photo" data-provenance="素材库\/台账\.md#首页制造六卡双排2026-08-09"><img loading="lazy" src="data:image\/webp;base64,[A-Za-z0-9+/=]+" alt="Mooney viscosity testing equipment for rubber compound"><\/figure>(?=\s*<div class="mfg-step-copy"><b>02<\/b><h4>Compound Testing &amp; Release<\/h4><p>Batch checks support release against the confirmed compound requirements\.<\/p><\/div>)/g,
      '<figure class="mfg-photo" data-provenance="https://www.wacker.com/cms/en-us/press-and-media/press/press-releases/2022/detail-176642.html"><img loading="lazy" src="media/v5-curated/compound-testing-elastomer.jpg" alt="Elastomer specimen held in tensile testing grips for material verification"></figure>',
      'Home approved compound testing media',
    );
    html = replaceRegexOnce(
      html,
      /<figure class="mfg-photo" data-provenance="素材库\/台账\.md#首页制造六卡双排2026-08-09"><img loading="lazy" src="data:image\/webp;base64,[A-Za-z0-9+/=]+" alt="Bagged rubber-related material moving along an industrial conveyor"><\/figure>(?=\s*<div class="mfg-step-copy"><b>03<\/b><h4>Packing &amp; Dispatch<\/h4><p>Released compound is packed in the agreed supply form for shipment\.<\/p><\/div>)/g,
      '<figure class="mfg-photo" data-provenance="https://www.soucy-group.com/en/units/soucy-techno/processes"><img loading="lazy" src="media/v5-curated/compound-packing-sheets.webp" alt="Folded rubber compound sheets prepared in an agreed supply form"></figure>',
      'Home approved compound packing media',
    );
  }

  if (stem === 'products') {
    html = replaceOnce(
      html,
      `      <div class="gal fade photo" data-asset="P-020" data-name="catalog.card-door-seal-production-line">
        <img loading="lazy" src="media/gallery/ph-wm-line.webp" alt="Door Seal Production Line — application example"><span>Door Seal Production Line · application example</span>
      </div>`,
      `      <div class="gal fade photo" data-asset="P-020" data-name="catalog.card-custom-sealing-profiles" data-provenance="https://www.nufox.com/products/rubber-extrusions">
        <img loading="lazy" src="media/v5-curated/custom-sealing-profiles.webp" alt="Custom rubber sealing profiles — application examples"><span>Custom Sealing Profiles · application examples</span>
      </div>`,
      'Products approved custom sealing profiles media',
    );
  }

  return html;
}

function normalizeTitle(html) {
  return replaceRegexOnce(
    html,
    /<title>\[分享版·内联\] v4 ·/g,
    '<title>v5 ·',
    'title normalization',
  );
}

function normalizeLinks(html) {
  const stems = ['demo-a', 'products', 'industries', 'engineering', 'manufacturing', 'about', 'faq', 'quote', 'assets'];
  for (const stem of stems) {
    html = html.replaceAll(`${stem}-v4-share.html`, `${stem}-v5.html`);
    html = html.replaceAll(`${stem}-v4.html`, `${stem}-v5.html`);
  }

  html = html.replace(/solutions-v4(?:-share)?\.html(?:#[^"']*)?/g, 'compounds-v5.html');
  html = html.replaceAll('compounds-v4-share.html', 'compounds-v5.html');
  html = html.replaceAll('compounds-v4.html', 'compounds-v5.html');
  html = html.replaceAll('>Solutions</a>', '>Compounds</a>');
  html = html.replaceAll('>Solutions &amp; Materials</a>', '>Rubber Compounds</a>');
  return html;
}

export function normalizeV5FragmentTargets(html, stem) {
  if (stem === 'demo-a') {
    const replacements = [
      ['quote-v5.html#rfq', 'quote-v5.html#contact', 2],
      ['products-v5.html#bushings-mounts-rubber-metal', 'products-v5.html#c-automotive', 1],
      ['products-v5.html#seals-gaskets', 'products-v5.html#c-sealing', 1],
      ['products-v5.html#boots-bellows-covers', 'products-v5.html#c-automotive', 1],
      ['products-v5.html#grommets-plugs-cable-protection', 'products-v5.html#c-automotive', 1],
      ['products-v5.html#rollers-wheels-custom-molded', 'products-v5.html#c-industrial', 1],
      ['compounds-v5.html#families', 'compounds-v5.html#compound-primary', 1],
    ];
    for (const [from, to, expectedCount] of replacements) {
      html = replaceExactCount(html, from, to, expectedCount, `V5 fragment normalization ${from}`);
    }
  }

  if (stem === 'faq') {
    html = replaceExactCount(
      html,
      '<details data-name="faq.item-8">',
      '<details data-name="faq.item-8" id="faq-moq-lead">',
      1,
      'FAQ MOQ fragment target',
    );
    html = replaceExactCount(
      html,
      '<details data-name="faq.item-12">',
      '<details data-name="faq.item-12" id="faq-documents">',
      1,
      'FAQ documents fragment target',
    );
  }

  return html;
}

function normalizeV5Brand(html) {
  return html.replaceAll('ZHIXIN RUBBER TECH', 'ZHIXIN RUBBER MATERIAL');
}

const v5FooterCss = `
/* ---------- V5:Shared layered Footer ---------- */
.nav-in>.logo{display:inline-flex;align-items:center;gap:10px}
.v5-header-mark{width:36px;height:36px;flex:0 0 36px;border-radius:50%;object-fit:cover}
footer.footv5{margin:0;padding:0;border-top:0;background:#080d15;color:var(--ink-dim);font-size:13px}
.footv5-shell{max-width:var(--max);margin:0 auto;padding:0 32px}
.footv5-links-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(300px,1.3fr);gap:48px;padding:38px 0;border-top:2px solid var(--accent);border-bottom:1px solid var(--line)}
.footv5-group h3{margin:0 0 17px;color:var(--ink);font-size:11px;letter-spacing:.17em;text-transform:uppercase}
.footv5-group ul{margin:0;padding:0;list-style:none}
.footv5-group li{margin:0;padding:0}
.footv5-group a,.footv5-group span{display:inline-block;padding:5px 0;color:#b9c4d3;font-size:13px;line-height:1.55;text-decoration:none}
.footv5-group a{transition:color .2s,transform .2s}
.footv5-group a:hover{color:var(--accent);transform:translateX(3px)}
.footv5-group a:focus-visible{outline:2px solid var(--accent);outline-offset:4px;color:var(--ink)}
.footv5-contact a{overflow-wrap:anywhere}
.footv5-contact li:last-child span{color:#7f8da1}
.footv5-legal-row{display:flex;justify-content:flex-end;gap:36px;padding:22px 0 28px;color:#6f7d90;font-size:10px;line-height:1.5;letter-spacing:.06em;text-align:right}
@media(max-width:980px){.footv5-links-row{grid-template-columns:repeat(2,minmax(0,1fr));gap:34px 52px}.footv5-contact{grid-column:1/-1;padding-top:28px;border-top:1px solid var(--line)}.footv5-contact ul{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 40px}.footv5-contact li:last-child{grid-column:1/-1}}
@media(max-width:620px){.v5-header-mark{width:30px;height:30px;flex-basis:30px}.nav-in>.logo{gap:8px}.footv5-shell{padding:0 22px}.footv5-links-row{grid-template-columns:1fr;gap:0;padding:4px 0}.footv5-group{padding:24px 0;border-bottom:1px solid var(--line)}.footv5-contact{grid-column:auto;border-top:0}.footv5-contact ul{display:block}.footv5-contact li:last-child{grid-column:auto}.footv5-legal-row{display:block;padding:22px 0 28px}.footv5-legal-row span{display:block}}
`;

function injectV5HeaderBrand(html) {
  return replaceOnce(
    html,
    '<a class="logo" href="demo-a-v5.html">ZHIXIN <span>RUBBER TECH</span></a>',
    '<a class="logo" href="demo-a-v5.html"><img class="v5-header-mark" src="../LOGO/ZXLOGO.png" alt="">ZHIXIN <span>RUBBER MATERIAL</span></a>',
    'V5 Header circular logo injection',
  );
}

function injectV5Footer(html) {
  const start = '<!-- SHELL:FOOTER AUTO START -->';
  const end = '<!-- SHELL:FOOTER AUTO END -->';
  const pattern = new RegExp(`${start}[\\s\\S]*?${end}`, 'g');
  html = replaceOnce(html, '</style>', `${v5FooterCss}\n</style>`, 'V5 Footer CSS injection');
  return replaceRegexOnce(html, pattern, `${start}\n${v5Footer}\n${end}`, 'V5 Footer injection');
}

function consolidateCapabilitiesNavigation(html, active) {
  const desktopReplacement = `      <a href="capabilities-v5.html"${active ? ' class="act"' : ''}>Capabilities</a>`;
  html = replaceRegexOnce(
    html,
    /      <a href="engineering-v5\.html"(?: class="act")?>Engineering(?:(?: &amp;| &) Quality)?<\/a>\n      <a href="manufacturing-v5\.html"(?: class="act")?>Manufacturing<\/a>\n      <a href="about-v5\.html"(?: class="act")?>About<\/a>/g,
    desktopReplacement,
    'Capabilities desktop navigation consolidation',
  );
  html = replaceRegexOnce(
    html,
    /  <a href="engineering-v5\.html">Engineering(?:(?: &amp;| &) Quality)?<\/a>\n  <a href="manufacturing-v5\.html">Manufacturing<\/a>\n  <a href="about-v5\.html">About<\/a>/g,
    '  <a href="capabilities-v5.html">Capabilities</a>',
    'Capabilities mobile navigation consolidation',
  );
  html = replaceRegexOnce(
    html,
    /        <li><a href="engineering-v5\.html">Engineering &amp; Quality<\/a><\/li>\n        <li><a href="manufacturing-v5\.html">Manufacturing<\/a><\/li>\n        <li><a href="about-v5\.html">About Us<\/a><\/li>/g,
    '        <li><a href="capabilities-v5.html">Capabilities</a></li>',
    'Capabilities footer consolidation',
  );
  return html;
}

const industriesV5Css = `
/* ---------- V5:Industries application routes ---------- */
body[data-page="industries"]{overflow-x:hidden}
body[data-page="industries"] .tab-hero>.abadge,body[data-page="industries"] .ind-sec>.abadge{display:none!important}
body[data-page="industries"] #wheel{opacity:0;pointer-events:none;transition:opacity .24s ease}
body[data-page="industries"] #wheel.is-visible{opacity:1;pointer-events:auto}
body[data-page="industries"] .industries-v5-spacer{height:44px}
body[data-page="industries"] .ind-sec{min-height:430px;display:flex;align-items:center;background-position:center}
body[data-page="industries"] .ind-sec::before{background:linear-gradient(100deg,rgba(10,14,23,.96) 34%,rgba(10,14,23,.76) 62%,rgba(10,14,23,.42))}
body[data-page="industries"] .ind-sec h3{max-width:23ch}
body[data-page="industries"] .ind-chips a{display:inline-flex;align-items:center;min-height:42px}
@media(min-width:1280px){body[data-page="industries"] .ind-sec .wrap{padding-left:222px}}
@media(max-width:900px){body[data-page="industries"] .industries-v5-spacer{height:24px}body[data-page="industries"] .ind-sec{min-height:390px;background-position:62% center}body[data-page="industries"] .ind-sec::before{background:linear-gradient(100deg,rgba(10,14,23,.97) 16%,rgba(10,14,23,.79) 72%,rgba(10,14,23,.52))}}
@media(max-width:620px){body[data-page="industries"] .ind-chips{display:grid;grid-template-columns:1fr}body[data-page="industries"] .ind-chips a{justify-content:center;text-align:center}}
`;

const industriesV5Content = `<header class="tab-hero" data-name="tab-hero" data-asset="L-028" style="background-image:url('media/industries/vid-industries-montage-poster.webp')">
  <video muted loop playsinline preload="none" poster="media/industries/vid-industries-montage-poster.webp" data-gated-src="media/industries/vid-industries-montage.mp4" data-gated-eager aria-hidden="true"></video>
  <div class="th-in">
    <div class="eyebrow">Industries</div>
    <h1>Engineered rubber,<br>where industry <em>moves.</em></h1>
    <p class="th-sub">Explore application-focused rubber components for mobility, equipment, transit, fluid handling and electrical systems — supported by in-house compound development, molding and rubber-to-metal bonding.</p>
    <p class="th-note">Hero footage: licensed industry application examples.</p>
  </div>
</header>

<div class="industries-v5-spacer" aria-hidden="true"></div>

<!-- 01 Automotive & Mobility -->
<section data-asset="L-006" class="ind-sec" id="i-automotive-mobility" data-wheel="Automotive &amp; Mobility" data-name="ind.automotive-mobility" style="background-image:url('media/auto-suspension.webp')">
  <div class="wrap">
    <h3>Automotive &amp; Mobility</h3>
    <p class="fade">Molded rubber, sealing and rubber-metal bonded components for chassis, body and electrical applications, supplied to drawing and reviewed against load, motion, sealing and NVH requirements.</p>
    <div class="ind-chips fade">
      <a href="products-v5.html#c-automotive">View Related Products →</a>
      <a href="quote-v5.html?industry=automotive-mobility#contact">Discuss Your Application →</a>
    </div>
  </div>
</section>

<!-- 02 Home Appliances & HVAC -->
<section data-asset="L-021" class="ind-sec" id="i-home-appliances-hvac" data-wheel="Home Appliances &amp; HVAC" data-name="ind.home-appliances-hvac" style="background-image:url('media/industries/industry-home-hvac.webp')">
  <div class="wrap">
    <h3>Home Appliances &amp; HVAC</h3>
    <p class="fade">Door seals, gaskets, isolators, grommets and silicone components for refrigeration, laundry, dishwashing and climate-control equipment.</p>
    <div class="ind-chips fade">
      <a href="products-v5.html#c-appliance">View Related Products →</a>
      <a href="quote-v5.html?industry=home-appliances-hvac#contact">Discuss Your Application →</a>
    </div>
  </div>
</section>

<!-- 03 Industrial Machinery & Automation -->
<section data-asset="L-022" class="ind-sec" id="i-industrial-machinery-automation" data-wheel="Industrial Machinery &amp; Automation" data-name="ind.industrial-machinery-automation" style="background-image:url('media/industries/industry-automation.webp')">
  <div class="wrap">
    <h3>Industrial Machinery &amp; Automation</h3>
    <p class="fade">Rollers, mounts, diaphragms, boots and custom molded parts for production equipment, material handling and automated systems.</p>
    <div class="ind-chips fade">
      <a href="products-v5.html#c-industrial">View Related Products →</a>
      <a href="quote-v5.html?industry=industrial-machinery-automation#contact">Discuss Your Application →</a>
    </div>
  </div>
</section>

<!-- 04 Construction, Mining & Agriculture -->
<section data-asset="L-023" class="ind-sec" id="i-construction-mining-agriculture" data-wheel="Construction, Mining &amp; Agriculture" data-name="ind.construction-mining-agriculture" style="background-image:url('media/industries/industry-heavy-equipment.webp')">
  <div class="wrap">
    <h3>Construction, Mining &amp; Agriculture</h3>
    <p class="fade">Bushings, mounts, boots, seals and wear-related components for machinery operating under shock, dust, mud and repeated duty cycles.</p>
    <div class="ind-chips fade">
      <a href="products-v5.html#c-industrial">View Related Products →</a>
      <a href="quote-v5.html?industry=construction-mining-agriculture#contact">Discuss Your Application →</a>
    </div>
  </div>
</section>

<!-- 05 Rail & Transit -->
<section data-asset="L-024" class="ind-sec" id="i-rail-transit" data-wheel="Rail &amp; Transit" data-name="ind.rail-transit" style="background-image:url('media/industries/industry-rail-transit.webp')">
  <div class="wrap">
    <h3>Rail &amp; Transit</h3>
    <p class="fade">Rubber-metal bonded parts, buffers, bellows and sealing components for bogie, carbody and equipment-isolation applications.</p>
    <div class="ind-chips fade">
      <a href="products-v5.html#c-industrial">View Related Products →</a>
      <a href="quote-v5.html?industry=rail-transit#contact">Discuss Your Application →</a>
    </div>
  </div>
</section>

<!-- 06 Energy & Process Equipment -->
<section data-asset="L-025" class="ind-sec" id="i-energy-process-equipment" data-wheel="Energy &amp; Process Equipment" data-name="ind.energy-process-equipment" style="background-image:url('media/industries/industry-energy-process.webp')">
  <div class="wrap">
    <h3>Energy &amp; Process Equipment</h3>
    <p class="fade">Seals, gaskets and molded elastomer components reviewed against process media, temperature, pressure and service conditions.</p>
    <div class="ind-chips fade">
      <a href="products-v5.html#c-sealing">View Related Products →</a>
      <a href="quote-v5.html?industry=energy-process-equipment#contact">Discuss Your Application →</a>
    </div>
  </div>
</section>

<!-- 07 Water, Pumps & Fluid Handling -->
<section data-asset="L-026" class="ind-sec" id="i-water-pumps-fluid-handling" data-wheel="Water, Pumps &amp; Fluid Handling" data-name="ind.water-pumps-fluid-handling" style="background-image:url('media/industries/industry-water-fluid.webp')">
  <div class="wrap">
    <h3>Water, Pumps &amp; Fluid Handling</h3>
    <p class="fade">Diaphragms, O-rings, gaskets and molded sealing parts for pumps, valves, piping and fluid-control equipment.</p>
    <div class="ind-chips fade">
      <a href="products-v5.html#c-industrial-diaphragms">View Related Products →</a>
      <a href="quote-v5.html?industry=water-pumps-fluid-handling#contact">Discuss Your Application →</a>
    </div>
  </div>
</section>

<!-- 08 Electrical Equipment & Cable Protection -->
<section data-asset="L-027" class="ind-sec" id="i-electrical-equipment-cable-protection" data-wheel="Electrical Equipment &amp; Cable Protection" data-name="ind.electrical-equipment-cable-protection" style="background-image:url('media/industries/industry-electrical-cable.webp')">
  <div class="wrap">
    <h3>Electrical Equipment &amp; Cable Protection</h3>
    <p class="fade">Grommets, cable boots, protective sleeves and custom molded components for routing, sealing and isolating electrical connections.</p>
    <div class="ind-chips fade">
      <a href="products-v5.html#c-industrial">View Related Products →</a>
      <a href="quote-v5.html?industry=electrical-equipment-cable-protection#contact">Discuss Your Application →</a>
    </div>
  </div>
</section>

<section class="cta-band" data-name="cta-band">
  <div class="wrap">
    <div class="eyebrow eyebrow-center">Your Industry</div>
    <h2>Don't see your industry listed?</h2>
    <p>If your machine moves, seals or damps vibration, we can likely help. Send us your drawing and application details — we will confirm feasibility.</p>
    <a class="btn btn-solid" href="quote-v5.html#contact">Get a Quote</a>
  </div>
</section>`;

function makeIndustriesPage(html) {
  html = replaceOnce(html, '<body>', '<body data-page="industries">', 'Industries page scope');
  html = replaceOnce(html, '</style>', `${industriesV5Css}\n</style>`, 'Industries V5 CSS');
  html = replaceRegexOnce(
    html,
    /<header class="tab-hero"[\s\S]*?<section class="cta-band" data-name="cta-band">[\s\S]*?<\/section>/g,
    industriesV5Content,
    'Industries V5 content',
  );
  html = replaceOnce(
    html,
    `  function update(){
    raf=0;
    const mid=innerHeight/2;let a=0;
    secs.forEach((s,i)=>{if(s.getBoundingClientRect().top<=mid)a=i;});
    if(a!==act)render(a);
  }`,
    `  function update(){
    raf=0;
    const mid=innerHeight/2;let a=0;
    const first=secs[0].getBoundingClientRect();
    const last=secs[secs.length-1].getBoundingClientRect();
    nav.classList.toggle('is-visible',first.top<=mid&&last.bottom>=mid);
    secs.forEach((s,i)=>{if(s.getBoundingClientRect().top<=mid)a=i;});
    if(a!==act)render(a);
  }`,
    'Industries bounded navigator',
  );
  return html;
}

function mapCapabilitiesLinks(html) {
  return html
    .replace(/href="engineering-v5\.html(?:#[^"]*)?"/g, 'href="capabilities-v5.html#engineering"')
    .replace(/href="manufacturing-v5\.html(?:#[^"]*)?"/g, 'href="capabilities-v5.html#production"')
    .replace(/href="about-v5\.html(?:#[^"]*)?"/g, 'href="capabilities-v5.html#company"');
}

const capabilitiesCss = `
/* ---------- V5:Capabilities consolidated page ---------- */
body[data-page="capabilities"]{overflow-x:hidden;background:var(--bg)}
body[data-page="capabilities"] footer{background:#0c111b;color:#8793a6;border-top-color:#253146}
body[data-page="capabilities"] footer h3,body[data-page="capabilities"] footer a{color:#e8edf5}
body[data-page="capabilities"] footer .copyright{border-top-color:#253146}
body[data-page="capabilities"] .abadge{display:none!important}
.capv5-hero .th-sub{max-width:720px}
.capv5-section{position:relative;padding:90px 0;scroll-margin-top:78px;color:var(--ink)}
.capv5-section:nth-of-type(even){background:var(--bg2)}
.capv5-head{display:block;margin-bottom:42px}
.capv5-head h2,.capv5-stage h3,.capv5-control h3,.capv5-quality-step h3{color:var(--ink)}
.capv5-head h2{max-width:none;margin:0;font-size:clamp(42px,5.2vw,72px);line-height:1.02;letter-spacing:-.035em}
.capv5-head .lead{margin:22px 0 0;max-width:82ch}
.capv5-engineering-visual{position:relative;min-height:520px;overflow:hidden;border:1px solid var(--line);background:#0d1727}
.capv5-engineering-visual img{width:100%;height:100%;object-fit:cover;filter:saturate(.72) contrast(1.08)}
.capv5-engineering-visual::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(5,9,16,.04),rgba(5,9,16,.34))}
.capv5-eng-grid{display:grid;grid-template-columns:minmax(0,1.18fr) minmax(320px,.82fr);gap:2px}
.capv5-stage-list{display:grid;border-top:1px solid var(--line)}
.capv5-stage{display:grid;grid-template-columns:54px 1fr;gap:18px;padding:26px 24px;border:1px solid var(--line);border-top:0;background:var(--panel)}
.capv5-stage b,.capv5-control b{color:var(--accent);font:700 12px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.12em}
.capv5-stage h3{margin:0 0 8px;font-size:20px}
.capv5-stage p{margin:0;color:var(--ink-dim);line-height:1.65}
.capv5-note{margin-top:20px;padding:18px 20px;border-left:2px solid var(--accent);background:rgba(255,255,255,.035);color:var(--ink-dim);line-height:1.65}
.capv5-routes{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:2px;margin-bottom:24px}
.capv5-route{position:relative;min-height:290px;padding:34px;border:1px solid #2d3a4e;background:linear-gradient(145deg,#111b2c,#0a111d);color:#fff;overflow:hidden}
.capv5-route::before{content:"";position:absolute;z-index:1;inset:0;background:linear-gradient(90deg,rgba(7,12,20,.94) 0%,rgba(7,12,20,.73) 60%,rgba(7,12,20,.38) 100%)}
.capv5-route::after{content:"";position:absolute;z-index:2;right:-55px;bottom:-70px;width:210px;height:210px;border:1px solid rgba(241,91,53,.35);border-radius:50%}
.capv5-route img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:saturate(.7) contrast(1.08)}
.capv5-route span{position:relative;z-index:3;display:block;margin-bottom:52px;color:var(--accent);font:700 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.13em;text-transform:uppercase}
.capv5-route h3{position:relative;z-index:3;max-width:18ch;margin:0 0 14px;font-size:clamp(26px,3vw,38px);line-height:1.05}
.capv5-route p{position:relative;z-index:3;max-width:46ch;margin:0;color:#d0d8e4;line-height:1.7}
.capv5-controls{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border-top:1px solid var(--line);border-left:1px solid var(--line)}
.capv5-control{min-height:172px;padding:24px 20px;border-right:1px solid var(--line);border-bottom:1px solid var(--line);background:var(--panel)}
.capv5-control h3{margin:26px 0 8px;font-size:18px}
.capv5-control p{margin:0;color:var(--ink-dim);font-size:14px;line-height:1.55}
.capv5-quality-grid{display:grid;grid-template-columns:minmax(0,.92fr) minmax(400px,1.08fr);gap:2px;align-items:stretch}
.capv5-quality-visual{position:relative;min-height:520px;overflow:hidden;background:#101722}
.capv5-quality-visual img{width:100%;height:100%;object-fit:cover;filter:saturate(.72) contrast(1.08)}
.capv5-quality-visual::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(3,7,12,.08),rgba(3,7,12,.36))}
.capv5-quality-copy{padding:42px;border:1px solid var(--line);background:var(--panel)}
.capv5-quality-step{display:grid;grid-template-columns:48px 1fr;gap:16px;padding:22px 0;border-bottom:1px solid var(--line)}
.capv5-quality-step:first-of-type{margin-top:20px;border-top:1px solid var(--line)}
.capv5-quality-step b{color:var(--accent);font:700 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.12em}
.capv5-quality-step h3{margin:0 0 6px;font-size:19px}
.capv5-quality-step p{margin:0;color:var(--ink-dim);font-size:14px;line-height:1.58}
.capv5-iso{margin:26px 0 0;padding-top:22px;color:var(--ink-dim);font-size:14px;line-height:1.7}
.capv5-capacity-band{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));border-top:1px solid var(--line);border-bottom:1px solid var(--line);background:var(--bg2)}
.capv5-capacity-stat{padding:52px 32px;border-left:1px solid var(--line)}
.capv5-capacity-stat:first-child{border-left:none}
.capv5-capacity-stat b{display:block;color:var(--ink);font-size:clamp(30px,3.2vw,46px);font-weight:800;letter-spacing:-.02em}
.capv5-capacity-stat b i{margin-left:2px;color:var(--accent);font-size:.6em;font-style:normal;vertical-align:.32em}
.capv5-capacity-stat b span{display:inline;margin:0;color:inherit;font-size:inherit;letter-spacing:inherit;text-transform:none}
.capv5-capacity-stat>span{display:block;margin-top:8px;color:var(--ink-dim);font-size:12px;line-height:1.5;letter-spacing:.1em;text-transform:uppercase}
.capv5-location{margin-top:34px}
.capv5-map-preview{position:relative;display:block;min-height:430px;overflow:hidden;border:1px solid var(--line);background:var(--panel);color:#fff}
.capv5-map-preview::after{content:"";position:absolute;z-index:1;inset:0;background:linear-gradient(180deg,rgba(6,10,17,.12),rgba(6,10,17,.42))}
.capv5-map-preview img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:saturate(.92) contrast(1.06) brightness(.9);transition:transform .5s,filter .5s}
.capv5-map-preview:hover img{transform:scale(1.015);filter:saturate(.98) contrast(1.06) brightness(.94)}
.capv5-map-pin{position:absolute;z-index:2;left:50%;top:50%;display:flex;align-items:center;gap:10px;padding:10px 13px;background:rgba(10,14,23,.9);font:700 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.1em;text-transform:uppercase;white-space:nowrap;transform:translate(-50%,-50%)}
.capv5-map-pin::before{content:"";width:10px;height:10px;border:3px solid var(--accent);border-radius:50%;box-shadow:0 0 0 6px rgba(241,91,53,.2)}
.capv5-map-credit{position:absolute;z-index:2;left:16px;bottom:14px;padding:7px 9px;background:rgba(10,14,23,.9);color:var(--ink-dim);font-size:10px;letter-spacing:.06em}
.capv5-address-row{display:flex;justify-content:space-between;gap:30px;align-items:flex-start;padding:24px 2px 0}
.capv5-address-row address{max-width:72ch;color:var(--ink-dim);font-size:14px;font-style:normal;line-height:1.7}
.capv5-map-link{display:inline-flex;flex:0 0 auto;align-items:center;min-height:42px;color:var(--ink);font-size:12px;font-weight:700;letter-spacing:.04em;transition:color .2s}
.capv5-map-link:hover{color:var(--accent)}
@media(max-width:1460px){body[data-page="capabilities"] #wheel{display:none}}
@media(max-width:920px){.capv5-eng-grid,.capv5-quality-grid{grid-template-columns:1fr}.capv5-controls{grid-template-columns:repeat(2,minmax(0,1fr))}.capv5-engineering-visual,.capv5-quality-visual{min-height:420px}}
@media(max-width:620px){body[data-page="capabilities"] .foot-grid{grid-template-columns:1fr}.capv5-section{padding:64px 0}.capv5-head h2{font-size:clamp(34px,10.4vw,42px)}.capv5-routes,.capv5-controls{grid-template-columns:1fr}.capv5-route{min-height:250px;padding:28px 22px}.capv5-route span{margin-bottom:36px}.capv5-stage{grid-template-columns:38px 1fr;padding:22px 18px}.capv5-engineering-visual,.capv5-quality-visual{min-height:330px}.capv5-quality-copy{padding:26px 20px}.capv5-capacity-stat{padding:38px 18px}.capv5-map-preview{min-height:300px}.capv5-address-row{display:block;padding-top:20px}.capv5-map-link{margin-top:14px}}
`;

function makeCapabilitiesPage(html) {
  html = replaceOnce(
    html,
    '<title>v5 · Engineering &amp; Quality ·',
    '<title>v5 · Capabilities ·',
    'Capabilities document title',
  );
  html = replaceOnce(html, '<body>', '<body data-page="capabilities">', 'Capabilities page scope');
  html = replaceOnce(html, '</style>', `${capabilitiesCss}\n</style>`, 'Capabilities CSS injection');

  const heroStart = html.indexOf('<header class="tab-hero"');
  const footerStart = html.indexOf('<!-- SHELL:FOOTER AUTO START -->');
  if (heroStart < 0 || footerStart < 0 || heroStart >= footerStart) {
    throw new Error('Capabilities: hero/footer boundaries are invalid');
  }

  const content = `<header class="tab-hero capv5-hero" data-name="tab-hero" data-asset="P-121" style="background-image:url('media/capabilities/hero-home-products-montage-poster.webp')">
  <video muted loop playsinline preload="none" poster="media/capabilities/hero-home-products-montage-poster.webp" data-gated-src="media/capabilities/hero-home-products-montage.mp4" data-gated-eager></video>
  <div class="th-in">
    <div class="eyebrow">Capabilities</div>
    <h1>From engineering intent<br>to <em>controlled production</em>.</h1>
    <p class="th-sub">We review requirements, define material and tooling routes, control compound and component production, and release against confirmed project criteria.</p>
  </div>
</header>

<section id="engineering" class="capv5-section after-hero" data-wheel="Engineering" data-name="capabilities.engineering">
  <div class="wrap">
    <div class="capv5-head">
      <div><div class="eyebrow fade">01 · Engineering &amp; Project Development</div><h2 class="fade">Turn project inputs into material, tooling and process requirements.</h2></div>
      <p class="lead fade">We review drawings, 3D data, samples and service conditions to define the material route, critical geometry, tooling and process inputs for production.</p>
    </div>
    <div class="capv5-eng-grid">
      <figure class="capv5-engineering-visual fade" data-asset="P-123"><img loading="lazy" src="media/capabilities/engineering-cad-workstation.webp" alt="Mechanical CAD workstation used for engineering review"></figure>
      <div>
        <div class="capv5-stage-list fade">
          <article class="capv5-stage"><b>01</b><div><h3>Requirements In</h3><p>Drawing, 3D data, sample and service conditions establish the project baseline.</p></div></article>
          <article class="capv5-stage"><b>02</b><div><h3>Material &amp; Geometry Review</h3><p>Polymer route, hardness, interfaces and critical dimensions are reviewed together.</p></div></article>
          <article class="capv5-stage"><b>03</b><div><h3>Tooling &amp; Process Definition</h3><p>Tooling, forming, cure and inspection inputs are defined for the applicable route.</p></div></article>
        </div>
        <p class="capv5-note fade">CAE and tooling analysis can be included when the part geometry, loading or validation plan requires it.</p>
      </div>
    </div>
  </div>
</section>

<section id="production" class="capv5-section" data-wheel="Production Control" data-name="capabilities.production">
  <div class="wrap">
    <div class="capv5-head">
      <div><div class="eyebrow fade">02 · Compounding &amp; Production Control</div><h2 class="fade">Supply as rubber compound or finished components.</h2></div>
      <p class="lead fade">Compound orders cover formulation, mixing and batch release. Component orders continue through forming, cure, finishing, inspection and release.</p>
    </div>
    <div class="capv5-routes fade">
      <article class="capv5-route" data-asset="P-124"><img loading="lazy" src="media/capabilities/compound-mixing-mill.webp" alt="Black rubber compound running through an industrial mixing mill"><span>Route A</span><h3>Rubber Compound Supply</h3><p>Formulation, mixing, batch control and agreed supply form for customers completing downstream processing.</p></article>
      <article class="capv5-route" data-asset="P-125"><img loading="lazy" src="media/capabilities/vulcanized-mold-press.webp" alt="Open compression mold with vulcanized rubber components"><span>Route B</span><h3>Vulcanized Components</h3><p>Molding or extrusion, cure, finishing and release for finished rubber and rubber-metal components.</p></article>
    </div>
    <div class="capv5-controls fade">
      <article class="capv5-control"><b>01</b><h3>Requirement Baseline</h3><p>Part, material, drawing and service inputs are recorded for the project route.</p></article>
      <article class="capv5-control"><b>02</b><h3>Batch Identification</h3><p>Compound and production records remain connected to the applicable batch.</p></article>
      <article class="capv5-control"><b>03</b><h3>Process Window</h3><p>Mixing, forming and cure inputs follow the confirmed process definition.</p></article>
      <article class="capv5-control"><b>04</b><h3>Release Criteria</h3><p>Checks and records are confirmed for the exact part, compound and order.</p></article>
    </div>
  </div>
</section>

<section id="quality" class="capv5-section" data-wheel="Quality" data-name="capabilities.quality">
  <div class="wrap">
    <div class="capv5-head">
      <div><div class="eyebrow fade">03 · Quality &amp; Traceability</div><h2 class="fade">Define what to check, when to check it and what to record.</h2></div>
      <p class="lead fade">Inspection methods, frequency, acceptance criteria and requested records are confirmed for each material, part and order.</p>
    </div>
    <div class="capv5-quality-grid">
      <figure class="capv5-quality-visual fade" data-asset="L-030"><img loading="lazy" src="media/capabilities/quality-rubber-caliper.webp" alt="Digital caliper measuring a black rubber profile"></figure>
      <div class="capv5-quality-copy fade">
        <article class="capv5-quality-step"><b>01</b><div><h3>Plan</h3><p>Define what must be checked, how it will be assessed and what evidence is required.</p></div></article>
        <article class="capv5-quality-step"><b>02</b><div><h3>Control</h3><p>Apply the relevant incoming, in-process and batch checks during production.</p></div></article>
        <article class="capv5-quality-step"><b>03</b><div><h3>Release &amp; Records</h3><p>Confirm final criteria and retain the agreed project and batch documentation.</p></div></article>
        <p class="capv5-iso">Our rubber compound production is supported by an ISO 9001:2015-certified quality management system.</p>
      </div>
    </div>
  </div>
</section>

<section id="company" class="capv5-section" data-wheel="Company &amp; Capacity" data-name="capabilities.company">
  <div class="wrap">
    <div class="capv5-head">
      <div><div class="eyebrow fade">04 · Company &amp; Capacity</div><h2 class="fade">Rubber compound and component manufacturing in Ningguo, Anhui.</h2></div>
      <p class="lead fade">ANHUI ZHIXIN MATERIAL TECHNOLOGY CO., LTD operates its rubber compounding and component manufacturing facility in Ningguo City, Anhui, China.</p>
    </div>
    <div class="capv5-capacity-band fade">
      <div class="capv5-capacity-stat"><b><span data-cap-count="3000">0</span><i>t</i></b><span>Approx. annual rubber-compound mixing capacity</span></div>
      <div class="capv5-capacity-stat"><b><span data-cap-count="15">0</span><i>M+</i></b><span>Molded rubber components per year</span></div>
    </div>
    <div class="capv5-location fade">
      <a class="capv5-map-preview" data-asset="L-020" data-map-destination data-map-amap="https://uri.amap.com/search?keyword=%E5%AE%89%E5%BE%BD%E7%9C%81%E5%AE%A3%E5%9F%8E%E5%B8%82%E5%AE%81%E5%9B%BD%E5%B8%82%E6%B2%B3%E6%B2%A5%E6%BA%AA%E8%A1%97%E9%81%93%E5%A4%96%E7%8E%AF%E4%B8%9C%E8%B7%AF33%E5%8F%B7&amp;city=%E5%AE%81%E5%9B%BD&amp;view=map&amp;callnative=0" data-map-google="https://www.google.com/maps/search/?api=1&amp;query=No.+33,+Waihuan+East+Road,+Ningguo+City,+Anhui,+China" href="https://www.google.com/maps/search/?api=1&amp;query=No.+33,+Waihuan+East+Road,+Ningguo+City,+Anhui,+China" target="_blank" rel="noopener" aria-label="Open the Ningguo manufacturing location in Google Maps">
        <img loading="lazy" src="media/map/ningguo-osm.webp" alt="Map showing Ningguo City in Anhui, China">
        <span class="capv5-map-pin">Ningguo · Anhui</span>
        <span class="capv5-map-credit">Map data © OpenStreetMap contributors · ODbL</span>
      </a>
      <div class="capv5-address-row">
        <address>No. 33, Waihuan East Road, Helixi Street, Ningguo City, Xuancheng City, Anhui Province, China.</address>
        <a class="capv5-map-link" data-map-destination data-map-amap="https://uri.amap.com/search?keyword=%E5%AE%89%E5%BE%BD%E7%9C%81%E5%AE%A3%E5%9F%8E%E5%B8%82%E5%AE%81%E5%9B%BD%E5%B8%82%E6%B2%B3%E6%B2%A5%E6%BA%AA%E8%A1%97%E9%81%93%E5%A4%96%E7%8E%AF%E4%B8%9C%E8%B7%AF33%E5%8F%B7&amp;city=%E5%AE%81%E5%9B%BD&amp;view=map&amp;callnative=0" data-map-google="https://www.google.com/maps/search/?api=1&amp;query=No.+33,+Waihuan+East+Road,+Ningguo+City,+Anhui,+China" href="https://www.google.com/maps/search/?api=1&amp;query=No.+33,+Waihuan+East+Road,+Ningguo+City,+Anhui,+China" target="_blank" rel="noopener"><span data-map-provider>Open in Google Maps</span>&nbsp;→</a>
      </div>
    </div>
  </div>
</section>

<script>
(() => {
  const mapDestinations = [...document.querySelectorAll('[data-map-destination]')];
  const useAmap = document.documentElement.lang.toLowerCase().startsWith('zh');
  mapDestinations.forEach((destination) => {
    destination.href = useAmap ? destination.dataset.mapAmap : destination.dataset.mapGoogle;
    destination.setAttribute('aria-label', useAmap
      ? '在高德地图中打开宁国制造基地'
      : 'Open the Ningguo manufacturing location in Google Maps');
  });
  const mapProvider = document.querySelector('[data-map-provider]');
  if (mapProvider) mapProvider.textContent = useAmap ? 'Open in Amap' : 'Open in Google Maps';

  const counters = [...document.querySelectorAll('[data-cap-count]')];
  const finish = (el) => { el.textContent = Number(el.dataset.capCount).toLocaleString('en-US'); };
  if (!('IntersectionObserver' in window)) {
    counters.forEach(finish);
    return;
  }
  const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    observer.unobserve(entry.target);
    const el = entry.target;
    const end = Number(el.dataset.capCount);
    const start = performance.now();
    const tick = (now) => {
      const progress = Math.min((now - start) / 1400, 1);
      el.textContent = Math.round(end * (1 - Math.pow(1 - progress, 3))).toLocaleString('en-US');
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), { threshold: .6 });
  counters.forEach((counter) => observer.observe(counter));
})();
</script>

`;

  return html.slice(0, heroStart) + content + html.slice(footerStart);
}

const compoundFamilies = [
  {
    slug: 'nr', code: 'NR', name: 'Natural Rubber', title: 'Natural Rubber Compounds', asset: 'P-106',
    image: 'media/compounds/ph-comp-nr.webp',
    summary: 'A core material family considered where elasticity, resilience and dynamic mechanical behavior are central to the application.',
    cues: ['Elastic response', 'Dynamic loading', 'Vibration components'],
  },
  {
    slug: 'sbr', code: 'SBR', name: 'Styrene-Butadiene Rubber', title: 'SBR Compounds', asset: 'P-104',
    image: 'media/compounds/ph-comp-sbr.webp',
    summary: 'A general-purpose family reviewed when processing, wear behavior and commercial targets need to be balanced.',
    cues: ['General industrial use', 'Wear considerations', 'Cost-performance balance'],
  },
  {
    slug: 'epdm', code: 'EPDM', name: 'Ethylene Propylene Diene Rubber', title: 'EPDM Compounds', asset: 'P-100',
    image: 'media/compounds/ph-comp-epdm.webp',
    summary: 'Commonly considered for components exposed to weather, ozone, water or changing outdoor conditions.',
    cues: ['Weather exposure', 'Water-contact review', 'Seals and profiles'],
  },
  {
    slug: 'nbr', code: 'NBR', name: 'Nitrile Rubber', title: 'NBR Compounds', asset: 'P-103',
    image: 'media/compounds/ph-comp-nbr.webp',
    summary: 'A widely used family for projects where oil, fuel or related fluid exposure is an important selection input.',
    cues: ['Oil-contact review', 'Sealing applications', 'Molded components'],
  },
  {
    slug: 'hnbr', code: 'HNBR', name: 'Hydrogenated Nitrile Rubber', title: 'HNBR Compounds', asset: 'P-102',
    image: 'media/compounds/ph-comp-hnbr.webp',
    summary: 'Reviewed for more demanding combinations of heat, oil exposure and mechanical duty than conventional nitrile routes.',
    cues: ['Demanding duty', 'Heat-and-oil review', 'Dynamic sealing'],
  },
  {
    slug: 'cr', code: 'CR', name: 'Chloroprene Rubber', title: 'CR Compounds', asset: 'P-099',
    image: 'media/compounds/ph-comp-cr.webp',
    summary: 'A versatile family considered where weathering, mechanical behavior and moderate fluid exposure must be balanced.',
    cues: ['Balanced performance', 'Weathering review', 'Industrial components'],
  },
  {
    slug: 'mq', code: 'MQ', name: 'Silicone Rubber', title: 'Silicone Rubber Compounds', asset: 'P-107',
    image: 'media/compounds/ph-comp-silicone.webp',
    summary: 'Used as a formulation route for temperature-flexibility, appearance and application-specific color requirements.',
    cues: ['Temperature flexibility', 'White and color review', 'Precision molding'],
  },
  {
    slug: 'fkm', code: 'FKM', name: 'Fluoroelastomer', title: 'FKM Compounds', asset: 'P-101',
    image: 'media/compounds/ph-comp-fkm.webp',
    summary: 'A high-performance family evaluated for demanding temperature and aggressive-media conditions.',
    cues: ['High-performance route', 'Media compatibility', 'Critical sealing'],
  },
  {
    slug: 'aem-acm', code: 'AEM / ACM', name: 'Acrylate Elastomer Families', title: 'AEM / ACM Compounds', asset: 'P-105',
    image: 'media/compounds/ph-band-specialty.webp',
    summary: 'A grouped entry for acrylate elastomer projects involving heat, oil exposure and automotive-duty requirements.',
    cues: ['Heat-and-oil review', 'Automotive duty', 'Project-specific validation'],
  },
  {
    slug: 'nv', code: 'NV', name: 'NBR / PVC Rubber-Plastic Alloy', title: 'NV Rubber-Plastic Alloy Compounds', asset: 'P-109',
    image: 'media/compounds/ph-band-black.webp',
    summary: 'A blended material route reviewed where oil resistance, weathering and processing requirements must be considered together.',
    cues: ['NBR / PVC blend', 'Combined exposure review', 'Custom formulation'],
  },
];

const compoundPrimaryCards = [
  ...compoundFamilies,
  {
    slug: 'white-colored', code: 'COLOR ROUTE', name: 'White & Colored', asset: 'P-108',
    image: 'media/compounds/ph-band-colored.webp',
    summary: 'White, light and custom colors are subject to polymer, pigment, filler, contamination and application review.',
  },
  {
    slug: 'specialty-custom', code: 'PROJECT ROUTE', name: 'Specialty & Custom', asset: 'EXT-C-001',
    image: 'media/compounds/specialty-custom-rubber-sheets.webp',
    summary: 'Additional polymer systems and custom formulations can be evaluated when the core routes do not fit the project.',
  },
];

const compoundsCss = `
/* ---------- V5:Compounds primary visual catalog ---------- */
body[data-page="compounds"] .abadge{display:none!important}
#compound-primary{padding:72px 0 96px}
.compound-primary-intro{max-width:760px;margin-bottom:38px}
.compound-primary-intro .lead{max-width:62ch}
.compound-primary-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));column-gap:2px;row-gap:28px;background:transparent}
.compound-primary-card{position:relative;min-width:0;min-height:clamp(365px,31vw,430px);padding:0;overflow:visible;border:1px solid var(--line);background:#111827;color:var(--ink);font:inherit;text-align:left;cursor:pointer;transition:transform .28s ease,box-shadow .28s ease,filter .28s ease}
.compound-primary-card img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center;filter:saturate(.9) contrast(1.04);transition:transform .65s ease,filter .32s ease}
.compound-primary-card::after{content:"";position:absolute;z-index:1;inset:0;background:linear-gradient(180deg,rgba(3,6,10,.06) 20%,rgba(4,7,12,.38) 52%,rgba(4,7,12,.96) 100%)}
.compound-primary-card::before{content:"";position:absolute;z-index:5;left:50%;bottom:-15px;width:0;height:0;border-left:15px solid transparent;border-right:15px solid transparent;border-top:15px solid var(--accent);opacity:0;transform:translate(-50%,-8px);transition:opacity .22s ease,transform .22s ease}
.compound-primary-card:hover{z-index:2;transform:translateY(-3px)}
.compound-primary-card:hover img{transform:scale(1.025);filter:saturate(1) contrast(1.04)}
.compound-primary-card:focus-visible{z-index:4;outline:2px solid var(--accent);outline-offset:-2px}
.compound-primary-card.is-active{z-index:4;box-shadow:inset 0 0 0 2px var(--accent);transform:translateY(-4px)}
.compound-primary-card.is-active::before{opacity:1;transform:translate(-50%,0)}
.compound-primary-code{position:absolute;z-index:2;top:24px;left:24px;color:var(--accent);font:700 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.13em;text-transform:uppercase}
.compound-primary-copy{position:absolute;z-index:2;left:0;right:0;bottom:0;padding:30px 28px 28px}
.compound-primary-copy h3{max-width:16ch;margin:0 0 12px;font-size:clamp(24px,2.2vw,31px);line-height:1.08;letter-spacing:-.02em}
.compound-primary-copy p{max-width:40ch;margin:0;color:#c6d0df;font-size:13px;line-height:1.62}
.compound-row-rule{position:absolute;z-index:4;left:-1px;right:-1px;bottom:-15px;height:1px;background:rgba(148,163,184,.28);pointer-events:none;transition:opacity .2s ease}
.compound-row-accent{display:none;position:absolute;z-index:5;left:-1px;bottom:-15px;width:52px;height:2px;background:var(--accent);pointer-events:none;transition:opacity .2s ease}
.compound-primary-card:nth-of-type(3n+1) .compound-row-accent{display:block}
.compound-primary-card.has-open-panel .compound-row-rule,.compound-primary-card.has-open-panel .compound-row-accent{opacity:0}
.compound-primary-panel{box-sizing:border-box;grid-column:1/-1;width:100%;height:0;margin-top:-28px;overflow:hidden;border-top:0 solid var(--accent);background:linear-gradient(125deg,#111a2b,#0d1421);opacity:0;transition:height .32s ease,opacity .24s ease,border-top-width .16s ease}
.compound-primary-panel.is-open{height:var(--compound-panel-height);border-top-width:2px;opacity:1}
@media(max-width:900px){.compound-primary-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.compound-primary-card{min-height:390px}.compound-primary-card .compound-row-accent{display:none}.compound-primary-card:nth-of-type(2n+1) .compound-row-accent{display:block}}
@media(max-width:600px){#compound-primary{padding:56px 0 72px}.compound-primary-grid{grid-template-columns:1fr}.compound-primary-card{min-height:390px}.compound-primary-card .compound-row-accent{display:block}.compound-primary-code{top:21px;left:20px}.compound-primary-copy{padding:26px 20px}.compound-primary-copy h3{font-size:27px}body[data-page="compounds"] .foot-grid{grid-template-columns:1fr}}
@media(prefers-reduced-motion:reduce){.compound-primary-card,.compound-primary-card img,.compound-primary-card::before,.compound-primary-panel{transition:none!important}}
`;

function renderCompoundPrimaryCard(card) {
  return `
      <button class="compound-primary-card" type="button" data-compound-card-key="${card.slug}" aria-expanded="false" aria-controls="compound-primary-panel-${card.slug}" data-asset="${card.asset}">
        <img loading="lazy" src="${card.image}" alt="${card.name} material — application example">
        <span class="compound-primary-code">${card.code}</span>
        <span class="compound-primary-copy"><h3>${card.name}</h3><p>${card.summary}</p></span>
        <span class="compound-row-rule" aria-hidden="true"></span>
        <span class="compound-row-accent" aria-hidden="true"></span>
      </button>`;
}

function makeCompoundsCatalog(html) {
  html = replaceOnce(html, '<body>', '<body data-page="compounds">', 'Compounds page scope');
  html = replaceOnce(html, '</style>', `${compoundsCss}\n</style>`, 'Compounds CSS injection');

  const sourceHeroStart = html.indexOf('<header class="tab-hero"');
  const sourceHeroEnd = html.indexOf('</header>', sourceHeroStart);
  const footerStart = html.indexOf('<!-- SHELL:FOOTER AUTO START -->');
  if (sourceHeroStart < 0 || sourceHeroEnd < 0 || footerStart < 0 || sourceHeroEnd >= footerStart) {
    throw new Error('Compounds: hero/footer boundaries are invalid');
  }

  const hero = `<header class="tab-hero" data-name="tab-hero" data-asset="L-010" style="background-image:url('media/hero-rubber-mixing-poster.webp')">
  <video muted loop playsinline preload="none" poster="media/hero-rubber-mixing-poster.webp" data-gated-src="media/hero-rubber-mixing.mp4" data-gated-eager></video>
  <div class="th-in">
    <div class="eyebrow">Rubber Compounds</div>
    <h1>Compounds built around<br><em>application requirements</em>.</h1>
    <p class="th-sub">Explore ten core elastomer families for compound supply and molded rubber production. Polymer, color, hardness, processing route and project documents are confirmed against each application.</p>
  </div>
</header>`;

  const primaryCards = compoundPrimaryCards.map(renderCompoundPrimaryCard).join('\n');
  const body = `

<section id="compound-primary" class="after-hero sec-open" data-name="compounds.primary-catalog">
  <div class="wrap">
    <div class="compound-primary-intro">
      <div class="eyebrow fade">Compound Families</div>
      <h2 class="fade">Explore material and formulation routes.</h2>
      <p class="lead fade">Ten core elastomer families are presented alongside white, colored and project-specific formulation routes.</p>
    </div>
    <div class="compound-primary-grid" data-compound-primary-grid>${primaryCards}</div>
  </div>
</section>

<script>
(() => {
  const grid = document.querySelector('[data-compound-primary-grid]');
  if (!grid) return;
  const cards = [...grid.querySelectorAll('[data-compound-card-key]')];
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let activeCard = null;
  let activePanel = null;
  let resizeFrame = 0;

  const rowFor = card => {
    const top = card.offsetTop;
    return cards.filter(item => Math.abs(item.offsetTop - top) < 2);
  };

  const placePanel = (card, panel) => {
    panel.remove();
    const row = rowFor(card);
    const rowEnd = row[row.length - 1];
    const rowHeight = Math.max(...row.map(item => item.getBoundingClientRect().height));
    cards.forEach(item => item.classList.remove('has-open-panel'));
    row.forEach(item => item.classList.add('has-open-panel'));
    panel.style.setProperty('--compound-panel-height', Math.ceil(rowHeight) + 'px');
    rowEnd.insertAdjacentElement('afterend', panel);
  };

  const closePanel = animate => {
    if (!activeCard || !activePanel) return;
    const card = activeCard;
    const panel = activePanel;
    activeCard = null;
    activePanel = null;
    card.classList.remove('is-active');
    card.setAttribute('aria-expanded', 'false');
    cards.forEach(item => item.classList.remove('has-open-panel'));
    panel.classList.remove('is-open');
    if (animate && !reducedMotion.matches) setTimeout(() => panel.remove(), 330);
    else panel.remove();
  };

  const openPanel = card => {
    grid.querySelectorAll('.compound-primary-panel').forEach(panel => panel.remove());
    const key = card.dataset.compoundCardKey;
    const title = card.querySelector('h3')?.textContent?.trim() || key;
    const panel = document.createElement('div');
    panel.className = 'compound-primary-panel';
    panel.id = 'compound-primary-panel-' + key;
    panel.dataset.compoundPanelFor = key;
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', title + ' reserved expansion area');
    placePanel(card, panel);
    activeCard = card;
    activePanel = panel;
    card.classList.add('is-active');
    card.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => panel.classList.add('is-open'));
  };

  cards.forEach(card => card.addEventListener('click', () => {
    if (activeCard === card) {
      closePanel(true);
      return;
    }
    closePanel(false);
    openPanel(card);
  }));

  addEventListener('resize', () => {
    if (!activeCard || !activePanel || resizeFrame) return;
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      if (activeCard && activePanel) placePanel(activeCard, activePanel);
    });
  });
})();
</script>

`;

  return html.slice(0, sourceHeroStart) + hero + body + html.slice(footerStart);
}

function removeAboutLilei(html) {
  html = replaceOnce(html, 'Two companies.<br>One <em>supply chain</em>.', 'Built around manufacturing.<br>Focused on <em>rubber technology</em>.', 'About hero heading');
  html = replaceOnce(
    html,
    'ANHUI ZHIXIN MATERIAL TECHNOLOGY (manufacturing) and NINGBO LILEI IMPORT AND EXPORT (global trade) work as one team — delivering rubber compounds and molded products from our China plant to global customers.',
    'ANHUI ZHIXIN MATERIAL TECHNOLOGY develops rubber compounds and molded products at its manufacturing base in Anhui, China.',
    'About hero company copy',
  );
  html = replaceOnce(html, 'Integrated manufacturing &amp; global export.', 'Integrated compounding &amp; component manufacturing.', 'About section heading');
  html = replaceOnce(
    html,
    'One group, two specialized companies — here is how the manufacturing base and the export arm divide the work.',
    'The Anhui manufacturing base brings material development, mixing and molded-component production into one operating chain.',
    'About section lead',
  );
  html = replaceRegexOnce(
    html,
    /\s*<div class="abox fade" data-name="about\.box-2">[\s\S]*?<\/div>/g,
    '',
    'About Lilei company box',
  );
  html = replaceOnce(html, 'Engineering-Driven Partnership', 'Engineering-Driven Manufacturing', 'About third box heading');
  html = replaceOnce(
    html,
    'Together, we offer a seamless chain from material R&amp;D and manufacturing to international delivery — a true engineering partner, not just a trading supplier.',
    'Material development, mixing and molded production are coordinated around the project requirements.',
    'About third box copy',
  );
  html = replaceOnce(
    html,
    "Through NINGBO LILEI IMPORT AND EXPORT CO., LTD, we provide professional international trade service — backed by ANHUI ZHIXIN's manufacturing capability, engineering communication and OEM development support.",
    'For project-specific supply requests, the team coordinates technical communication, manufacturing and shipment documentation from the Anhui base.',
    'About global-support copy',
  );
  return html;
}

function removeFaqLilei(html) {
  return replaceOnce(
    html,
    'We are a manufacturer. ANHUI ZHIXIN MATERIAL TECHNOLOGY CO., LTD runs the compounding and molding factory in Anhui, China, while NINGBO LILEI IMPORT AND EXPORT CO., LTD handles global export — so you deal directly with the maker.',
    'ANHUI ZHIXIN MATERIAL TECHNOLOGY CO., LTD operates the compounding and molding facility in Anhui, China.',
    'FAQ company-role answer',
  );
}

function removeQuoteLilei(html) {
  return replaceOnce(
    html,
    '          <li><strong>Export:</strong> NINGBO LILEI IMPORT AND EXPORT CO., LTD</li>\n',
    '',
    'Quote Lilei export item',
  );
}

const quoteV5Css = `
/* ---------- V5:Get a Quote form-first layout ---------- */
body[data-page="quote"]{overflow-x:hidden;background:var(--bg)}
.quotev5-section{padding:72px 0 96px;background:var(--bg)}
.quotev5-eyebrow{margin-bottom:24px}
.quotev5-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.quotev5-form-grid .fs-msg{grid-column:1/-1;margin:0}
.quotev5-field{min-width:0}
.quotev5-field--wide,.quotev5-action-row{grid-column:1/-1}
.quotev5-field input,.quotev5-field textarea{width:100%;border:1px solid var(--line);border-radius:2px;background:#0c1421;color:var(--ink);padding:16px 17px;font:inherit;transition:border-color .22s,background .22s,box-shadow .22s}
.quotev5-field input{min-height:54px}
.quotev5-field textarea{min-height:152px;resize:vertical}
.quotev5-field input::placeholder,.quotev5-field textarea::placeholder{color:#8190a5}
.quotev5-field input:focus,.quotev5-field textarea:focus{outline:none;border-color:var(--accent);background:#0e1827;box-shadow:0 0 0 2px rgba(245,158,11,.12)}
.quotev5-field [aria-invalid="true"]{border-color:#f87171}
.quotev5-action-row{display:grid;grid-template-columns:minmax(304px,1fr) 190px;gap:14px;align-items:stretch;margin-top:2px}
.quotev5-verification-shell{min-height:72px;display:flex;flex-direction:column;align-items:stretch;justify-content:center;overflow:hidden;border:1px solid #2c384d;background:linear-gradient(90deg,#111a29,#0d1420);padding:10px 12px}
.quotev5-verification-shell [data-hybrid-verification-compat="turnstile"]{width:100%;min-width:0}
.quotev5-verification-shell .cf-turnstile{width:100%;min-width:0}
.quotev5-verification-status{margin:7px 0 0;color:var(--ink-dim);font-size:11px;line-height:1.45}
.quotev5-verification-status:not([data-visible="true"]){position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap}
.quotev5-verification-status[data-state="error"]{color:#fca5a5}
.quotev5-verification-status[data-state="verified"]{color:#86efac}
.quotev5-submit{min-height:72px;width:100%;border:0;border-radius:2px;background:var(--accent);color:#0a0e17;font-family:inherit;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;cursor:pointer;transition:background .22s,transform .22s,opacity .22s}
.quotev5-submit:hover:not(:disabled){background:#fbbf24;transform:translateY(-2px)}
.quotev5-submit:focus-visible{outline:2px solid #fff;outline-offset:3px}
.quotev5-submit:disabled{cursor:not-allowed;opacity:.48}
.quotev5-privacy-row{grid-column:1/-1;display:flex;align-items:center;gap:9px;margin-top:-2px;color:var(--ink-dim);font-size:11px;line-height:1.55}
.quotev5-privacy-link{appearance:none;border:0;background:none;color:var(--ink);padding:0;font:inherit;text-decoration:underline;text-underline-offset:3px;cursor:pointer}
.quotev5-privacy-link:hover{color:var(--accent)}
.quotev5-privacy-link:focus-visible,.quotev5-privacy-close:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
.quotev5-privacy-modal[hidden]{display:none}
.quotev5-privacy-modal:not([hidden]){position:fixed;z-index:120;inset:0;display:grid;place-items:center;padding:24px;background:rgba(4,8,14,.82)}
.quotev5-privacy-dialog{width:min(600px,100%);max-height:min(720px,calc(100vh - 48px));overflow:auto;border:1px solid #334155;background:#0d1624;color:var(--ink);padding:28px;box-shadow:0 24px 70px rgba(0,0,0,.5)}
.quotev5-privacy-head{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;margin-bottom:18px}
.quotev5-privacy-head h2{margin:0;font-size:24px;line-height:1.2}
.quotev5-privacy-close{flex:0 0 auto;border:1px solid #475569;background:#111c2c;color:var(--ink);min-width:38px;min-height:38px;font:700 18px/1 inherit;cursor:pointer}
.quotev5-privacy-copy{color:var(--ink-dim);font-size:13px;line-height:1.75}
.quotev5-privacy-copy p{margin:0 0 13px}
.quotev5-privacy-copy p:last-child{margin-bottom:0}
.quotev5-privacy-copy a{color:var(--ink);text-decoration:underline;text-underline-offset:3px}
.quotev5-contact-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:2px;margin-top:74px;padding-top:28px;border-top:1px solid var(--line)}
.quotev5-contact-item{min-height:92px;padding:22px 24px;border:1px solid var(--line);background:var(--panel)}
.quotev5-contact-item b{display:block;margin-bottom:9px;color:var(--ink-dim);font-size:10px;letter-spacing:.14em;text-transform:uppercase}
.quotev5-contact-item a{color:var(--ink);font-size:15px;line-height:1.5;transition:color .2s}
.quotev5-contact-item a:hover{color:var(--accent)}
.quotev5-location{margin-top:38px}
.quotev5-map-preview{position:relative;display:block;min-height:430px;overflow:hidden;border:1px solid var(--line);background:var(--panel);color:#fff}
.quotev5-map-preview::after{content:"";position:absolute;z-index:1;inset:0;background:linear-gradient(180deg,rgba(6,10,17,.04),rgba(6,10,17,.24))}
.quotev5-map-preview img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:saturate(.92) contrast(1.06) brightness(.9);transition:transform .5s,filter .5s}
.quotev5-map-preview:hover img{transform:scale(1.015);filter:saturate(.98) contrast(1.06) brightness(.94)}
.quotev5-map-pin{position:absolute;z-index:2;left:50%;top:50%;display:flex;align-items:center;gap:10px;padding:10px 13px;background:rgba(10,14,23,.9);font:700 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.1em;text-transform:uppercase;white-space:nowrap;transform:translate(-50%,-50%)}
.quotev5-map-pin::before{content:"";width:10px;height:10px;border:3px solid var(--accent);border-radius:50%;box-shadow:0 0 0 6px rgba(245,158,11,.2)}
.quotev5-map-credit{position:absolute;z-index:2;left:16px;bottom:14px;padding:7px 9px;background:rgba(10,14,23,.9);color:var(--ink-dim);font-size:10px;letter-spacing:.06em}
.quotev5-address-row{display:flex;justify-content:space-between;gap:30px;align-items:flex-start;padding:24px 2px 0}
.quotev5-address-row address{max-width:72ch;color:var(--ink-dim);font-size:14px;font-style:normal;line-height:1.7}
.quotev5-map-link{display:inline-flex;flex:0 0 auto;align-items:center;min-height:42px;color:var(--ink);font-size:12px;font-weight:700;letter-spacing:.04em;transition:color .2s}
.quotev5-map-link:hover{color:var(--accent)}
@media(max-width:720px){.quotev5-section{padding:58px 0 72px}.quotev5-form-grid,.quotev5-action-row,.quotev5-contact-row{grid-template-columns:1fr}.quotev5-field--wide,.quotev5-action-row,.quotev5-form-grid .fs-msg,.quotev5-privacy-row{grid-column:auto}.quotev5-submit{min-height:54px}.quotev5-contact-row{margin-top:58px}.quotev5-map-preview{min-height:300px}.quotev5-address-row{display:block;padding-top:20px}.quotev5-map-link{margin-top:14px}}
@media(max-width:380px){.quotev5-verification-shell{padding:8px}.quotev5-privacy-modal:not([hidden]){padding:14px}.quotev5-privacy-dialog{max-height:calc(100vh - 28px);padding:22px}}
`;

function replaceQuoteContent(html) {
  const previewTestSiteKey = '1x00000000000000000000AA';
  const previewTestSiteKeys = new Set([
    '1x00000000000000000000AA',
    '2x00000000000000000000AB',
    '1x00000000000000000000BB',
    '2x00000000000000000000BB',
    '3x00000000000000000000FF',
  ]);
  const configuredSiteKey = (process.env.ZX_TURNSTILE_SITE_KEY || '').trim();
  const turnstileSiteKey = configuredSiteKey || previewTestSiteKey;
  if (!/^[A-Za-z0-9_-]{20,80}$/.test(turnstileSiteKey)) {
    throw new Error('Quote Turnstile site key contains unsupported characters');
  }
  const turnstileMode = previewTestSiteKeys.has(turnstileSiteKey) ? 'preview-test' : 'production';
  const verification = `<div class="quotev5-verification-shell">
          <div class="g-recaptcha" data-hybrid-verification-compat="turnstile">
            <div class="cf-turnstile" data-sitekey="${turnstileSiteKey}" data-size="flexible" data-theme="light" data-callback="zxTurnstileVerified" data-error-callback="zxTurnstileError" data-expired-callback="zxTurnstileExpired" data-zx-turnstile-mode="${turnstileMode}" data-zx-expected-hostname="www.zxrubbertech.com" aria-describedby="quote-verification-status"></div>
          </div>
          <p id="quote-verification-status" class="quotev5-verification-status" role="status" aria-live="polite">Complete the verification before sending your request.</p>
        </div>`;
  const turnstileLoader = '\n<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>';

  const section = `<section id="contact" class="after-hero quotev5-section" data-name="contact">
  <div class="wrap">
    <div class="eyebrow quotev5-eyebrow fade">Project Information</div>
    <form id="contact-form" class="quotev5-form-grid fade" data-name="contact.form" action="https://formspree.io/f/mrpzqado" method="post" data-error-preserves-values="true">
      <div class="fs-msg ok" data-fs-success role="status" aria-live="polite"></div>
      <div class="fs-msg err" data-fs-error role="alert" aria-live="assertive"></div>
      <div class="quotev5-field">
        <input type="text" name="name" placeholder="Your Name *" aria-label="Your Name" data-fs-field required>
        <span class="fs-field-err" data-fs-error="name"></span>
      </div>
      <div class="quotev5-field"><input type="text" name="company" placeholder="Company Name" aria-label="Company Name" data-fs-field></div>
      <div class="quotev5-field">
        <input type="email" name="email" placeholder="Email Address *" aria-label="Email Address" data-fs-field required>
        <span class="fs-field-err" data-fs-error="email"></span>
      </div>
      <div class="quotev5-field"><input type="text" name="phone" placeholder="WhatsApp / Phone" aria-label="WhatsApp or Phone" data-fs-field></div>
      <div class="quotev5-field quotev5-field--wide">
        <textarea name="message" placeholder="Project Requirement *" aria-label="Project Requirement" data-fs-field required></textarea>
        <span class="fs-field-err" data-fs-error="message"></span>
      </div>
      <div class="quotev5-action-row">
        ${verification}
        <button type="submit" class="quotev5-submit" data-fs-submit-btn>Send Request</button>
      </div>
      <div class="quotev5-privacy-row">
        <span>Protected against automated abuse by Cloudflare Turnstile.</span>
        <button type="button" class="quotev5-privacy-link" data-privacy-open aria-label="Open privacy notice" aria-controls="quote-privacy-dialog">Privacy notice</button>
      </div>
    </form>

    <div id="quote-privacy-dialog" class="quotev5-privacy-modal" role="dialog" aria-modal="true" aria-labelledby="quote-privacy-title" hidden>
      <div class="quotev5-privacy-dialog" data-privacy-panel>
        <div class="quotev5-privacy-head">
          <h2 id="quote-privacy-title">Quote form privacy notice</h2>
          <button type="button" class="quotev5-privacy-close" data-privacy-close aria-label="Close privacy notice">×</button>
        </div>
        <div class="quotev5-privacy-copy">
          <p>We collect the name, company, email, phone, and project requirements you choose to provide through this form.</p>
          <p>We use this information only to respond to your inquiry and provide engineering or quotation support. Form submissions are delivered through Formspree, and Cloudflare Turnstile processes device and network signals to prevent automated abuse.</p>
          <p>We retain inquiry information only for as long as needed for business follow-up and applicable record-keeping obligations. To access, correct, or delete your inquiry information, email <a href="mailto:martin@zxrubbertech.com">martin@zxrubbertech.com</a>.</p>
          <p>Submitting this form does not subscribe you to marketing communications.</p>
        </div>
      </div>
    </div>

    <div class="quotev5-contact-row fade" data-name="contact.info">
      <div class="quotev5-contact-item"><b>Email</b><a href="mailto:martin@zxrubbertech.com">martin@zxrubbertech.com</a></div>
      <div class="quotev5-contact-item"><b>WhatsApp</b><a href="https://wa.me/8615256225135" target="_blank" rel="noopener">+86 152 5622 5135</a></div>
    </div>

    <div class="quotev5-location fade" data-name="contact.map">
      <a class="quotev5-map-preview" data-map-destination data-map-amap="https://uri.amap.com/search?keyword=%E5%AE%89%E5%BE%BD%E7%9C%81%E5%AE%A3%E5%9F%8E%E5%B8%82%E5%AE%81%E5%9B%BD%E5%B8%82%E6%B2%B3%E6%B2%A5%E6%BA%AA%E8%A1%97%E9%81%93%E5%A4%96%E7%8E%AF%E4%B8%9C%E8%B7%AF33%E5%8F%B7&amp;city=%E5%AE%81%E5%9B%BD&amp;view=map&amp;callnative=0" data-map-google="https://www.google.com/maps/search/?api=1&amp;query=No.+33,+Waihuan+East+Road,+Ningguo+City,+Anhui,+China" href="https://www.google.com/maps/search/?api=1&amp;query=No.+33,+Waihuan+East+Road,+Ningguo+City,+Anhui,+China" target="_blank" rel="noopener" aria-label="Open the Ningguo manufacturing location in Google Maps">
        <img loading="lazy" src="media/map/ningguo-osm.webp" alt="Map showing Ningguo City in Anhui, China">
        <span class="quotev5-map-pin">Ningguo · Anhui</span>
        <span class="quotev5-map-credit">Map data © OpenStreetMap contributors · ODbL</span>
      </a>
      <div class="quotev5-address-row">
        <address>No. 33, Waihuan East Road, Helixi Street, Ningguo City, Xuancheng City, Anhui Province, China.</address>
        <a class="quotev5-map-link" data-map-destination data-map-amap="https://uri.amap.com/search?keyword=%E5%AE%89%E5%BE%BD%E7%9C%81%E5%AE%A3%E5%9F%8E%E5%B8%82%E5%AE%81%E5%9B%BD%E5%B8%82%E6%B2%B3%E6%B2%A5%E6%BA%AA%E8%A1%97%E9%81%93%E5%A4%96%E7%8E%AF%E4%B8%9C%E8%B7%AF33%E5%8F%B7&amp;city=%E5%AE%81%E5%9B%BD&amp;view=map&amp;callnative=0" data-map-google="https://www.google.com/maps/search/?api=1&amp;query=No.+33,+Waihuan+East+Road,+Ningguo+City,+Anhui,+China" href="https://www.google.com/maps/search/?api=1&amp;query=No.+33,+Waihuan+East+Road,+Ningguo+City,+Anhui,+China" target="_blank" rel="noopener"><span data-map-provider>Open in Google Maps</span>&nbsp;→</a>
      </div>
    </div>
  </div>
</section>

<script>
(() => {
  const mapDestinations = [...document.querySelectorAll('[data-map-destination]')];
  const useAmap = document.documentElement.lang.toLowerCase().startsWith('zh');
  mapDestinations.forEach((destination) => {
    destination.href = useAmap ? destination.dataset.mapAmap : destination.dataset.mapGoogle;
    destination.setAttribute('aria-label', useAmap
      ? '在高德地图中打开宁国制造基地'
      : 'Open the Ningguo manufacturing location in Google Maps');
  });
  const mapProvider = document.querySelector('[data-map-provider]');
  if (mapProvider) mapProvider.textContent = useAmap ? 'Open in Amap' : 'Open in Google Maps';

  const quoteForm = document.getElementById('contact-form');
  const submitButton = quoteForm?.querySelector('[data-fs-submit-btn]');
  const successMessage = quoteForm?.querySelector('[data-fs-success]');
  const errorMessage = quoteForm?.querySelector('[data-fs-error]:not([data-fs-error-name])');
  const verificationStatus = document.getElementById('quote-verification-status');

  const setVerificationStatus = (message, state, visible = true) => {
    if (!verificationStatus) return;
    verificationStatus.textContent = message;
    verificationStatus.dataset.state = state;
    verificationStatus.dataset.visible = visible ? 'true' : 'false';
  };

  window.zxTurnstileVerified = () => {
    setVerificationStatus('Verification complete. You can send your request.', 'verified');
  };
  window.zxTurnstileError = () => {
    setVerificationStatus('Verification is unavailable. Please try again or use the email or WhatsApp links below.', 'error');
  };
  window.zxTurnstileExpired = () => {
    setVerificationStatus('Verification expired. Please complete it again.', 'error');
  };

  const sanitizeFormspreeFailureDetail = (value) => {
    if (typeof value !== 'string') return '';
    return value
      .replace(/\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}\\b/g, '[redacted]')
      .replace(/\\b(?:https?:\\/\\/|www\\.)\\S+/gi, '[redacted]')
      .replace(/\\b[A-Za-z0-9_-]{20,}\\b/g, '[redacted]')
      .replace(/[\\u0000-\\u001f\\u007f]/g, ' ')
      .replace(/\\s+/g, ' ')
      .trim()
      .slice(0, 180);
  };

  const readFormspreeFailureDetail = async (response) => {
    let payload;
    try {
      payload = await response.clone().json();
    } catch {
      return '';
    }
    const candidates = [];
    if (Array.isArray(payload?.errors)) {
      payload.errors.forEach((item) => {
        if (typeof item?.code === 'string') candidates.push(item.code);
        if (typeof item?.message === 'string') candidates.push(item.message);
      });
    }
    if (typeof payload?.error === 'string') candidates.push(payload.error);
    if (typeof payload?.message === 'string') candidates.push(payload.message);
    return sanitizeFormspreeFailureDetail(candidates.join(' · '));
  };

  if (quoteForm && submitButton && successMessage && errorMessage) {
    quoteForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      successMessage.textContent = '';
      errorMessage.textContent = '';
      if (!quoteForm.reportValidity()) return;

      const formData = new FormData(quoteForm);
      if (!formData.get('cf-turnstile-response')) {
        setVerificationStatus('Complete the verification before sending your request. You can also use email or WhatsApp below.', 'error');
        return;
      }

      submitButton.disabled = true;
      submitButton.setAttribute('aria-disabled', 'true');
      submitButton.textContent = 'Sending…';
      try {
        const response = await fetch(quoteForm.action, {
          method: 'POST',
          body: formData,
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) {
          const failureDetail = await readFormspreeFailureDetail(response);
          errorMessage.textContent = 'Request could not be sent (Formspree HTTP ' + response.status
            + (failureDetail ? ' · ' + failureDetail : '')
            + '). Please try again or email us directly. Your entered details have been kept.';
          window.turnstile?.reset();
          setVerificationStatus('Please complete the verification again before retrying.', 'error');
          return;
        }
        successMessage.textContent = 'Thank you! Your inquiry has been sent. We will reply within 24 hours.';
        quoteForm.reset();
        window.turnstile?.reset();
        setVerificationStatus('Verification reset after successful submission.', 'verified', false);
      } catch {
        errorMessage.textContent = 'Request could not reach Formspree (network error). Please try again or email us directly. Your entered details have been kept.';
        window.turnstile?.reset();
        setVerificationStatus('Please complete the verification again before retrying.', 'error');
      } finally {
        submitButton.disabled = false;
        submitButton.removeAttribute('aria-disabled');
        submitButton.textContent = 'Send Request';
      }
    });
  }

  const privacyDialog = document.getElementById('quote-privacy-dialog');
  const privacyOpen = document.querySelector('[data-privacy-open]');
  const privacyClose = privacyDialog?.querySelector('[data-privacy-close]');
  let privacyReturnFocus = null;
  const closePrivacy = () => {
    if (!privacyDialog || privacyDialog.hidden) return;
    privacyDialog.hidden = true;
    privacyReturnFocus?.focus();
  };
  privacyOpen?.addEventListener('click', () => {
    if (!privacyDialog) return;
    privacyReturnFocus = document.activeElement;
    privacyDialog.hidden = false;
    privacyClose?.focus();
  });
  privacyClose?.addEventListener('click', closePrivacy);
  privacyDialog?.addEventListener('click', (event) => {
    if (event.target === privacyDialog) closePrivacy();
  });
  privacyDialog?.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closePrivacy();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...privacyDialog.querySelectorAll('a[href],button:not([disabled])')];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
})();
</script>`;

  html = replaceOnce(html, '</style>', `${quoteV5Css}\n</style>`, 'Quote V5 CSS');
  html = replaceRegexOnce(
    html,
    /<section id="contact" class="after-hero" data-name="contact">[\s\S]*?<\/section>/g,
    section,
    'Quote V5 content section',
  );
  html = replaceRegexOnce(
    html,
    /\n\/\* Formspree init[\s\S]*?\nformspree\('initForm',[\s\S]*?\n\}\);\n/g,
    '\n',
    'Quote legacy Formspree initialization',
  );
  html = replaceOnce(
    html,
    '<script src="https://unpkg.com/@formspree/ajax@1" defer></script>',
    '',
    'Quote legacy Formspree loader',
  );
  return html.replace('</body>', `${turnstileLoader}\n</body>`);
}

const v5HeroMedia = {
  faq: {
    previousAsset: 'P-079',
    asset: 'P-126',
    video: 'media/faq/hero-precision-rubber-inspection.mp4',
    poster: 'media/faq/hero-precision-rubber-inspection-poster.webp',
  },
  quote: {
    previousAsset: 'P-078',
    asset: 'P-127',
    video: 'media/quote/hero-drawing-to-rubber-part.mp4',
    poster: 'media/quote/hero-drawing-to-rubber-part-poster.webp',
  },
};

function replaceV5HeroMedia(html, stem) {
  const media = v5HeroMedia[stem];
  html = replaceOnce(html, '<body>', `<body data-page="${stem}">`, `${stem} page scope`);
  html = replaceOnce(
    html,
    '</style>',
    `body[data-page="${stem}"] .tab-hero>.abadge{display:none!important}\n@media(max-width:620px){body[data-page="${stem}"] .foot-grid{grid-template-columns:1fr}}\n</style>`,
    `${stem} hero badge suppression`,
  );
  html = replaceRegexOnce(
    html,
    new RegExp(`<header class="tab-hero" data-name="tab-hero" data-asset="${media.previousAsset}" style="background-image:url\\('[^']+'\\)">`, 'g'),
    `<header class="tab-hero" data-name="tab-hero" data-asset="${media.asset}" style="background-image:url('${media.poster}')">`,
    `${stem} hero container`,
  );
  html = replaceRegexOnce(
    html,
    /  <video muted loop playsinline preload="none" poster="[^"]+" data-gated-src="[^"]+" data-gated-eager aria-hidden="true"><\/video>/g,
    `  <video muted loop playsinline preload="none" poster="${media.poster}" data-gated-src="${media.video}" data-gated-eager aria-hidden="true"></video>`,
    `${stem} hero video`,
  );
  html = replaceRegexOnce(
    html,
    /\n    <p class="th-note">Hero footage:[\s\S]*?<\/p>/g,
    '',
    `${stem} hero placeholder note`,
  );
  return html;
}

const faqSeoCss = `
/* ---------- V5:FAQ grouped buyer questions ---------- */
.faq-groups{margin-top:34px}
.faq-group+.faq-group{margin-top:58px}
.faq-group-head{display:flex;align-items:center;gap:16px;margin:0 0 16px;color:var(--muted);font-size:12px;letter-spacing:.14em;text-transform:uppercase}
.faq-group-head::after{content:"";height:1px;flex:1;background:var(--line)}
.faq-group .faq-list{margin-top:0}
@media(max-width:620px){.faq-group+.faq-group{margin-top:44px}.faq-group-head{font-size:11px}}
`;

const faqSeoSection = `<section id="faq" class="after-hero" data-name="faq">
  <div class="wrap">
    <h2 class="fade">Frequently asked questions.</h2>
    <div class="faq-groups">
      <section class="faq-group" aria-labelledby="faq-group-1">
        <h3 id="faq-group-1" class="faq-group-head">01 · Manufacturing &amp; Materials</h3>
        <div class="faq-list">
          <details data-name="faq.item-1"><summary>Are you a rubber manufacturer or a trading company?</summary><p>ANHUI ZHIXIN MATERIAL TECHNOLOGY CO., LTD operates its rubber compounding and component manufacturing facility in Ningguo, Anhui, China.</p></details>
          <details data-name="faq.item-2"><summary>Which rubber manufacturing processes do you perform in-house?</summary><p>We carry out rubber compounding, compression molding, rubber injection molding, extrusion and rubber-to-metal bonding in-house.</p></details>
          <details data-name="faq.item-3"><summary>Which rubber materials can you compound?</summary><p>We compound NR, SBR, CR, NBR, HNBR, EPDM, silicone rubber, FKM, ACM / AEM and selected rubber-plastic alloy systems.</p></details>
          <details data-name="faq.item-4"><summary>Can you recommend a rubber material if we have not specified one?</summary><p>Yes. We review the operating temperature, contact media, target hardness, expected service life and application environment to recommend a suitable polymer and formulation route.</p></details>
          <details data-name="faq.item-5"><summary>Can you develop an OEM / ODM rubber part from a drawing or physical sample?</summary><p>Yes. Drawings are preferred. When only a physical sample is available, we can evaluate dimensional measurement, material analysis and performance matching before confirming the development route.</p></details>
          <details data-name="faq.item-6"><summary>Can you make black, white and colored rubber compounds or custom formulations?</summary><p>Yes. We support black, white and colored compounds, color-sample matching, specified hardness and special-performance formulation development. Feasibility is reviewed against the polymer, pigment, filler, contamination-control and application requirements.</p></details>
          <details data-name="faq.item-7"><summary>What is your production capacity?</summary><p>Our facility has an annual rubber-compound capacity of approximately 3,000 metric tons and produces more than 15 million molded rubber components per year.</p></details>
        </div>
      </section>
      <section class="faq-group" aria-labelledby="faq-group-2">
        <h3 id="faq-group-2" class="faq-group-head">02 · Orders &amp; Development</h3>
        <div class="faq-list">
          <details data-name="faq.item-8"><summary>What is your minimum order quantity for rubber compounds and molded parts?</summary><p>The standard MOQ for regular rubber compounds is 2 metric tons. The MOQ for specialty compounds and molded or vulcanized rubber products is confirmed according to the material, part dimensions, manufacturing process and expected volume.</p></details>
          <details data-name="faq.item-9"><summary>How quickly do you respond and provide a quotation?</summary><p>We normally acknowledge new inquiries within 24 hours. A formal quotation is typically provided within 2–7 business days after we receive enough technical and commercial information. Tooling, sample and production lead times are confirmed for each project.</p></details>
          <details data-name="faq.item-10"><summary>Do you accept samples, trial molding and small-batch production?</summary><p>In most cases, yes. Samples, trial molding and small-batch validation can be evaluated. Feasibility and any minimum trial quantity are confirmed according to the material, tooling and process requirements.</p></details>
          <details data-name="faq.item-11"><summary>How do you handle mold design, tooling cost and existing customer molds?</summary><p>Tool design and manufacturing responsibility, tooling cost and the use of an existing customer mold are evaluated for each project. Compatibility is confirmed against the part design, mold condition and required production process.</p></details>
        </div>
      </section>
      <section class="faq-group" aria-labelledby="faq-group-3">
        <h3 id="faq-group-3" class="faq-group-head">03 · Quality &amp; Delivery</h3>
        <div class="faq-list">
          <details data-name="faq.item-12"><summary>Which quality documents can you provide?</summary><p>According to the project requirements, we can provide applicable records such as dimensional inspection reports, material reports, outgoing inspection reports, first article inspection reports, certificates of analysis, PPAP documents and third-party test reports. Required documents should be confirmed before the order.</p></details>
          <details data-name="faq.item-13"><summary>Do you provide batch traceability?</summary><p>Yes. Finished products can be traced to the applicable rubber-compound batch, production date and inspection records through our production documentation.</p></details>
          <details data-name="faq.item-14"><summary>Do you accept NDAs and protect customer project information?</summary><p>Yes. Customer drawings, molds, formulas and project documents are handled according to the agreed NDA and project confidentiality requirements.</p></details>
          <details data-name="faq.item-15"><summary>Do you support export packaging and flexible trade terms?</summary><p>Yes. We support export packaging, customer labels, pallets and sea or air shipment arrangements. EXW and FOB are common trade terms, and other terms can be adjusted to customer requirements and confirmed in the quotation.</p></details>
        </div>
      </section>
    </div>
  </div>
</section>`;

function replaceFaqSeoContent(html) {
  html = replaceOnce(
    html,
    '<title>v5 · FAQ · Demo A — ZHIXIN RUBBER TECH</title>',
    '<title>Rubber Manufacturing FAQ | ZHIXIN RUBBER TECH</title>\n<meta name="description" content="Answers about rubber compounding, molding, material selection, MOQ, tooling, quality records, traceability, custom development and flexible export terms.">\n<link rel="icon" href="data:,">',
    'FAQ SEO metadata',
  );
  html = replaceOnce(html, '</style>', `${faqSeoCss}\n</style>`, 'FAQ grouped content CSS');
  html = replaceOnce(html, 'Answers,<br>before you <em>ask</em>.', 'Rubber manufacturing,<br><em>answered clearly</em>.', 'FAQ hero heading');
  html = replaceOnce(
    html,
    'Common questions from automotive and industrial buyers about our rubber manufacturing and OEM service.',
    'Practical answers on in-house processes, material selection, custom development, MOQ, quality records and export supply.',
    'FAQ hero introduction',
  );
  html = replaceRegexOnce(
    html,
    /<section id="faq" class="after-hero" data-name="faq">[\s\S]*?<\/section>/g,
    faqSeoSection,
    'FAQ grouped question section',
  );
  html = replaceOnce(html, '<h2>Ask us directly.</h2>', '<h2>Need a project-specific answer?</h2>', 'FAQ closing CTA heading');
  html = replaceOnce(
    html,
    '<p>If your question is not covered above, send it over — engineering and sales reply within 24 hours.</p>',
    '<p>Send your drawing, sample, material requirements and expected volume. We normally acknowledge new inquiries within 24 hours.</p>',
    'FAQ closing CTA copy',
  );
  return html;
}

function visibleText(html) {
  return html.replace(/data:[^"']+/g, '');
}

for (const [stem, source] of Object.entries(sourceMatrix)) {
  let html = readFileSync(source, 'utf8');
  html = normalizeTitle(html);
  html = normalizeLinks(html);

  if (stem === 'compounds') {
    html = replaceOnce(
      html,
      '<title>v5 · Solutions &amp; Materials ·',
      '<title>v5 · Rubber Compounds ·',
      'Compounds document title',
    );
    html = makeCompoundsCatalog(html);
  }
  if (stem === 'industries') html = makeIndustriesPage(html);
  if (stem === 'capabilities') html = makeCapabilitiesPage(html);
  if (stem === 'about') html = removeAboutLilei(html);
  if (stem === 'faq') html = replaceFaqSeoContent(replaceV5HeroMedia(removeFaqLilei(html), stem));
  if (stem === 'quote') html = replaceQuoteContent(replaceV5HeroMedia(removeQuoteLilei(html), stem));

  html = applyApprovedV5CuratedMedia(html, stem);

  if (publicStems.has(stem)) html = applyApprovedGate6VisibleCopy(html, stem);

  if (publicStems.has(stem)) {
    html = normalizeLinks(html);
    html = consolidateCapabilitiesNavigation(html, stem === 'capabilities');
    html = mapCapabilitiesLinks(html);
    html = injectV5HeaderBrand(html);
    html = injectV5Footer(html);
  }
  html = normalizeV5Brand(html);
  html = normalizeLinks(html);

  if (publicStems.has(stem)) html = normalizeV5FragmentTargets(html, stem);
  if (publicStems.has(stem)) html = applyV5SeoHead(html, stem, { profile: 'preview' });
  if (publicStems.has(stem)) {
    html = externalizeV5DataImages(html, stem);
    html = preserveV5ImageLayout(html, stem);
    html = addV5ImageDimensions(html);
  }

  if (publicStems.has(stem) && /lilei/i.test(visibleText(html))) {
    throw new Error(`${stem}: Lilei text remains after approved cleanup`);
  }

  const output = inner(`${stem}-v5.html`);
  writeFileSync(output, html);
  console.log(`${stem}: ${source} -> ${output}`);
}

const legacyCapabilityTargets = {
  engineering: 'capabilities-v5.html#engineering',
  manufacturing: 'capabilities-v5.html#production',
  about: 'capabilities-v5.html#company',
};

for (const [stem, target] of Object.entries(legacyCapabilityTargets)) {
  const redirect = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Capabilities · Anhui Zhixin</title>
  <link rel="canonical" href="${target}">
  <meta http-equiv="refresh" content="0;url=${target}">
</head>
<body>
  <p>Continuing to <a href="${target}">Capabilities</a>…</p>
  <script>location.replace('${target}' + location.search);</script>
</body>
</html>
`;
  const output = inner(`${stem}-v5.html`);
  writeFileSync(output, redirect);
  console.log(`${stem}: redirect -> ${target}`);
}
