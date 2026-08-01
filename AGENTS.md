# AGENTS.md — zxrubbertech.com 网站改动必读

> 给任何 AI 助手/开发者的交接文档。改这个网站之前把本文读完,尤其是「铁律」和「构建链」。
> 最后更新:2026-08-01(由 Claude Code 整理,含全部历史改造上下文)

---

## 1. 项目是什么

- **静态网站**,无后端、无框架。GitHub Pages 托管,仓库 `ZXRUBBERTECH/zxrubbertech-website`,**推送 `main` 分支即自动部署上线**。
- 域名 `www.zxrubbertech.com`(`CNAME` 文件 + `.nojekyll`)。**带 www 是规范域名**:非 www 和 http 都 301 到 `https://www.`,全站 canonical 也指向 www。
- 业务:中国 B2B 工业橡胶制造商外贸获客站。制造方 **ANHUI ZHIXIN MATERIAL TECHNOLOGY CO., LTD**(安徽致信材料科技有限公司),出口方 **NINGBO LILEI IMPORT AND EXPORT CO., LTD**。
- 转化目标:采购商询盘(联系表单走 Formspree,formId `xkoevwql`)。

## 2. 目录结构(哪些是源头、哪些是生成物)

```
index.html            ← 英文首页 = 全站唯一内容源头(含 i18n 字典 + 全部 CSS/JS 内联)
de/ zh/ ru/ tr/       ← 【生成物】各语言首页,由 scripts/build_i18n_pages.py 生成
products/<slug>/      ← 【生成物】英文产品页 ×5 + 总览页,由 scripts/build_products.py 生成
{de,zh,ru,tr}/products/ ← 【生成物】产品页的语言版(共 30 页)
sitemap.xml           ← 【生成物】由 scripts/build_sitemap.py 生成(35 条 URL)
scripts/
  extract_i18n.mjs    ← 从 index.html 抽取 i18n 字典为 JSON(Node)
  build_i18n_pages.py ← 生成语言首页(Python + bs4)
  build_products.py   ← 生成产品页;产品文案+五语翻译全部内嵌在此脚本里
  build_sitemap.py    ← 生成 sitemap(SLUGS 列表须与 build_products.py 同步)
assets/               ← 自托管背景图(hero-bg.webp / global-bg.webp)
LOGO/ 产品照片/ OptimizedPicture/ 设备照片/  ← 真实照片资源(中文文件名,均有 .webp)
og-image.jpg          ← 1200×630 社交分享图
robots.txt            ← 全放行 + sitemap 指引
GSC-收录操作清单.md    ← 内部运营文档,已 gitignore,不发布
```

**⚠️ 生成物禁止手改。** 改 `de/zh/ru/tr/index.html`、任何 `products/**/index.html`、`sitemap.xml` 都是白改——下次构建会被覆盖。永远改源头(`index.html`、三个 build 脚本),然后跑构建链。

## 3. 构建链(改完源头必须跑)

```bash
node scripts/extract_i18n.mjs /tmp/i18n.json
I18N_JSON=/tmp/i18n.json python3 scripts/build_i18n_pages.py   # 重生成 4 个语言首页
python3 scripts/build_products.py                               # 重生成 30 个产品页
python3 scripts/build_sitemap.py                                # 重生成 sitemap.xml
```

- 只改了首页内容/i18n 字典 → 跑前两条即可;改了产品数据 → 跑第三条;增删页面 → 第四条。
- 依赖:Python3 + `bs4` + `lxml`,Node.js。
- 部署 = `git push origin main`,GitHub Pages 约 1 分钟后生效。

## 4. 多语言机制(改文案前必懂)

- 五种语言:`en`(根目录)、`de`、`zh`、`ru`、`tr`。i18n 字典在 `index.html` 底部 `const i18n = {...}`,**每语言 178 个键,五语言必须键完全对齐**(校验:抽出 JSON 后 diff en 与其他语言的键集合)。
- HTML 元素用 `data-i18n="组.键"` 标注;英文文本直接写在元素里当 fallback。
- **`<html lang>` 是页面语言的权威声明**,加载时 JS 按它应用语言(不是 localStorage);语言切换器是真实 `<a href>` 链接(不是 JS 按钮),`setLang` 的 `labels` 映射含全部 5 语言。
- 每页 head 有 **6 条 hreflang**(5 语言 + `x-default`→英文),互相对指;og:locale + 4 条 alternate。
- 语言首页会把内部 `/products/...` 链接改写成 `/<lang>/products/...`(build_i18n_pages.py 处理)。
- **新增语言的完整清单**(2026-07-21 加土耳其语时验证过):① `index.html` 字典加语言块(178 键)+ 切换器加 `<a>` + head 加 hreflang 行和 og:locale:alternate + `setLang` labels 加代码;② 三个 build 脚本的 `LANGS`(build_products 还要 `LANG_CODE`、`UI` 块、每个产品的语言块);③ 全量重跑构建链(旧语言页的 hreflang 簇会自动扩)。

## 5. 铁律(违反过、修复过,别再犯)

