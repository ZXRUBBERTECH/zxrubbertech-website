#!/usr/bin/env python3
"""
Generate per-product, multilingual SEO landing pages.

Each of the 5 products gets its own URL in every language:
  /products/<slug>/            (en, canonical)
  /de/products/<slug>/  /zh/products/<slug>/  /ru/products/<slug>/
plus a products hub page at /products/ (and per language).

Every page bakes real, localized content into static HTML (unique title,
meta description, canonical, hreflang cluster, Open Graph, Product +
BreadcrumbList JSON-LD). Spec-table values the company has not confirmed
(hardness, temperature, dimensions, MOQ, certifications) are deliberately
left as "Available on request" — never fabricated.

Self-contained: does not read index.html. Run:  python3 scripts/build_products.py
"""
import os
import string
from urllib.parse import quote

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = "https://www.zxrubbertech.com"

# lang -> (html lang attr, og locale, url prefix)
LANGS = {
    "en": ("en",    "en_US", ""),
    "de": ("de",    "de_DE", "de/"),
    "zh": ("zh-CN", "zh_CN", "zh/"),
    "ru": ("ru",    "ru_RU", "ru/"),
}
LANG_CODE = {"en": "EN", "de": "DE", "zh": "中", "ru": "RU"}

# ---- Shared UI strings per language ----
UI = {
    "en": {
        "home": "Home", "products": "Products", "manufacturer": "Manufacturer",
        "applications": "Applications", "materials": "Available Compounds",
        "capabilities": "Manufacturing Capabilities", "specs": "Specifications",
        "related": "Related Products", "onrequest": "Available on request",
        "quote": "Request a Quote", "backhome": "Back to Home",
        "spec_rows": ["Material", "Hardness (Shore A)", "Operating Temperature",
                      "Dimensions & Tolerance", "Color", "Minimum Order Quantity", "Certification"],
        "cta_head": "Request a quotation or technical datasheet",
        "cta_text": "Tell us your material, hardness, dimensions and annual volume — our engineering team replies within 24 hours.",
        "hub_title": "Rubber Products", "hub_h1": "Automotive & Industrial Rubber Products",
        "hub_sub": "Molded rubber components engineered and manufactured in-house for automotive, industrial and appliance applications. OEM / ODM to your drawings.",
        "view": "View details",
        "capabilities_list": [
            "OEM / ODM custom manufacturing to your drawings",
            "Rubber-to-metal bonded components",
            "In-house compounding: NR, EPDM, NBR, HNBR, CR, SBR, MQ, FKM, AEM / ACM",
            "CAE simulation, formula and mold development",
            "Laboratory validation including ozone and aging resistance",
        ],
        "copy": "© 2026 ZHIXIN RUBBER TECH. All Rights Reserved.",
    },
    "de": {
        "home": "Startseite", "products": "Produkte", "manufacturer": "Hersteller",
        "applications": "Anwendungen", "materials": "Verfügbare Mischungen",
        "capabilities": "Fertigungskompetenz", "specs": "Spezifikationen",
        "related": "Verwandte Produkte", "onrequest": "Auf Anfrage",
        "quote": "Angebot anfordern", "backhome": "Zur Startseite",
        "spec_rows": ["Werkstoff", "Härte (Shore A)", "Betriebstemperatur",
                      "Maße & Toleranz", "Farbe", "Mindestbestellmenge", "Zertifizierung"],
        "cta_head": "Angebot oder technisches Datenblatt anfordern",
        "cta_text": "Nennen Sie uns Werkstoff, Härte, Maße und Jahresmenge — unser Technikteam antwortet innerhalb von 24 Stunden.",
        "hub_title": "Gummiprodukte", "hub_h1": "Automobil- & Industrie-Gummiprodukte",
        "hub_sub": "Gummiformteile, im eigenen Haus entwickelt und gefertigt für Automobil-, Industrie- und Geräteanwendungen. OEM / ODM nach Ihren Zeichnungen.",
        "view": "Details ansehen",
        "capabilities_list": [
            "OEM / ODM Fertigung nach Ihren Zeichnungen",
            "Gummi-Metall-Verbundteile",
            "Eigene Mischungsherstellung: NR, EPDM, NBR, HNBR, CR, SBR, MQ, FKM, AEM / ACM",
            "CAE-Simulation, Rezeptur- und Werkzeugentwicklung",
            "Laborprüfung inkl. Ozon- und Alterungsbeständigkeit",
        ],
        "copy": "© 2026 ZHIXIN RUBBER TECH. Alle Rechte vorbehalten.",
    },
    "zh": {
        "home": "首页", "products": "产品", "manufacturer": "制造商",
        "applications": "应用领域", "materials": "可选胶料",
        "capabilities": "制造能力", "specs": "规格参数",
        "related": "相关产品", "onrequest": "来询提供",
        "quote": "获取报价", "backhome": "返回首页",
        "spec_rows": ["材质", "硬度（邵氏A）", "工作温度",
                      "尺寸与公差", "颜色", "最小起订量", "认证"],
        "cta_head": "索取报价或技术数据表",
        "cta_text": "告诉我们所需的胶料、硬度、尺寸和年用量 — 我们的工程团队将在 24 小时内回复。",
        "hub_title": "橡胶产品", "hub_h1": "汽车与工业橡胶制品",
        "hub_sub": "自主开发与制造的橡胶模压件，广泛用于汽车、工业和家电领域，支持按图纸 OEM / ODM 定制。",
        "view": "查看详情",
        "capabilities_list": [
            "按图纸 OEM / ODM 定制生产",
            "橡胶-金属粘接一体件",
            "自有混炼：NR、EPDM、NBR、HNBR、CR、SBR、MQ、FKM、AEM / ACM",
            "CAE 仿真、配方与模具开发",
            "实验室验证（含耐臭氧与老化测试）",
        ],
        "copy": "© 2026 致信橡胶科技 版权所有。",
    },
    "ru": {
        "home": "Главная", "products": "Продукция", "manufacturer": "производитель",
        "applications": "Применение", "materials": "Доступные смеси",
        "capabilities": "Производственные возможности", "specs": "Характеристики",
        "related": "Похожие товары", "onrequest": "По запросу",
        "quote": "Запросить цену", "backhome": "На главную",
        "spec_rows": ["Материал", "Твёрдость (Шор A)", "Рабочая температура",
                      "Размеры и допуски", "Цвет", "Мин. партия заказа", "Сертификация"],
        "cta_head": "Запросить коммерческое предложение или техническую спецификацию",
        "cta_text": "Сообщите нам материал, твёрдость, размеры и годовой объём — наша команда ответит в течение 24 часов.",
        "hub_title": "Резиновые изделия", "hub_h1": "Автомобильные и промышленные резиновые изделия",
        "hub_sub": "Формовые резиновые компоненты, разработанные и произведённые на собственном производстве для автомобильной, промышленной и бытовой техники. OEM / ODM по вашим чертежам.",
        "view": "Подробнее",
        "capabilities_list": [
            "OEM / ODM производство по вашим чертежам",
            "Резино-металлические детали",
            "Собственное смешение: NR, EPDM, NBR, HNBR, CR, SBR, MQ, FKM, AEM / ACM",
            "CAE-моделирование, разработка рецептур и пресс-форм",
            "Лабораторная проверка, включая озоно- и старениестойкость",
        ],
        "copy": "© 2026 ZHIXIN RUBBER TECH. Все права защищены.",
    },
}

