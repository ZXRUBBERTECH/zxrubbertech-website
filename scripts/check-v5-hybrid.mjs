import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { seoPages } from './v5-seo-config.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const demos = join(root, 'design-demos');
const publicStems = ['demo-a', 'products', 'compounds', 'industries', 'capabilities', 'faq', 'quote'];
const expectedVideos = {
  'demo-a': 1,
  products: 1,
  compounds: 1,
  industries: 1,
  capabilities: 1,
  faq: 1,
  quote: 1,
};
const escapeHtmlText = (value) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;');
const escapeHtmlAttribute = (value) => escapeHtmlText(value).replaceAll('"', '&quot;');
const expectedTitles = Object.fromEntries(
  publicStems.map((stem) => [stem, `<title>${escapeHtmlText(seoPages[stem].title)}</title>`]),
);

const failures = [];
const report = [];
const generatedFooters = [];
const fail = (message) => failures.push(message);
const realVideos = (html) => html.match(/<video\s+[^>]*>/g) ?? [];
const withoutDataUris = (html) => html.replace(/data:[^"']+/g, '');

for (const stem of publicStems) {
  const file = join(demos, `${stem}-v5.html`);
  if (!existsSync(file)) {
    fail(`${stem}: missing V5 file`);
    continue;
  }

  const html = readFileSync(file, 'utf8');
  const visible = withoutDataUris(html);
  const videos = realVideos(html);
  const v4Links = visible.match(/href="[^"]*(?:-v4(?:-share)?\.html|solutions-v\d[^"#]*\.html)[^"]*"/gi) ?? [];

  if ((html.split(expectedTitles[stem]).length - 1) !== 1) fail(`${stem}: expected V5 title must appear once`);
  if (v4Links.length) fail(`${stem}: old V4/Solutions links remain (${v4Links.length})`);
  if (/href="(?:engineering|manufacturing|about)-v5\.html/.test(visible)) fail(`${stem}: legacy capability navigation remains`);
  if (!html.includes('href="capabilities-v5.html"')) fail(`${stem}: consolidated Capabilities navigation is missing`);
  if (/lilei/i.test(visible)) fail(`${stem}: Lilei content remains`);
  if (visible.includes('ZHIXIN RUBBER TECH')) fail(`${stem}: former brand wording remains`);
  if (!visible.includes('ZHIXIN RUBBER MATERIAL')) fail(`${stem}: updated brand wording is missing`);
  if (videos.length !== expectedVideos[stem]) fail(`${stem}: expected ${expectedVideos[stem]} real videos, found ${videos.length}`);
  if (videos.length && !html.includes('(min-width: 0px)')) fail(`${stem}: mobile-width video gate is missing`);
  if (videos.some((tag) => !tag.includes('data-gated-src='))) fail(`${stem}: a real video is outside the gated-video system`);

  const headerMark = '<img class="v5-header-mark" src="../LOGO/ZXLOGO.png" alt="" width="2048" height="2048">';
  if ((html.split(headerMark).length - 1) !== 1) fail(`${stem}: expected one approved circular Header logo`);
  if (/ZXLOGO-(?:circle\.webp|vector\.svg)/.test(html)) fail(`${stem}: former generated Header logo remains`);
  if (html.includes('>ZHIXIN <span>RUBBER TECH</span>')) fail(`${stem}: former Header brand wording remains`);
  if (!html.includes('>ZHIXIN <span>RUBBER MATERIAL</span>')) fail(`${stem}: updated Header brand wording is missing`);
  if (!html.includes('.v5-header-mark{width:36px;height:36px')) fail(`${stem}: circular Header logo desktop sizing is missing`);
  if (!html.includes('@media(max-width:620px){.v5-header-mark{width:30px;height:30px;flex-basis:30px}')) fail(`${stem}: circular Header logo mobile sizing is missing`);

  const footer = html.match(/<!-- SHELL:FOOTER AUTO START -->[\s\S]*?<!-- SHELL:FOOTER AUTO END -->/)?.[0] ?? '';
  const footerOrder = [
    '>Explore<',
    'href="products-v5.html">Products</a>',
    'href="compounds-v5.html">Rubber Compounds</a>',
    'href="industries-v5.html">Industries</a>',
    '>Company<',
    'href="capabilities-v5.html">Capabilities</a>',
    'href="faq-v5.html">FAQ</a>',
    'href="quote-v5.html">Get a Quote</a>',
    '>Contact<',
    'href="mailto:martin@zxrubbertech.com">martin@zxrubbertech.com</a>',
    'WhatsApp · +86 152 5622 5135',
    'Ningguo City, Anhui Province, China',
    'ANHUI ZHIXIN MATERIAL TECHNOLOGY CO., LTD',
  ];
  const footerIndexes = footerOrder.map((fragment) => footer.indexOf(fragment));
  if (!footer.includes('<footer class="footv5"')) fail(`${stem}: V5 Footer root missing`);
  if (!footer.includes('class="footv5-links-row"')) fail(`${stem}: Footer link row missing`);
  if (!footer.includes('class="footv5-legal-row"')) fail(`${stem}: Footer legal row missing`);
  const legalRow = footer.match(/<div class="footv5-legal-row">[\s\S]*?<\/div>/)?.[0] ?? '';
  if (legalRow.includes('©') || legalRow.includes('ZHIXIN RUBBER MATERIAL')) fail(`${stem}: Footer bottom-left brand text remains`);
  if (!legalRow.includes('<span>ANHUI ZHIXIN MATERIAL TECHNOLOGY CO., LTD</span>')) fail(`${stem}: Footer legal company name is missing`);
  if (footerIndexes.some((index) => index < 0) || footerIndexes.some((index, i) => i > 0 && index <= footerIndexes[i - 1])) {
    fail(`${stem}: Footer content or link order does not match the approved design`);
  }
  if (/class="foot-grid"|footv5-brand-row|footv5-wordmark|Rubber compounds and custom components, developed and manufactured in Anhui\.|Material development, compounding and component production coordinated around project requirements\.|ENGINEERING • COMPOUNDING • COMPONENT MANUFACTURING/.test(footer)) fail(`${stem}: former Footer brand or legacy content remains`);
  if (/<(?:nav|section) class="footv5-group/.test(footer)) fail(`${stem}: Footer group uses a globally styled structural element`);
  if (footer.includes('No. 33, Waihuan East Road')) fail(`${stem}: full street address remains inside Footer`);
  if (!html.includes('footer.footv5{')) fail(`${stem}: scoped V5 Footer CSS is missing`);
  generatedFooters.push(footer);

  report.push({ page: stem, videos: videos.length, lilei: /lilei/i.test(visible), oldLinks: v4Links.length });
}

if (!existsSync(join(root, 'LOGO', 'ZXLOGO.png'))) fail('approved existing PNG Header logo asset is missing');

if (new Set(generatedFooters).size !== 1) fail('public V5 pages do not share identical Footer markup');

const industriesPath = join(demos, 'industries-v5.html');
if (existsSync(industriesPath)) {
  const industries = readFileSync(industriesPath, 'utf8');
  const contentOnly = industries
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '');
  const expectedIndustries = [
    'Automotive &amp; Mobility',
    'Home Appliances &amp; HVAC',
    'Industrial Machinery &amp; Automation',
    'Construction, Mining &amp; Agriculture',
    'Rail &amp; Transit',
    'Energy &amp; Process Equipment',
    'Water, Pumps &amp; Fluid Handling',
    'Electrical Equipment &amp; Cable Protection',
  ];
  const expectedMedia = [
    'media/auto-suspension.webp',
    'media/industries/industry-home-hvac.webp',
    'media/industries/industry-automation.webp',
    'media/industries/industry-heavy-equipment.webp',
    'media/industries/industry-rail-transit.webp',
    'media/industries/industry-energy-process.webp',
    'media/industries/industry-water-fluid.webp',
    'media/industries/industry-electrical-cable.webp',
    'media/industries/vid-industries-montage.mp4',
    'media/industries/vid-industries-montage-poster.webp',
  ];
  const expectedProductLinks = [
    'products-v5.html#c-automotive',
    'products-v5.html#c-appliance',
    'products-v5.html#c-industrial',
    'products-v5.html#c-sealing',
    'products-v5.html#c-industrial-diaphragms',
  ];

  if (!industries.includes('<body data-page="industries">')) fail('industries: page scope marker is missing');
  if ((industries.match(/class="ind-sec"/g) ?? []).length !== 8) fail('industries: expected exactly eight equal industry sections');
  for (const title of expectedIndustries) {
    if ((contentOnly.split(title).length - 1) < 2) fail(`industries: approved title and navigator label are missing: ${title}`);
  }
  if ((contentOnly.match(/View Related Products →/g) ?? []).length !== 8) fail('industries: expected eight related-product actions');
  if ((contentOnly.match(/Discuss Your Application →/g) ?? []).length !== 8) fail('industries: expected eight application-discussion actions');
  for (const href of expectedProductLinks) {
    if (!contentOnly.includes(`href="${href}"`)) fail(`industries: verified Products destination is missing: ${href}`);
  }
  if ((contentOnly.match(/quote-v5\.html\?industry=[^"#]+#contact/g) ?? []).length !== 8) fail('industries: expected eight prefilled Quote destinations');
  if (/Food(?:\s|\s*&amp;\s*)Beverage|Coffee Machine|Pharma|MedTech|Certified quality management|over decades of service|Our largest application field/i.test(contentOnly)) {
    fail('industries: removed industry, certificate, or unsupported claim has returned');
  }
  if (contentOnly.includes('class="cert-band"')) fail('industries: former certificate band remains');
  if (!industries.includes('data-gated-src="media/industries/vid-industries-montage.mp4"')) fail('industries: approved hero montage is missing');
  if (!industries.includes('poster="media/industries/vid-industries-montage-poster.webp"')) fail('industries: approved hero montage poster is missing');
  for (const rel of expectedMedia) {
    if (!industries.includes(rel)) fail(`industries: approved media reference is missing: ${rel}`);
    if (!existsSync(join(demos, rel))) fail(`industries: approved media file is missing: ${rel}`);
  }
  const industriesRegion = contentOnly.match(/<header class="tab-hero"[\s\S]*?<section class="cta-band"[\s\S]*?<\/section>/)?.[0] ?? '';
  if (/data:(?:image|video)\//i.test(industriesRegion)) fail('industries: inline legacy media remains in the Industries content');
  if (!industries.includes('#wheel.is-visible{opacity:1;pointer-events:auto}')) fail('industries: bounded navigator visibility rule is missing');
  if (!industries.includes('nav.classList.toggle(\'is-visible\'')) fail('industries: navigator is not bounded to the industry sections');
  if (!industries.includes('.tab-hero>.abadge,body[data-page="industries"] .ind-sec>.abadge{display:none!important}')) {
    fail('industries: internal asset badges are still visible');
  }
}

const heroMediaExpectations = {
  faq: {
    asset: 'P-126',
    previousAsset: 'P-079',
    video: 'media/faq/hero-precision-rubber-inspection.mp4',
    poster: 'media/faq/hero-precision-rubber-inspection-poster.webp',
  },
  quote: {
    asset: 'P-127',
    previousAsset: 'P-078',
    video: 'media/quote/hero-drawing-to-rubber-part.mp4',
    poster: 'media/quote/hero-drawing-to-rubber-part-poster.webp',
  },
};
for (const [stem, expected] of Object.entries(heroMediaExpectations)) {
  const file = join(demos, `${stem}-v5.html`);
  const html = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const hero = html.match(/<header class="tab-hero"[\s\S]*?<\/header>/)?.[0] ?? '';
  if (!hero.includes(`data-asset="${expected.asset}"`)) fail(`${stem}: approved hero asset ${expected.asset} is missing`);
  if (!hero.includes(`data-gated-src="${expected.video}"`)) fail(`${stem}: approved local hero video is missing`);
  if (!hero.includes(`poster="${expected.poster}"`)) fail(`${stem}: approved local hero poster is missing`);
  if (hero.includes(expected.previousAsset)) fail(`${stem}: former hero asset ${expected.previousAsset} remains`);
  if (/Hero footage:|class="th-note"/.test(hero)) fail(`${stem}: visible hero placeholder note remains`);
  if (!html.includes(`<body data-page="${stem}">`)) fail(`${stem}: page scope marker is missing`);
  if (!html.includes(`body[data-page="${stem}"] .tab-hero>.abadge{display:none!important}`)) {
    fail(`${stem}: visible hero asset badge is not suppressed`);
  }
  if (!existsSync(join(demos, expected.video))) fail(`${stem}: local hero video file is missing`);
  if (!existsSync(join(demos, expected.poster))) fail(`${stem}: local hero poster file is missing`);
}

const quoteLayoutPath = join(demos, 'quote-v5.html');
if (existsSync(quoteLayoutPath)) {
  const quote = readFileSync(quoteLayoutPath, 'utf8');
  const quoteSection = quote.match(/<section id="contact"[\s\S]*?<\/section>/)?.[0] ?? '';
  const approvedOrder = [
    'placeholder="Your Name *"',
    'placeholder="Company Name"',
    'placeholder="Email Address *"',
    'placeholder="WhatsApp / Phone"',
    'placeholder="Project Requirement *"',
    'class="quotev5-action-row"',
    'class="quotev5-contact-row',
    'class="quotev5-location',
    '<address>',
  ];
  const orderIndexes = approvedOrder.map((fragment) => quoteSection.indexOf(fragment));
  if (quote.includes('Tell us about your part.')) fail('quote: former heading remains');
  if (!quoteSection.includes('class="quotev5-form-grid')) fail('quote: approved form grid missing');
  if (!quoteSection.includes('class="quotev5-action-row"')) fail('quote: verification/action row missing');
  if (!quoteSection.includes('class="quotev5-contact-row')) fail('quote: direct contact row missing');
  if (!quoteSection.includes('class="quotev5-location')) fail('quote: approved location block missing');
  if (orderIndexes.some((index) => index < 0) || orderIndexes.some((index, i) => i > 0 && index <= orderIndexes[i - 1])) {
    fail('quote: form, contact, map and address order does not match the approved structure');
  }
  const configuredVerification = quoteSection.includes('class="g-recaptcha"');
  const unconfiguredVerification = quoteSection.includes('quotev5-verification--unconfigured');
  if (configuredVerification === unconfiguredVerification) {
    fail('quote: expected exactly one configured or explicitly unconfigured verification state');
  }
  if (unconfiguredVerification && !quote.includes("const unavailableVerification = document.querySelector('.quotev5-verification--unconfigured')")) {
    fail('quote: unconfigured verification state is not protected from Formspree button re-enabling');
  }
  if (!quote.includes('.quotev5-map-preview img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:saturate(.92) contrast(1.06) brightness(.9)')) {
    fail('quote: approved natural-color map filter is missing');
  }
  if ((quoteSection.match(/data-map-destination/g) ?? []).length !== 2) fail('quote: expected map preview and text destination links');
  if (!quote.includes("startsWith('zh')")) fail('quote: language-aware map switching is missing');
}

const capabilitiesMapPath = join(demos, 'capabilities-v5.html');
if (existsSync(capabilitiesMapPath)) {
  const capabilities = readFileSync(capabilitiesMapPath, 'utf8');
  if (!capabilities.includes('.capv5-map-preview img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:saturate(.92) contrast(1.06) brightness(.9)')) {
    fail('capabilities: approved natural-color map filter is missing');
  }
  if (/\.capv5-map-preview img\{[^}]*grayscale\(/.test(capabilities)) fail('capabilities: grayscale map treatment remains');
  if (!capabilities.includes("startsWith('zh')")) fail('capabilities: language-aware map switching is missing');
}

const faqSeoPath = join(demos, 'faq-v5.html');
if (existsSync(faqSeoPath)) {
  const faq = readFileSync(faqSeoPath, 'utf8');
  const faqContentOnly = faq
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '');
  const approvedFaqPairs = [
    ['Are you a rubber manufacturer or a trading company?', 'ANHUI ZHIXIN MATERIAL TECHNOLOGY CO., LTD operates its rubber compounding and component manufacturing facility in Ningguo, Anhui, China.'],
    ['Which rubber manufacturing processes do you perform in-house?', 'We carry out rubber compounding, compression molding, rubber injection molding, extrusion and rubber-to-metal bonding in-house.'],
    ['Which rubber materials can you compound?', 'We compound NR, SBR, CR, NBR, HNBR, EPDM, silicone rubber, FKM, ACM / AEM and selected rubber-plastic alloy systems.'],
    ['Can you recommend a rubber material if we have not specified one?', 'Yes. We review the operating temperature, contact media, target hardness, expected service life and application environment to recommend a suitable polymer and formulation route.'],
    ['Can you develop an OEM / ODM rubber part from a drawing or physical sample?', 'Yes. Drawings are preferred. When only a physical sample is available, we can evaluate dimensional measurement, material analysis and performance matching before confirming the development route.'],
    ['Can you make black, white and colored rubber compounds or custom formulations?', 'Yes. We support black, white and colored compounds, color-sample matching, specified hardness and special-performance formulation development. Feasibility is reviewed against the polymer, pigment, filler, contamination-control and application requirements.'],
    ['What is your production capacity?', 'Our facility has an annual rubber-compound capacity of approximately 3,000 metric tons and produces more than 15 million molded rubber components per year.'],
    ['What is your minimum order quantity for rubber compounds and molded parts?', 'The standard MOQ for regular rubber compounds is 2 metric tons. The MOQ for specialty compounds and molded or vulcanized rubber products is confirmed according to the material, part dimensions, manufacturing process and expected volume.'],
    ['How quickly do you respond and provide a quotation?', 'We normally acknowledge new inquiries within 24 hours. A formal quotation is typically provided within 2–7 business days after we receive enough technical and commercial information. Tooling, sample and production lead times are confirmed for each project.'],
    ['Do you accept samples, trial molding and small-batch production?', 'In most cases, yes. Samples, trial molding and small-batch validation can be evaluated. Feasibility and any minimum trial quantity are confirmed according to the material, tooling and process requirements.'],
    ['How do you handle mold design, tooling cost and existing customer molds?', 'Tool design and manufacturing responsibility, tooling cost and the use of an existing customer mold are evaluated for each project. Compatibility is confirmed against the part design, mold condition and required production process.'],
    ['Which quality documents can you provide?', 'According to the project requirements, we can provide applicable records such as dimensional inspection reports, material reports, outgoing inspection reports, first article inspection reports, certificates of analysis, PPAP documents and third-party test reports. Required documents should be confirmed before the order.'],
    ['Do you provide batch traceability?', 'Yes. Finished products can be traced to the applicable rubber-compound batch, production date and inspection records through our production documentation.'],
    ['Do you accept NDAs and protect customer project information?', 'Yes. Customer drawings, molds, formulas and project documents are handled according to the agreed NDA and project confidentiality requirements.'],
    ['Do you support export packaging and flexible trade terms?', 'Yes. We support export packaging, customer labels, pallets and sea or air shipment arrangements. EXW and FOB are common trade terms, and other terms can be adjusted to customer requirements and confirmed in the quotation.'],
  ];
  const approvedFaqGroups = [
    '01 · Manufacturing &amp; Materials',
    '02 · Orders &amp; Development',
    '03 · Quality &amp; Delivery',
  ];
  const approvedFaqTitle = `<title>${escapeHtmlText(seoPages.faq.title)}</title>`;
  const approvedFaqDescription = `<meta name="description" content="${escapeHtmlAttribute(seoPages.faq.description)}">`;

  if ((faq.split(approvedFaqTitle).length - 1) !== 1) fail('faq: approved SEO title must appear once');
  if ((faq.split(approvedFaqDescription).length - 1) !== 1) fail('faq: approved meta description must appear once');
  if (!faq.includes('<link rel="icon" href="data:,">')) fail('faq: empty favicon declaration is missing');
  if (!faq.includes('Rubber FAQ.<br><em>Answered clearly</em>.')) fail('faq: approved grounded hero heading is missing');
  if (!faq.includes('Answers on rubber materials, manufacturing, custom development, MOQ, tooling, quality records, traceability and export supply.')) fail('faq: approved hero introduction is missing');
  const details = (faq.match(/<details data-name="faq\.item-/g) ?? []).length;
  if (details !== 15) fail(`faq: expected 15 questions, found ${details}`);
  const groups = (faq.match(/class="faq-group"/g) ?? []).length;
  if (groups !== 3) fail(`faq: expected 3 question groups, found ${groups}`);
  for (const group of approvedFaqGroups) {
    if ((faq.split(group).length - 1) !== 1) fail(`faq: approved group must appear once: ${group}`);
  }
  for (const [question, answer] of approvedFaqPairs) {
    if ((faq.split(`<summary>${question}</summary>`).length - 1) !== 1) fail(`faq: approved question must appear once: ${question}`);
    if ((faq.split(`<p>${answer}</p>`).length - 1) !== 1) fail(`faq: approved answer must appear once for: ${question}`);
  }
  if (/What are your MOQ, certifications and lead time\?|FAQPage|ISO 9001|ISO-certified/i.test(faqContentOnly)) {
    fail('faq: former combined question, FAQ schema, or certification content remains');
  }
  if (/"@type"\s*:\s*"(?:FAQPage|Product|Offer|Review|AggregateRating)"/i.test(faq)) {
    fail('faq: prohibited structured data was added against the approved scope');
  }
}

const capabilitiesPath = join(demos, 'capabilities-v5.html');
if (existsSync(capabilitiesPath)) {
  const capabilities = readFileSync(capabilitiesPath, 'utf8');
  const contentOnly = capabilities
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '');
  const sections = (capabilities.match(/<section id="(?:engineering|production|quality|company)" class="capv5-section/g) ?? []).length;
  const isoClaims = (capabilities.match(/Our rubber compound production is supported by an ISO 9001:2015-certified quality management system\./g) ?? []).length;
  const approvedCapabilitiesCopy = [
    'Turn project inputs into material, tooling and process requirements.',
    'We review drawings, 3D data, samples and service conditions to define the material route, critical geometry, tooling and process inputs for production.',
    'Supply as rubber compound or finished components.',
    'Compound orders cover formulation, mixing and batch release. Component orders continue through forming, cure, finishing, inspection and release.',
    'Define what to check, when to check it and what to record.',
    'Inspection methods, frequency, acceptance criteria and requested records are confirmed for each material, part and order.',
    'Rubber compound and component manufacturing in Ningguo, Anhui.',
    'ANHUI ZHIXIN MATERIAL TECHNOLOGY CO., LTD operates its rubber compounding and component manufacturing facility in Ningguo City, Anhui, China.',
  ];

  if (sections !== 4) fail(`capabilities: expected 4 principal sections, found ${sections}`);
  for (const copy of approvedCapabilitiesCopy) {
    const occurrences = capabilities.split(copy).length - 1;
    if (occurrences !== 1) fail(`capabilities: approved copy must appear once: ${copy}`);
  }
  if (/Start with the part|One material foundation|Evidence follows the|Manufacturing based/i.test(contentOnly)) {
    fail('capabilities: former abstract headings remain');
  }
  for (const asset of ['P-121', 'P-123', 'P-124', 'P-125', 'L-030', 'L-020']) {
    if (!capabilities.includes(`data-asset="${asset}"`)) fail(`capabilities: required asset ${asset} is missing`);
  }
  if (/data-asset="A-/.test(capabilities)) fail('capabilities: own uploaded imagery remains');
  if (isoClaims !== 1) fail(`capabilities: expected the approved ISO sentence once, found ${isoClaims}`);
  if (/certificate|cert-band|Project CTA|24-hour|Ningbo|Lilei/i.test(contentOnly)) fail('capabilities: prohibited certificate, CTA, or former company content remains');
  if (/class="(?:cta-band|compound-cta)"/.test(capabilities)) fail('capabilities: page-level CTA remains');
  if (!capabilities.includes('body[data-page="capabilities"]{overflow-x:hidden;background:var(--bg)}')) fail('capabilities: dark page foundation is missing');
  if (!capabilities.includes('.capv5-section:nth-of-type(even){background:var(--bg2)}')) fail('capabilities: dark alternating sections are missing');
  if (!capabilities.includes('.capv5-stage{display:grid;grid-template-columns:54px 1fr;gap:18px;padding:26px 24px;border:1px solid var(--line);border-top:0;background:var(--panel)}')) fail('capabilities: dark stage panels are missing');
  if (!capabilities.includes('.capv5-quality-copy{padding:42px;border:1px solid var(--line);background:var(--panel)}')) fail('capabilities: dark quality panel is missing');
  if (!capabilities.includes('.capv5-head{display:block')) fail('capabilities: section introductions are not full-width stacks');
  if (capabilities.includes('grid-template-columns:minmax(0,.78fr) minmax(340px,1.22fr)')) fail('capabilities: former split section introduction remains');
  if (!capabilities.includes('body[data-page="capabilities"] .abadge{display:none!important}')) fail('capabilities: visible asset badges are not suppressed');
  const companySection = capabilities.match(/<section id="company"[\s\S]*?<\/section>/)?.[0] ?? '';
  const companyRowOrder = ['class="capv5-head', 'class="capv5-capacity-band', 'class="capv5-location']
    .map((marker) => companySection.indexOf(marker));
  if (companyRowOrder.some((index) => index < 0) || companyRowOrder.some((index, position) => position && index <= companyRowOrder[position - 1])) {
    fail('capabilities: Company & Capacity does not use the approved title, capacity, map row order');
  }
  if (/capv5-company-grid|capv5-map-links/.test(companySection)) fail('capabilities: former split company/map layout remains');
  const mapDestinations = (companySection.match(/data-map-destination/g) ?? []).length;
  if (mapDestinations !== 2) fail(`capabilities: expected 2 synchronized map destinations, found ${mapDestinations}`);
  if ((companySection.match(/data-map-provider/g) ?? []).length !== 1) fail('capabilities: active map provider label is missing');
  if (!companySection.includes('<address>')) fail('capabilities: company address row is missing');
  if (!companySection.includes('data-map-amap="https://uri.amap.com/search?keyword=')) fail('capabilities: Amap destination is missing');
  if (!companySection.includes('data-map-google="https://www.google.com/maps/search/?api=1&amp;query=')) fail('capabilities: Google Maps destination is missing');
  const capacityStats = (capabilities.match(/class="capv5-capacity-stat/g) ?? []).length;
  if (capacityStats !== 2) fail(`capabilities: expected 2 capacity stats, found ${capacityStats}`);
  if (!capabilities.includes('data-cap-count="3000"') || !capabilities.includes('data-cap-count="15"')) {
    fail('capabilities: approved capacity counters are missing');
  }
}

const legacyCapabilityTargets = {
  engineering: 'capabilities-v5.html#engineering',
  manufacturing: 'capabilities-v5.html#production',
  about: 'capabilities-v5.html#company',
};
for (const [stem, target] of Object.entries(legacyCapabilityTargets)) {
  const file = join(demos, `${stem}-v5.html`);
  const html = existsSync(file) ? readFileSync(file, 'utf8') : '';
  if (!html.includes(`location.replace('${target}'`)) fail(`${stem}: legacy redirect to ${target} is missing`);
}

const registryPath = join(demos, 'media/asset-registry.json');
if (existsSync(registryPath)) {
  const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
  const qualityAsset = registry.assets?.find((asset) => asset.id === 'L-029');
  if (!qualityAsset || qualityAsset.class !== 'licensed' || qualityAsset.file !== 'media/capabilities/quality-caliper-crop.webp') {
    fail('asset registry: licensed Capabilities quality asset L-029 is missing or invalid');
  }
  const expectedCapabilitiesAssets = {
    'P-121': ['placeholder', 'media/capabilities/hero-home-products-montage.mp4'],
    'P-122': ['placeholder', 'media/capabilities/hero-home-products-montage-poster.webp'],
    'P-123': ['placeholder', 'media/capabilities/engineering-cad-workstation.webp'],
    'P-124': ['placeholder', 'media/capabilities/compound-mixing-mill.webp'],
    'P-125': ['placeholder', 'media/capabilities/vulcanized-mold-press.webp'],
    'L-030': ['licensed', 'media/capabilities/quality-rubber-caliper.webp'],
  };
  for (const [id, [assetClass, file]] of Object.entries(expectedCapabilitiesAssets)) {
    const asset = registry.assets?.find((entry) => entry.id === id);
    if (!asset || asset.class !== assetClass || asset.file !== file) {
      fail(`asset registry: Capabilities asset ${id} is missing or invalid`);
    }
    if (!existsSync(join(demos, file))) fail(`asset registry: Capabilities asset file ${file} is missing`);
  }
  for (const [stem, expected] of Object.entries(heroMediaExpectations)) {
    const asset = registry.assets?.find((entry) => entry.id === expected.asset);
    if (!asset || asset.class !== 'placeholder' || asset.file !== expected.video || asset.poster !== expected.poster) {
      fail(`asset registry: ${stem} hero asset ${expected.asset} is missing or invalid`);
    }
    if (!asset || !Array.isArray(asset.sources) || asset.sources.length !== 1) {
      fail(`asset registry: ${stem} hero asset ${expected.asset} must record one source`);
    }
  }
}

const v5ShareFiles = readdirSync(demos).filter((name) => /-v5-share\.html$/.test(name));
if (v5ShareFiles.length) fail(`Unexpected V5-share files: ${v5ShareFiles.join(', ')}`);

const productsPath = join(demos, 'products-v5.html');
if (existsSync(productsPath)) {
  const products = readFileSync(productsPath, 'utf8');
  const catalog = products.match(/<!-- CATALOG:V4 EIGHT START[^>]*-->[\s\S]*?<!-- CATALOG:V4 EIGHT END -->/)?.[0] ?? '';
  const sections = (catalog.match(/<section class="cat-sec"/g) ?? []).length;
  const images = (catalog.match(/<img /g) ?? []).length;
  if (sections !== 8) fail(`products: expected 8 catalog sections, found ${sections}`);
  if (images !== 56) fail(`products: expected 56 catalog images, found ${images}`);
}

const compoundsPath = join(demos, 'compounds-v5.html');
if (existsSync(compoundsPath)) {
  const compounds = readFileSync(compoundsPath, 'utf8');
  const primaryCards = (compounds.match(/class="compound-primary-card"/g) ?? []).length;
  const cardKeys = (compounds.match(/data-compound-card-key=/g) ?? []).length;
  const primaryGrids = (compounds.match(/class="compound-primary-grid"/g) ?? []).length;
  const familySections = (compounds.match(/<section class="compound-family/g) ?? []).length;
  const primaryCardImages = [...compounds.matchAll(/<button class="compound-primary-card"[\s\S]*?<img[^>]+src="([^"]+)"/g)]
    .map((match) => match[1]);

  if (compounds.includes('data-name="compounds.placeholder"')) fail('compounds: development placeholder remains');
  if (compounds.includes('class="sol-sec"')) fail('compounds: former Solutions sections remain');
  if (!compounds.includes('<body data-page="compounds">')) fail('compounds: page scope marker is missing');
  if (!compounds.includes('data-asset="L-010"')) fail('compounds: approved mixing hero is missing');
  if (primaryCards !== 12) fail(`compounds: expected 12 primary cards, found ${primaryCards}`);
  if (cardKeys !== 12) fail(`compounds: expected 12 primary card keys, found ${cardKeys}`);
  if (primaryGrids !== 1) fail(`compounds: expected 1 primary grid, found ${primaryGrids}`);
  if (new Set(primaryCardImages).size !== 12) fail('compounds: primary card images must be unique');
  if (familySections !== 0) fail(`compounds: expected no family detail sections, found ${familySections}`);
  if (compounds.includes('class="compound-family-bar"')) fail('compounds: sticky family bar remains');
  if (compounds.includes('id="compound-capabilities"')) fail('compounds: capability section remains');
  if (compounds.includes('id="compound-brief"')) fail('compounds: project brief section remains');
  if (compounds.includes('class="compound-cta"')) fail('compounds: compound CTA remains');
}

const summary = {
  status: failures.length ? 'FAIL' : 'PASS',
  publicPages: report.length,
  v5ShareFiles: v5ShareFiles.length,
  productsSections: existsSync(productsPath)
    ? ((readFileSync(productsPath, 'utf8').match(/<section class="cat-sec"/g) ?? []).length)
    : 0,
  report,
};

console.log(JSON.stringify(summary, null, 2));
if (failures.length) {
  console.error(failures.map((message) => `- ${message}`).join('\n'));
  process.exit(1);
}