1. **结构化数据禁止裸 `Product`。** Google 要求 Product 必须带 `offers`/`review`/`aggregateRating` 之一,否则报"严重问题"(2026-07-18 踩坑,5 个产品全报错)。本站没有价格和评价,所以产品页**只放 `BreadcrumbList`**,首页 ItemList 只用普通 `ListItem`(position/name/url)。除非老板提供真实报价或真实客户评价,否则不准加回 Product 类型。
2. **事实红线:绝不编造。** 认证(ISO/IATF)、硬度、耐温、尺寸、MOQ、价格——网站上没有这些数据是**故意的**,统一写 "Available on request / 来询提供"。老板提供真实值之前,任何人不得填入具体数字或认证名。可安全使用的真实事实:年产能 3000 吨、年产 1500 万件、胶料清单(NR/EPDM/NBR/HNBR/CR/SBR/MQ/FKM/AEM·ACM/NV)、OEM/ODM、CAE、橡胶-金属粘接。
3. **名称规矩(2026-07-21 改名后):** 法定名 = ANHUI ZHIXIN MATERIAL TECHNOLOGY CO., LTD / 安徽致信材料科技有限公司(旧名"RUBBER TECH/橡胶科技"已全站替换)。但**品牌简称 `ZHIXIN RUBBER TECH` 和域名保持不变**(标题、logo 文字、版权、og:site_name)——这是老板明确决定,不要"顺手统一"。
4. **联系方式唯一真值:** 邮箱 `martin@zxrubbertech.com`(不是 admin@),WhatsApp `+86 152 5622 5135`,地址 No. 33, Waihuan East Road, Helixi Street, Ningguo City, Xuancheng City, Anhui Province, China。
5. **`index.html` 头部有强制 HTTPS 跳转脚本**(`location.protocol!=='https:'` 一行)。本地起 http 服务测试前必须先把它剥掉(临时副本),否则页面秒跳 https 打不开。产品页模板里也有同款。
6. **图片中文文件名**:绝对 URL 里必须百分号编码(参照现有 JSON-LD/og:image 写法);站内相对引用直接用中文路径没问题。全站图片用 .webp。

## 6. 验证清单(上线前后都要做)

本地(构建后):
- i18n 键对齐:en 与每个语言的键集合 diff 为空。
- 所有页面 `<html lang>` 正确(zh 是 `zh-CN`)、每页 6 条 hreflang、canonical 自指。
  ⚠️ 用 bs4 解析来数 hreflang,**不要用字符串正则**——bs4 生成的页面属性顺序被重排过,`rel="alternate" hreflang=` 这种子串匹配会误报 0。
- 每个 `application/ld+json` 块能被 `json.loads` 解析。
- 无头 Chrome 渲染抽查(JS 跑完后语言不回退、语言按钮标签正确):
  `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --dump-dom <剥掉跳转脚本的临时文件>`
上线后(push 完 ~1 分钟):
- curl 抽查新/改页面 HTTP 200、内容点到位;`sitemap.xml` 合法且条数正确。

## 7. 已完成的改造史(commit 脉络)

- `1c43ce5` 多语言 SEO 重构:预渲染 /de /zh /ru、hreflang、OG、JSON-LD、字体非阻塞加载
- `b327d0b` 5 产品独立子页 ×4 语言 + 首页 FAQ(FAQPage 结构化数据)+ 图库转内链 + 修 ru 切换器
- `f737b47` 删裸 Product 结构化数据(清 GSC 5 个严重错误)
- `30be1e7` 背景图自托管(assets/*.webp,原 Unsplash 外链)
- `8515d7b` 公司法定名改 MATERIAL TECHNOLOGY(中英全站,品牌简称保留)
- `0e7d487` 新增土耳其语(第 5 语言,sitemap 扩到 35 条)

## 8. 待办清单(按性价比排序,2026-08-01 状态)

1. **联系方式可点击**:邮箱加 `mailto:`、WhatsApp 加 `https://wa.me/8615256225135` 链接(现在是纯文本,转化漏洞)。改 `index.html` 联系区 + 页脚,重跑构建链。
2. **字体自托管**:现仍从 fonts.googleapis.com 加载 Inter + Montserrat(4 处引用)——**中国大陆被墙,/zh/ 访客加载卡**。下载 woff2 放 `assets/fonts/`,内联 @font-face,删外链(参照背景图自托管的做法)。顺带可把 Formspree 的 unpkg.com 脚本也本地化。
3. **新产品页**:未上架真实图片在 `产品照片/`:传动轴支撑、其他配套-金属冲压件、其他配套-塑料件、其他配套-金属管件(各有 .webp)。在 `build_products.py` 的 `PRODUCTS` 加数据(五语言)+ `build_sitemap.py` 的 `SLUGS` 同步 + 重跑构建。
4. **多语言 404 页**:GitHub Pages 支持根目录 `404.html`。
5. **知识型文章**(长尾流量,慢见效):如 "EPDM vs NBR 选型"。
6. **等老板提供**(任何人不得代编):ISO/IATF 认证、硬度/耐温范围、MOQ → 有了就填进产品页规格表(现为 Available on request)。
7. 站外(老板亲自操作):GSC 收录回访、B2B 目录外链(Alibaba/Made-in-China/Europages)、俄语市场 Yandex Webmaster。

## 9. 本机环境备注

- 本地工作副本:`~/Documents/zxrubbertech-website/zxrubbertech-website`(即本仓库)。
- macOS 隐私设置(TCC)可能挡住 CLI 工具读取 `~/Documents` 下的文件(报 Operation not permitted 但 Unix 权限正常)。解法:给终端/工具授予"完整磁盘访问权",或 `git clone` 到不受限目录工作。
- `.superpowers/`、`GSC-收录操作清单.md` 是本地工作文件,已 gitignore,不要提交发布。