# ---- Product data. `apps` and text fields per language; materials are universal codes. ----
PRODUCTS = [
    {
        "slug": "suspension-bushing",
        "img": "/OptimizedPicture/减震衬套.webp",
        "materials": ["NR", "EPDM", "NBR", "Rubber-Metal Bonded"],
        "category_key": "Automotive Rubber Components",
        "en": {"name": "Suspension Bushing",
               "cat": "Automotive Rubber Components",
               "lead": "A rubber-metal suspension bushing connects chassis and suspension members, isolating road-induced vibration and noise while allowing controlled, durable articulation between moving parts. Manufactured to OEM drawings with rubber-to-metal bonding for long service life.",
               "apps": ["Control arms and subframes", "Stabilizer bar and shock mounts", "Passenger cars and commercial vehicles", "NVH vibration isolation"],
               "meta": "OEM rubber-metal suspension bushing manufacturer. Vibration-isolating control-arm and subframe bushings in NR, EPDM and NBR compounds, made to drawing."},
        "de": {"name": "Fahrwerksbuchse",
               "cat": "Automobil-Gummikomponenten",
               "lead": "Eine Gummi-Metall-Fahrwerksbuchse verbindet Fahrgestell und Fahrwerkskomponenten, isoliert Fahrbahnschwingungen und Geräusche und ermöglicht eine kontrollierte, dauerhafte Beweglichkeit zwischen den Bauteilen. Gefertigt nach OEM-Zeichnungen mit Gummi-Metall-Verbund für lange Lebensdauer.",
               "apps": ["Querlenker und Hilfsrahmen", "Stabilisator- und Dämpferlager", "Pkw und Nutzfahrzeuge", "NVH-Schwingungsisolierung"],
               "meta": "Hersteller von Gummi-Metall-Fahrwerksbuchsen. Schwingungsisolierende Querlenker- und Hilfsrahmenbuchsen aus NR, EPDM und NBR, nach Zeichnung gefertigt."},
        "zh": {"name": "悬挂衬套",
               "cat": "汽车橡胶零部件",
               "lead": "橡胶-金属悬挂衬套连接车架与悬挂部件，隔离路面振动与噪声，同时允许部件之间受控且耐久的相对运动。按 OEM 图纸生产，采用橡胶-金属粘接工艺，使用寿命长。",
               "apps": ["控制臂与副车架", "稳定杆与减震器支座", "乘用车与商用车", "NVH 振动隔离"],
               "meta": "橡胶-金属悬挂衬套制造商。采用 NR、EPDM、NBR 胶料的隔振控制臂与副车架衬套，按图定制。"},
        "ru": {"name": "Втулка подвески",
               "cat": "Автомобильные резиновые компоненты",
               "lead": "Резино-металлическая втулка подвески соединяет шасси и элементы подвески, изолируя дорожные вибрации и шум и обеспечивая контролируемое, долговечное перемещение между деталями. Изготавливается по чертежам OEM с резино-металлическим соединением для долгого срока службы.",
               "apps": ["Рычаги и подрамники", "Опоры стабилизатора и амортизатора", "Легковые и коммерческие автомобили", "Виброизоляция NVH"],
               "meta": "Производитель резино-металлических втулок подвески. Виброизолирующие втулки рычагов и подрамников из NR, EPDM и NBR, по чертежу."},
    },
    {
        "slug": "shock-absorber-dust-cover",
        "img": "/OptimizedPicture/减震防尘罩.webp",
        "materials": ["EPDM", "CR", "NR"],
        "category_key": "Automotive Rubber Components",
        "en": {"name": "Shock Absorber Dust Cover",
               "cat": "Automotive Rubber Components",
               "lead": "A molded rubber dust cover (boot) shields the shock absorber or strut piston rod from dust, mud and water, protecting the oil seal and extending damper service life. Produced in weather- and ozone-resistant compounds for demanding road conditions.",
               "apps": ["Struts and shock absorbers", "Dampers and suspension units", "Passenger and commercial vehicles", "Piston-rod and seal protection"],
               "meta": "Shock absorber dust cover / strut boot manufacturer. Weather- and ozone-resistant molded rubber boots in EPDM and CR that protect the damper seal, made to drawing."},
        "de": {"name": "Stoßdämpfer-Staubschutz",
               "cat": "Automobil-Gummikomponenten",
               "lead": "Ein gummigeformter Staubschutz (Manschette) schützt die Kolbenstange von Stoßdämpfer oder Federbein vor Staub, Schlamm und Wasser, schont die Öldichtung und verlängert die Lebensdauer des Dämpfers. Aus witterungs- und ozonbeständigen Mischungen für anspruchsvolle Fahrbahnbedingungen.",
               "apps": ["Federbeine und Stoßdämpfer", "Dämpfer und Fahrwerkseinheiten", "Pkw und Nutzfahrzeuge", "Kolbenstangen- und Dichtungsschutz"],
               "meta": "Hersteller von Stoßdämpfer-Staubschutz / Federbein-Manschetten. Witterungs- und ozonbeständige Gummiformteile aus EPDM und CR zum Schutz der Dämpferdichtung, nach Zeichnung."},
        "zh": {"name": "减震器防尘罩",
               "cat": "汽车橡胶零部件",
               "lead": "橡胶模压防尘罩（护套）保护减震器或支柱活塞杆免受灰尘、泥水侵入，保护油封并延长减震器使用寿命。采用耐候、耐臭氧胶料，适应严苛路况。",
               "apps": ["麦弗逊支柱与减震器", "阻尼器与悬挂单元", "乘用车与商用车", "活塞杆与油封保护"],
               "meta": "减震器防尘罩/支柱护套制造商。采用 EPDM、CR 的耐候耐臭氧橡胶模压护套，保护减震器油封，按图定制。"},
        "ru": {"name": "Пыльник амортизатора",
               "cat": "Автомобильные резиновые компоненты",
               "lead": "Формованный резиновый пыльник (чехол) защищает шток амортизатора или стойки от пыли, грязи и воды, оберегает сальник и продлевает срок службы амортизатора. Изготавливается из атмосферо- и озоностойких смесей для тяжёлых дорожных условий.",
               "apps": ["Стойки и амортизаторы", "Демпферы и узлы подвески", "Легковые и коммерческие автомобили", "Защита штока и сальника"],
               "meta": "Производитель пыльников амортизаторов / чехлов стоек. Атмосферо- и озоностойкие резиновые чехлы из EPDM и CR для защиты сальника, по чертежу."},
    },
    {
        "slug": "ball-joint-dust-cover",
        "img": "/产品照片/球形防尘罩.webp",
        "materials": ["CR", "NBR", "EPDM"],
        "category_key": "Automotive Rubber Components",
        "en": {"name": "Ball Joint Dust Cover",
               "cat": "Automotive Rubber Components",
               "lead": "A rubber ball joint dust boot seals the joint against dust, water and road contaminants while retaining lubricating grease, keeping steering and suspension joints working smoothly. Molded in flexible, abrasion- and ozone-resistant compounds.",
               "apps": ["Steering and suspension ball joints", "Tie rod ends", "Control-arm joints", "Grease retention and sealing"],
               "meta": "Ball joint dust cover / boot manufacturer. Flexible ozone-resistant rubber boots in CR, NBR and EPDM that seal steering and suspension joints, made to drawing."},
        "de": {"name": "Kugelgelenk-Staubschutz",
               "cat": "Automobil-Gummikomponenten",
               "lead": "Eine Kugelgelenk-Staubmanschette aus Gummi dichtet das Gelenk gegen Staub, Wasser und Straßenschmutz ab und hält das Schmierfett zurück, sodass Lenk- und Fahrwerksgelenke leichtgängig bleiben. Geformt aus flexiblen, abriebfest- und ozonbeständigen Mischungen.",
               "apps": ["Lenk- und Fahrwerkskugelgelenke", "Spurstangenköpfe", "Querlenkergelenke", "Fetthaltung und Abdichtung"],
               "meta": "Hersteller von Kugelgelenk-Staubschutzmanschetten. Flexible, ozonbeständige Gummimanschetten aus CR, NBR und EPDM zur Abdichtung von Lenk- und Fahrwerksgelenken, nach Zeichnung."},
        "zh": {"name": "球头防尘罩",
               "cat": "汽车橡胶零部件",
               "lead": "橡胶球头防尘罩密封球头关节，阻挡灰尘、水和路面杂质，同时锁住润滑脂，保证转向与悬挂关节顺畅工作。采用柔韧、耐磨、耐臭氧胶料模压成型。",
               "apps": ["转向与悬挂球头", "转向拉杆球头", "控制臂关节", "锁脂与密封"],
               "meta": "球头防尘罩制造商。采用 CR、NBR、EPDM 的柔韧耐臭氧橡胶防尘罩，密封转向与悬挂球头，按图定制。"},
        "ru": {"name": "Пыльник шарового шарнира",
               "cat": "Автомобильные резиновые компоненты",
               "lead": "Резиновый пыльник шарового шарнира защищает шарнир от пыли, воды и дорожных загрязнений и удерживает смазку, обеспечивая плавную работу рулевых и подвесочных шарниров. Формуется из гибких, износо- и озоностойких смесей.",
               "apps": ["Шаровые опоры рулевого управления и подвески", "Наконечники рулевых тяг", "Шарниры рычагов", "Удержание смазки и уплотнение"],
               "meta": "Производитель пыльников шаровых шарниров. Гибкие озоностойкие резиновые пыльники из CR, NBR и EPDM для рулевых и подвесочных шарниров, по чертежу."},
    },
    {
        "slug": "wire-harness-sheath",
        "img": "/产品照片/线束护套.webp",
        "materials": ["EPDM", "NBR", "NR"],
        "category_key": "Automotive Rubber Components",
        "en": {"name": "Wire Harness Sheath",
               "cat": "Automotive Rubber Components",
               "lead": "A molded rubber wire-harness sheath (grommet) protects automotive wiring where it passes through body panels, sealing against dust and water and preventing chafing against sharp edges. Custom profiles molded to match your harness and panel geometry.",
               "apps": ["Body and firewall pass-throughs", "Door and tailgate harnesses", "Engine-bay wiring protection", "Dust and water sealing"],
               "meta": "Rubber wire harness sheath and grommet manufacturer. Molded EPDM / NBR pass-through sheaths that seal and protect automotive wiring, made to drawing."},
        "de": {"name": "Kabeldurchführung",
               "cat": "Automobil-Gummikomponenten",
               "lead": "Eine gummigeformte Kabelbaum-Schutzhülle (Tülle) schützt die Fahrzeugverkabelung an Durchführungen durch Karosseriebleche, dichtet gegen Staub und Wasser ab und verhindert Scheuern an scharfen Kanten. Kundenspezifische Profile passend zu Ihrem Kabelbaum und Ihrer Blechgeometrie.",
               "apps": ["Karosserie- und Stirnwanddurchführungen", "Tür- und Heckklappenkabelbäume", "Motorraum-Kabelschutz", "Staub- und Wasserabdichtung"],
               "meta": "Hersteller von Kabelbaum-Schutzhüllen und -Tüllen. Geformte EPDM/NBR-Durchführungen, die Fahrzeugverkabelung abdichten und schützen, nach Zeichnung."},
        "zh": {"name": "线束护套",
               "cat": "汽车橡胶零部件",
               "lead": "橡胶模压线束护套（过孔护套）在汽车线束穿过车身钣金处提供保护，密封灰尘与水，并防止线束被锐边磨损。可按线束与钣金孔位定制专用型面。",
               "apps": ["车身与前围板过孔", "车门与尾门线束", "机舱线束保护", "防尘防水密封"],
               "meta": "汽车线束护套/过孔护套制造商。采用 EPDM、NBR 模压的过孔护套，密封并保护汽车线束，按图定制。"},
        "ru": {"name": "Оболочка жгута проводов",
               "cat": "Автомобильные резиновые компоненты",
               "lead": "Формованная резиновая оболочка жгута проводов (втулка) защищает автомобильную проводку в местах прохода через панели кузова, уплотняет от пыли и воды и предотвращает истирание об острые кромки. Индивидуальные профили под ваш жгут и геометрию панели.",
               "apps": ["Проходы через кузов и моторный щит", "Жгуты дверей и багажника", "Защита проводки моторного отсека", "Уплотнение от пыли и воды"],
               "meta": "Производитель оболочек и втулок жгутов проводов. Формованные проходные оболочки из EPDM/NBR, уплотняющие и защищающие автопроводку, по чертежу."},
    },
    {
        "slug": "rubber-wheel",
        "img": "/产品照片/橡胶轮.webp",
        "materials": ["NR", "SBR", "EPDM"],
        "category_key": "Industrial Rubber Components",
        "en": {"name": "Rubber Wheel",
               "cat": "Industrial Rubber Components",
               "lead": "A molded rubber wheel delivers quiet rolling, good grip and shock absorption for industrial equipment, carts and appliances. Available bonded to metal or plastic hubs and produced in hardness grades suited to load and floor type.",
               "apps": ["Casters, carts and trolleys", "Industrial and material-handling equipment", "Home-appliance rollers", "Metal- or plastic-hub bonded wheels"],
               "meta": "Molded rubber wheel manufacturer. Quiet, shock-absorbing NR / SBR rubber wheels for casters, carts and equipment, bonded to metal or plastic hubs, made to drawing."},
        "de": {"name": "Gummirad",
               "cat": "Industrie-Gummikomponenten",
               "lead": "Ein gummigeformtes Rad sorgt für leises Rollen, guten Grip und Stoßdämpfung bei Industriegeräten, Wagen und Haushaltsgeräten. Erhältlich mit Metall- oder Kunststoffnabe verbunden und in Härtegraden passend zu Last und Bodenart.",
               "apps": ["Lenkrollen, Wagen und Trolleys", "Industrie- und Fördertechnik", "Rollen für Haushaltsgeräte", "Räder mit Metall- oder Kunststoffnabe"],
               "meta": "Hersteller von Gummirädern. Leise, stoßdämpfende NR/SBR-Gummiräder für Rollen, Wagen und Geräte, mit Metall- oder Kunststoffnabe, nach Zeichnung."},
        "zh": {"name": "橡胶轮",
               "cat": "工业橡胶零部件",
               "lead": "橡胶模压轮为工业设备、推车和家电提供安静滚动、良好抓地与减震性能。可与金属或塑料轮毂粘接，并按载荷与地面类型提供不同硬度等级。",
               "apps": ["脚轮、推车与手推车", "工业与物料搬运设备", "家电滚轮", "金属/塑料轮毂粘接轮"],
               "meta": "橡胶模压轮制造商。采用 NR、SBR 的安静减震橡胶轮，用于脚轮、推车与设备，可粘接金属或塑料轮毂，按图定制。"},
        "ru": {"name": "Резиновое колесо",
               "cat": "Промышленные резиновые компоненты",
               "lead": "Формованное резиновое колесо обеспечивает тихое качение, хорошее сцепление и амортизацию для промышленного оборудования, тележек и бытовой техники. Доступно с привулканизацией к металлической или пластиковой ступице, в градациях твёрдости под нагрузку и тип пола.",
               "apps": ["Ролики, тележки и каталки", "Промышленное и подъёмно-транспортное оборудование", "Ролики бытовой техники", "Колёса с металлической или пластиковой ступицей"],
               "meta": "Производитель формованных резиновых колёс. Тихие амортизирующие колёса из NR/SBR для роликов, тележек и оборудования, с металлической или пластиковой ступицей, по чертежу."},
    },
]

FONT = ("https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800"
        "&family=Montserrat:wght@500;600;700;800&display=swap")

CSS = """
*{margin:0;padding:0;box-sizing:border-box}
:root{--primary:#0f172a;--secondary:#1e293b;--accent:#2563eb;--light:#f8fbff;--gray:#64748b;--border:#e2e8f0}
html{scroll-behavior:smooth}
body{font-family:'Inter',sans-serif;background:#f6fbff;color:#334155;line-height:1.7;-webkit-font-smoothing:antialiased}
h1,h2,h3,h4{font-family:'Montserrat',sans-serif;letter-spacing:-0.02em;color:var(--primary);line-height:1.2}
a{color:var(--accent);text-decoration:none}
img{max-width:100%;height:auto;display:block}
.container{width:92%;max-width:1140px;margin:auto}
.topbar{position:sticky;top:0;z-index:50;background:rgba(255,255,255,.9);backdrop-filter:blur(14px);border-bottom:1px solid rgba(15,23,42,.06)}
.bar-inner{height:72px;display:flex;align-items:center;justify-content:space-between;gap:16px}
.brand{display:flex;align-items:center;gap:12px;color:var(--primary);font-weight:800;font-size:15px}
.brand img{height:38px;width:auto}
.bar-nav{display:flex;align-items:center;gap:20px;font-size:14px;font-weight:600}
.bar-nav a{color:var(--primary)}
.langs{display:flex;gap:10px;font-size:13px}
.langs a{color:var(--gray);font-weight:700}
.langs a.on{color:var(--accent)}
.cta{padding:11px 20px;border-radius:12px;background:var(--accent);color:#fff!important;font-weight:700;box-shadow:0 12px 28px rgba(37,99,235,.22)}
.crumb{font-size:13px;color:var(--gray);padding:22px 0 4px}
.crumb a{color:var(--gray)}
.crumb span{color:var(--primary);font-weight:600}
.phero{padding:26px 0 46px}
.phero-grid{display:grid;grid-template-columns:1fr 1fr;gap:44px;align-items:center}
.phero-img{background:#fff;border:1px solid var(--border);border-radius:22px;padding:26px;box-shadow:0 24px 60px rgba(15,23,42,.08)}
.tag{display:inline-block;padding:8px 16px;border-radius:999px;background:rgba(37,99,235,.1);color:var(--accent);font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;margin-bottom:18px}
.phero h1{font-size:38px;margin-bottom:18px}
.lead{font-size:17px;color:#475569;margin-bottom:26px}
.btn{display:inline-block;padding:15px 30px;border-radius:14px;background:var(--accent);color:#fff!important;font-weight:700;box-shadow:0 16px 40px rgba(37,99,235,.24)}
.block{padding:34px 0;border-top:1px solid var(--border)}
.block h2{font-size:24px;margin-bottom:20px}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:30px}
ul.ticks{list-style:none}
ul.ticks li{position:relative;padding-left:28px;margin-bottom:12px;color:#475569}
ul.ticks li:before{content:'';position:absolute;left:0;top:9px;width:14px;height:14px;border-radius:4px;background:rgba(37,99,235,.16);box-shadow:inset 0 0 0 3px var(--accent)}
.chips{display:flex;flex-wrap:wrap;gap:10px}
.chip{padding:9px 16px;border-radius:10px;background:#fff;border:1px solid var(--border);font-weight:600;font-size:14px;color:var(--secondary)}
table.spec{width:100%;border-collapse:collapse;background:#fff;border:1px solid var(--border);border-radius:14px;overflow:hidden}
table.spec th,table.spec td{text-align:left;padding:14px 18px;border-bottom:1px solid var(--border);font-size:14px}
table.spec th{width:42%;background:#f8fafc;color:var(--secondary);font-weight:700}
table.spec tr:last-child th,table.spec tr:last-child td{border-bottom:none}
.spec-note{font-size:13px;color:var(--gray);margin-top:12px}
.rel-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:18px}
.rel-card{background:#fff;border:1px solid var(--border);border-radius:16px;overflow:hidden;transition:.25s}
.rel-card:hover{transform:translateY(-4px);box-shadow:0 18px 44px rgba(15,23,42,.1)}
.rel-card img{aspect-ratio:1/1;object-fit:cover;width:100%}
.rel-card span{display:block;padding:14px 16px;font-weight:600;font-size:14px;color:var(--primary)}
.ctaband{margin:20px 0 0;background:linear-gradient(120deg,#0f172a,#1e293b);border-radius:24px;padding:48px 40px;text-align:center;color:#fff}
.ctaband h2{color:#fff;font-size:28px;margin-bottom:14px}
.ctaband p{color:rgba(255,255,255,.8);max-width:620px;margin:0 auto 26px}
footer{margin-top:56px;padding:34px 0;border-top:1px solid var(--border);color:var(--gray);font-size:13px}
footer .fx{display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px}
@media(max-width:820px){.phero-grid,.cols{grid-template-columns:1fr}.rel-grid{grid-template-columns:1fr 1fr}.bar-nav a:not(.cta){display:none}.phero h1{font-size:30px}}
"""

PAGE = string.Template("""<!DOCTYPE html>
<html lang="$lang">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>$title</title>
<meta name="description" content="$desc">
<meta name="keywords" content="$keywords">
<meta name="theme-color" content="#0f172a">
<link rel="canonical" href="$canonical">
$hreflang
<link rel="icon" type="image/webp" sizes="88x88" href="/LOGO/ZXLOGO_88.webp">
<link rel="icon" type="image/webp" sizes="44x44" href="/LOGO/ZXLOGO_44.webp">
<link rel="icon" type="image/png" href="/LOGO/ZXLOGO_web.png">
<link rel="apple-touch-icon" href="/LOGO/ZXLOGO_web.png">
<meta property="og:site_name" content="ZHIXIN RUBBER TECH">
<meta property="og:title" content="$title">
<meta property="og:description" content="$desc">
<meta property="og:type" content="product">
<meta property="og:url" content="$canonical">
<meta property="og:image" content="$ogimg">
<meta property="og:locale" content="$oglocale">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="$title">
<meta name="twitter:description" content="$desc">
<meta name="twitter:image" content="$ogimg">
<script>if(location.protocol!=='https:'){location.replace('https:'+window.location.href.substring(window.location.protocol.length));}</script>
<script type="application/ld+json">
$jsonld
</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preload" as="style" href="$font">
<link href="$font" rel="stylesheet" media="print" onload="this.media='all'">
<noscript><link href="$font" rel="stylesheet"></noscript>
<style>$css</style>
</head>
<body>
<header class="topbar"><div class="container bar-inner">
<a class="brand" href="$home"><img src="/LOGO/ZXLOGO.webp" alt="ZHIXIN RUBBER TECH"><span>ZHIXIN RUBBER TECH</span></a>
<nav class="bar-nav">
<a href="${home}products/">$products_label</a>
<span class="langs">$langlinks</span>
<a class="cta" href="${home}#contact">$quote</a>
</nav>
</div></header>
<div class="container">
<nav class="crumb"><a href="$home">$home_label</a> › <a href="${home}products/">$products_label</a> › <span>$name</span></nav>
</div>
<section class="phero"><div class="container phero-grid">
<div class="phero-img"><img src="$img" alt="$name" width="640" height="640"></div>
<div class="phero-body">
<div class="tag">$cat</div>
<h1>$h1</h1>
<p class="lead">$lead</p>
<a class="btn" href="${home}#contact">$quote</a>
</div>
</div></section>
<div class="container">
<div class="block"><div class="cols">
<div><h2>$applications_label</h2><ul class="ticks">$apps_html</ul></div>
<div><h2>$materials_label</h2><div class="chips">$mats_html</div>
<h2 style="margin-top:28px">$capabilities_label</h2><ul class="ticks">$caps_html</ul></div>
</div></div>
<div class="block"><h2>$specs_label</h2>
<table class="spec">$spec_html</table>
<p class="spec-note">$spec_note</p>
</div>
<div class="block"><h2>$related_label</h2><div class="rel-grid">$rel_html</div></div>
<div class="ctaband"><h2>$cta_head</h2><p>$cta_text</p><a class="btn" href="${home}#contact">$quote</a></div>
</div>
<footer><div class="container fx"><span>$copy</span><a href="$home">$backhome</a></div></footer>
</body>
</html>
""")

HUB = string.Template("""<!DOCTYPE html>
<html lang="$lang">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>$title</title>
<meta name="description" content="$desc">
<meta name="theme-color" content="#0f172a">
<link rel="canonical" href="$canonical">
$hreflang
<link rel="icon" type="image/webp" sizes="88x88" href="/LOGO/ZXLOGO_88.webp">
<link rel="icon" type="image/png" href="/LOGO/ZXLOGO_web.png">
<link rel="apple-touch-icon" href="/LOGO/ZXLOGO_web.png">
<meta property="og:site_name" content="ZHIXIN RUBBER TECH">
<meta property="og:title" content="$title">
<meta property="og:description" content="$desc">
<meta property="og:type" content="website">
<meta property="og:url" content="$canonical">
<meta property="og:image" content="$SITE/og-image.jpg">
<meta property="og:locale" content="$oglocale">
<script>if(location.protocol!=='https:'){location.replace('https:'+window.location.href.substring(window.location.protocol.length));}</script>
<script type="application/ld+json">
$jsonld
</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preload" as="style" href="$font">
<link href="$font" rel="stylesheet" media="print" onload="this.media='all'">
<noscript><link href="$font" rel="stylesheet"></noscript>
<style>$css</style>
</head>
<body>
<header class="topbar"><div class="container bar-inner">
<a class="brand" href="$home"><img src="/LOGO/ZXLOGO.webp" alt="ZHIXIN RUBBER TECH"><span>ZHIXIN RUBBER TECH</span></a>
<nav class="bar-nav">
<a href="${home}products/">$products_label</a>
<span class="langs">$langlinks</span>
<a class="cta" href="${home}#contact">$quote</a>
</nav>
</div></header>
<div class="container">
<nav class="crumb"><a href="$home">$home_label</a> › <span>$products_label</span></nav>
<section class="phero"><div class="phero-body" style="max-width:820px">
<div class="tag">$products_label</div>
<h1 style="font-size:40px">$hub_h1</h1>
<p class="lead">$hub_sub</p>
</div></section>
<div class="block"><div class="rel-grid" style="grid-template-columns:repeat(3,1fr)">$cards</div></div>
</div>
<footer><div class="container fx"><span>$copy</span><a href="$home">$backhome</a></div></footer>
</body>
</html>
""")


def esc(s):
    return s.replace("&", "&amp;").replace('"', "&quot;")


def abs_img(path):
    # /产品照片/x.webp -> https://site/%E4%BA%A7.../x.webp
    return SITE + quote(path, safe="/")


def hreflang_block(suffix):
    """suffix e.g. 'products/suspension-bushing/' or 'products/'"""
    lines = []
    for lang, (_, _, prefix) in LANGS.items():
        lines.append(f'<link rel="alternate" hreflang="{lang}" href="{SITE}/{prefix}{suffix}">')
    lines.append(f'<link rel="alternate" hreflang="x-default" href="{SITE}/{suffix}">')
    return "\n".join(lines)


def lang_links(suffix, cur):
    out = []
    for lang, (_, _, prefix) in LANGS.items():
        cls = ' class="on"' if lang == cur else ''
        out.append(f'<a{cls} href="/{prefix}{suffix}">{LANG_CODE[lang]}</a>')
    return "".join(out)


def write(path, html):
    full = os.path.join(ROOT, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w", encoding="utf-8") as f:
        f.write(html)
    return path


def build_product(p, lang):
    ui = UI[lang]
    d = p[lang]
    html_lang, oglocale, prefix = LANGS[lang]
    home = "/" + prefix
    suffix = f"products/{p['slug']}/"
    canonical = f"{SITE}/{prefix}{suffix}"
    name = d["name"]
    h1 = f"{name} {ui['manufacturer']}" if lang != "zh" else f"{name}{ui['manufacturer']}"
    title = f"{name} {ui['manufacturer']} | ZHIXIN RUBBER TECH" if lang != "zh" else f"{name}{ui['manufacturer']} | 致信橡胶科技"
    ogimg = abs_img(p["img"])

    apps_html = "".join(f"<li>{esc(a)}</li>" for a in d["apps"])
    mats_html = "".join(f'<span class="chip">{esc(m)}</span>' for m in p["materials"])
    caps_html = "".join(f"<li>{esc(c)}</li>" for c in ui["capabilities_list"])
    # spec rows: material row shows the compounds; rest "on request"
    rows = []
    mat_val = " / ".join(p["materials"])
    spec_vals = [mat_val] + [ui["onrequest"]] * (len(ui["spec_rows"]) - 1)
    for label, val in zip(ui["spec_rows"], spec_vals):
        rows.append(f"<tr><th>{esc(label)}</th><td>{esc(val)}</td></tr>")
    spec_html = "".join(rows)

    # related = other products
    rel = []
    for q in PRODUCTS:
        if q["slug"] == p["slug"]:
            continue
        rel.append(f'<a class="rel-card" href="{home}products/{q["slug"]}/">'
                   f'<img loading="lazy" src="{q["img"]}" alt="{esc(q[lang]["name"])}">'
                   f'<span>{esc(q[lang]["name"])}</span></a>')
    rel_html = "".join(rel)

    jsonld = product_jsonld(p, lang, canonical, name, d, ogimg)

    html = PAGE.substitute(
        lang=html_lang, title=esc(title), desc=esc(d["meta"]),
        keywords=esc(f"{name}, {name} {ui['manufacturer']}, {mat_val}, OEM rubber parts, ZHIXIN RUBBER TECH"),
        canonical=canonical, hreflang=hreflang_block(suffix), ogimg=ogimg, oglocale=oglocale,
        jsonld=jsonld, font=FONT, css=CSS, home=home,
        products_label=esc(ui["products"]), langlinks=lang_links(suffix, lang), quote=esc(ui["quote"]),
        home_label=esc(ui["home"]), name=esc(name), cat=esc(d["cat"]), h1=esc(h1), lead=esc(d["lead"]),
        img=p["img"], applications_label=esc(ui["applications"]), apps_html=apps_html,
        materials_label=esc(ui["materials"]), mats_html=mats_html,
        capabilities_label=esc(ui["capabilities"]), caps_html=caps_html,
        specs_label=esc(ui["specs"]), spec_html=spec_html, spec_note=esc(ui["cta_text"]),
        related_label=esc(ui["related"]), rel_html=rel_html,
        cta_head=esc(ui["cta_head"]), cta_text=esc(ui["cta_text"]),
        copy=esc(ui["copy"]), backhome=esc(ui["backhome"]),
    )
    return write(f"{prefix}products/{p['slug']}/index.html", html)


def product_jsonld(p, lang, canonical, name, d, ogimg):
    import json
    # Only BreadcrumbList: a bare Product without offers/review/aggregateRating
    # triggers a Google "critical" error, and we have no honest price or reviews
    # to add. Breadcrumbs are valid, useful (breadcrumb rich result) and clean.
    breadcrumb = {
        "@context": "https://schema.org", "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": UI[lang]["home"], "item": f"{SITE}/{LANGS[lang][2]}"},
            {"@type": "ListItem", "position": 2, "name": UI[lang]["products"], "item": f"{SITE}/{LANGS[lang][2]}products/"},
            {"@type": "ListItem", "position": 3, "name": name, "item": canonical},
        ],
    }
    return json.dumps(breadcrumb, ensure_ascii=False, indent=2)


def build_hub(lang):
    import json
    ui = UI[lang]
    html_lang, oglocale, prefix = LANGS[lang]
    home = "/" + prefix
    suffix = "products/"
    canonical = f"{SITE}/{prefix}{suffix}"
    cards = []
    for q in PRODUCTS:
        cards.append(f'<a class="rel-card" href="{home}products/{q["slug"]}/">'
                     f'<img loading="lazy" src="{q["img"]}" alt="{esc(q[lang]["name"])}">'
                     f'<span>{esc(q[lang]["name"])}</span></a>')
    itemlist = {
        "@context": "https://schema.org", "@type": "ItemList",
        "name": ui["hub_h1"],
        "itemListElement": [
            {"@type": "ListItem", "position": i + 1,
             "url": f"{SITE}/{prefix}products/{q['slug']}/", "name": q[lang]["name"]}
            for i, q in enumerate(PRODUCTS)
        ],
    }
    html = HUB.substitute(
        lang=html_lang, title=esc(f"{ui['hub_title']} | ZHIXIN RUBBER TECH"),
        desc=esc(ui["hub_sub"]), canonical=canonical, hreflang=hreflang_block(suffix),
        oglocale=oglocale, SITE=SITE, jsonld=json.dumps(itemlist, ensure_ascii=False, indent=2),
        font=FONT, css=CSS, home=home, products_label=esc(ui["products"]),
        langlinks=lang_links(suffix, lang), quote=esc(ui["quote"]), home_label=esc(ui["home"]),
        hub_h1=esc(ui["hub_h1"]), hub_sub=esc(ui["hub_sub"]), cards="".join(cards),
        copy=esc(ui["copy"]), backhome=esc(ui["backhome"]),
    )
    return write(f"{prefix}products/index.html", html)


def main():
    count = 0
    for lang in LANGS:
        count += 1 if build_hub(lang) else 0
        for p in PRODUCTS:
            build_product(p, lang)
            count += 1
    print(f"generated {count} product pages ({len(PRODUCTS)} products + 1 hub) x {len(LANGS)} languages")


if __name__ == "__main__":
    main()
