import { THEME_JS } from "./theme";
import {
  type Channel,
  CHANNEL_BASEPATH,
  jsonLdScript,
  siteMetaFor,
  sitemapUrl,
} from "@remilia/seo";
import { esc } from "./html";

export interface Chrome {
  stylesheet: string;
  header: string;
  footer: string;
}

export interface PageInput {
  title: string;
  description: string;
  canonical: string;
  jsonld: object[];
  headExtra?: string;

  mainHtml: string;

  leftRail?: string;

  tocHtml?: string;

  citeHtml?: string;

  layoutClass?: string;

  bodyEnd?: string;

  ogImage?: string;
  ogType?: "article" | "website";
  chrome: Chrome;
  noindex?: boolean;
  lang?: string;

  /** Drives host identity, icons, social profiles and alternate formats. */
  channel?: Channel;

  /** Article timestamps; emitted as Open Graph article metadata. */
  publishedTime?: string;
  modifiedTime?: string;

  /** Per-page alternate renditions, e.g. the `.md` and `.txt` siblings. */
  alternates?: { type: string; title: string; href: string }[];
}

function themeSelHtml(): string {
  const hues: [number, string][] = [
    [30, "Red"],
    [95, "Yellow"],
    [145, "Green"],
    [255, "Blue"],
    [330, "Magenta"],
  ];
  const radios = hues
    .map(([h, name]) => {
      const checked = h === 30 ? " checked" : "";
      return `<input type="radio" name="theme-hue" id="theme-hue-${h}" value="${h}" aria-label="${name}"${checked}><label for="theme-hue-${h}"></label>`;
    })
    .join("");
  const dots = [
    ["none", "No dots"],
    ["small", "Small dots"],
    ["large", "Large dots"],
  ]
    .map(([id, name]) => {
      const checked = id === "large" ? " checked" : "";
      return `<input type="radio" name="theme-dots" id="theme-dots-${id}" value="${id}" aria-label="${name}"${checked}><label for="theme-dots-${id}" class="theme-dot theme-dot-${id}"></label>`;
    })
    .join("");
  return `<aside class="theme-sel">
<input type="checkbox" id="theme-pop" class="disclosure">
<label for="theme-pop" class="theme-label">Theme</label>
<hr class="nav-rule">
<div class="theme-controls">
<div class="theme-hues" role="radiogroup" aria-label="Theme color">
${radios}
</div>
<span class="theme-div" aria-hidden="true"></span>
<input type="checkbox" id="theme-dark" class="theme-dark">
<label for="theme-dark" class="theme-mode" aria-label="Dark mode"></label>
<span class="theme-div" aria-hidden="true"></span>
<div class="theme-dots" role="radiogroup" aria-label="Wallpaper dots">
${dots}
</div>
</div>
</aside>`;
}

/**
 * Host identity, icons, social profiles and alternate renditions — the same
 * set the hand-authored corporate pages declare.
 */
function discoveryHead(p: PageInput): string {
  if (!p.channel) return "";
  const site = siteMetaFor(p.channel);
  const base = CHANNEL_BASEPATH[p.channel];
  const lines: string[] = [
    `<meta name="author" content="${esc(site.author)}">`,
    `<meta name="color-scheme" content="light dark">`,
    `<meta name="theme-color" content="${esc(site.themeColor)}">`,
  ];
  const icons = site.icons ?? {};
  if (icons.favicon)
    lines.push(`<link rel="icon" href="${esc(icons.favicon)}" sizes="any">`);
  if (icons.png)
    lines.push(
      `<link rel="icon" href="${esc(icons.png)}" type="image/png">`,
    );
  if (icons.appleTouch)
    lines.push(
      `<link rel="apple-touch-icon" href="${esc(icons.appleTouch)}" sizes="180x180">`,
    );
  if (icons.manifest)
    lines.push(`<link rel="manifest" href="${esc(icons.manifest)}">`);
  lines.push(`<link rel="home" href="${esc(site.origin)}/">`);

  for (const map of site.textMaps ?? [])
    lines.push(
      `<link rel="alternate" type="text/plain" title="${esc(map.title)}" href="${esc(map.href)}">`,
    );
  lines.push(
    `<link rel="alternate" type="text/plain" title="Section llms.txt" href="${base}/llms.txt">`,
  );
  for (const alt of p.alternates ?? [])
    lines.push(
      `<link rel="alternate" type="${esc(alt.type)}" title="${esc(alt.title)}" href="${esc(alt.href)}">`,
    );
  lines.push(
    `<link rel="sitemap" type="application/xml" title="Sitemap" href="${sitemapUrl(p.channel)}">`,
  );
  for (const profile of site.me)
    lines.push(`<link rel="me" href="${esc(profile)}">`);

  lines.push(
    `<meta property="og:site_name" content="${esc(site.name)}">`,
    `<meta property="og:locale" content="${esc(site.locale)}">`,
  );
  if (p.publishedTime)
    lines.push(
      `<meta property="article:published_time" content="${esc(p.publishedTime)}">`,
    );
  if (p.modifiedTime)
    lines.push(
      `<meta property="article:modified_time" content="${esc(p.modifiedTime)}">`,
    );
  lines.push(
    `<meta name="twitter:url" content="${esc(p.canonical)}">`,
    `<meta name="twitter:title" content="${esc(p.title)}">`,
    `<meta name="twitter:description" content="${esc(p.description)}">`,
  );
  if (site.twitterSite)
    lines.push(`<meta name="twitter:site" content="${esc(site.twitterSite)}">`);
  if (site.twitterCreator)
    lines.push(
      `<meta name="twitter:creator" content="${esc(site.twitterCreator)}">`,
    );
  const image = p.ogImage ?? site.ogImage;
  if (image)
    lines.push(
      `<meta property="og:image:alt" content="${esc(p.title)}">`,
      `<meta name="twitter:image:alt" content="${esc(p.title)}">`,
    );
  return `${lines.join("\n")}\n`;
}

export function htmlPage(p: PageInput): string {
  const ld = p.jsonld
    .map(
      (d) => `<script type="application/ld+json">${jsonLdScript(d)}</script>`,
    )
    .join("\n");
  const header = p.leftRail
    ? p.chrome.header
    : p.chrome.header.replace(/<span class="head-dials">[\s\S]*?<\/span>/, "");
  const main = p.tocHtml
    ? p.mainHtml
    : p.mainHtml.replace(/<label class="mast-toc"[^>]*>[\s\S]*?<\/label>/, "");
  const ogImage =
    p.ogImage ?? (p.channel ? siteMetaFor(p.channel).ogImage : undefined);
  return `<!DOCTYPE html>
<html lang="${esc(p.lang ?? "en")}" dir="ltr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(p.title)}</title>
<meta name="description" content="${esc(p.description)}">
<meta name="robots" content="${p.noindex ? "noindex" : "index, follow"}">
<link rel="canonical" href="${esc(p.canonical)}">
<meta property="og:title" content="${esc(p.title)}">
<meta property="og:description" content="${esc(p.description)}">
<meta property="og:url" content="${esc(p.canonical)}">
<meta property="og:type" content="${p.ogType ?? (p.jsonld.some((item) => "@type" in item && item["@type"] === "BlogPosting") ? "article" : "website")}">
${
  ogImage
    ? `<meta property="og:image" content="${esc(ogImage)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${esc(ogImage)}">`
    : `<meta name="twitter:card" content="summary">`
}
${discoveryHead(p)}<link rel="stylesheet" href="${esc(p.chrome.stylesheet)}">
<script>${THEME_JS}</script>
${p.headExtra ?? ""}
${ld}
</head>
<body>
<a class="skip" href="#content">Skip to content</a>
<div class="wm" aria-hidden="true">
<svg class="wm-field" xmlns="http://www.w3.org/2000/svg">
<defs>
<pattern id="wm-pat" patternUnits="userSpaceOnUse" width="288" height="288">
<image href="/assets/emblem.svg" width="240" height="240" preserveAspectRatio="xMidYMid meet"/>
</pattern>
<mask id="wm-mask" mask-type="alpha" maskContentUnits="userSpaceOnUse">
<rect width="100%" height="100%" fill="url(#wm-pat)"/>
</mask>
<filter id="wm-stamp" color-interpolation-filters="sRGB" x="-12%" y="-12%" width="124%" height="124%">
<feGaussianBlur in="SourceAlpha" stdDeviation="0.7" result="blur"/>
<feOffset in="blur" dx="1.25" dy="1.25" result="offHi"/>
<feOffset in="blur" dx="-1.25" dy="-1.25" result="offLo"/>
<feComposite in="SourceAlpha" in2="offHi" operator="arithmetic" k2="1" k3="-1" result="innerDark"/>
<feComposite in="SourceAlpha" in2="offLo" operator="arithmetic" k2="1" k3="-1" result="innerLit"/>
<feFlood flood-color="#000000" flood-opacity="0.38" result="darkCol"/>
<feFlood flood-color="#ffffff" flood-opacity="0.62" result="litCol"/>
<feComposite in="darkCol" in2="innerDark" operator="in" result="shade"/>
<feComposite in="litCol" in2="innerLit" operator="in" result="light"/>
<feMerge>
<feMergeNode in="shade"/>
<feMergeNode in="light"/>
</feMerge>
</filter>
</defs>
<rect class="wm-tile" width="100%" height="100%" fill="#000" mask="url(#wm-mask)" filter="url(#wm-stamp)"/>
</svg>
</div>
<svg class="dither-fx" aria-hidden="true" focusable="false">
<filter id="dither-3" color-interpolation-filters="sRGB">
<feColorMatrix type="saturate" values="0"/>
<feComponentTransfer>
<feFuncR type="discrete" tableValues="0.1 0.55 1"/>
<feFuncG type="discrete" tableValues="0.1 0.55 1"/>
<feFuncB type="discrete" tableValues="0.1 0.55 1"/>
</feComponentTransfer>
</filter>
<filter id="dither-hover" color-interpolation-filters="sRGB">
<feComponentTransfer result="q">
<feFuncR type="discrete" tableValues="0.098 0.2 0.4 0.6 0.8 1"/>
<feFuncG type="discrete" tableValues="0 0.2 0.4 0.6 0.8 0.992"/>
<feFuncB type="discrete" tableValues="0 0.2 0.4 0.6 0.8 0.992"/>
</feComponentTransfer>
<feComposite in="q" in2="SourceGraphic" operator="arithmetic" k1="0" k2="0.7" k3="0.3" k4="0"/>
</filter>
<filter id="dither-3-dark" color-interpolation-filters="sRGB">
<feColorMatrix type="saturate" values="0"/>
<feComponentTransfer>
<feFuncR type="discrete" tableValues="0.08 0.52 0.22"/>
<feFuncG type="discrete" tableValues="0.04 0.41 0.21"/>
<feFuncB type="discrete" tableValues="0.04 0.41 0.21"/>
</feComponentTransfer>
</filter>
<filter id="dither-hover-dark" color-interpolation-filters="sRGB">
<feComponentTransfer result="q">
<feFuncR type="discrete" tableValues="0.08 0.16 0.26 0.36 0.44 0.52"/>
<feFuncG type="discrete" tableValues="0.05 0.14 0.23 0.32 0.40 0.47"/>
<feFuncB type="discrete" tableValues="0.05 0.14 0.23 0.32 0.40 0.47"/>
</feComponentTransfer>
<feComposite in="q" in2="SourceGraphic" operator="arithmetic" k1="0" k2="0.7" k3="0.3" k4="0"/>
</filter>
</svg>
<div class="layout${p.layoutClass ? ` ${esc(p.layoutClass)}` : ""}">
${
  p.leftRail
    ? `<div class="side-col">
<div class="left-rail">
${header}
<div class="left-stack">
${p.tocHtml ?? ""}
${p.citeHtml ?? ""}
</div>
</div>
<div class="right-rail">
${themeSelHtml()}
${p.leftRail}
</div>
</div>`
    : header
}
${main}
</div>
${p.chrome.footer}
${p.bodyEnd ?? ""}
</body>
</html>
`;
}

function bylineDate(iso: string): string {
  const d = new Date(iso);
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const yy = String(d.getUTCFullYear()).slice(-2);
  return `${mm}.${dd}.${yy}`;
}

export function tocBox(items?: string, noteCount = 0): string {
  if (!items) return "";
  const notes =
    noteCount > 0
      ? `\n<hr class="nav-rule">\n<p class="toc-notes">Notes: ${Array.from(
          { length: noteCount },
          (_, i) => `<a class="toc-note" href="#fn-${i + 1}">[${i + 1}]</a>`,
        ).join(" ")}</p>`
      : "";
  return `<div class="toc">
<input type="checkbox" id="toc-toggle" class="disclosure">
<label for="toc-toggle" class="disclosure-label">Contents</label>
<label class="toc-scrim" for="toc-toggle"></label>
<nav aria-label="Table of Contents" role="doc-toc">
<h2>Table of Contents</h2>
<hr class="nav-rule">
<ol>
${items}
</ol>${notes}
</nav>
</div>`;
}

export function citeBox(input: {
  canonical: string;
  mdHref: string;
  txtHref: string;
}): string {
  return `<aside class="cite-box">
<div class="nav-box">
<p class="cite-url">Permalink: <a class="permalink" href="${esc(input.canonical)}">${esc(input.canonical)}</a></p>
<hr class="nav-rule">
<p class="cite-copy">Copy: <button type="button" class="copy-md" data-src="${esc(input.mdHref)}">[MD]</button> — <button type="button" class="copy-txt" data-src="${esc(input.txtHref)}">[TXT]</button></p>
</div>
</aside>`;
}

export function adjacentHtml(
  posts: { title: string; url: string; date: string }[],
  currentUrl: string,
): string {
  const here = currentUrl.replace(/\/$/, "");
  const slash = here.lastIndexOf("/");
  const index = slash > 0 ? here.slice(0, slash) : "/";
  const sorted = [...posts].sort((a, b) => b.date.localeCompare(a.date));
  const i = sorted.findIndex((p) => p.url.replace(/\/$/, "") === here);
  if (i < 0) return "";
  const newer = sorted[i - 1];
  const older = sorted[i + 1];
  if (!newer && !older) return "";
  const prev = older
    ? `<a class="post-prev" href="${esc(older.url)}"><span class="post-adj-k">&lt;&lt; Previous Post</span><span class="post-adj-t">${esc(older.title)}</span></a>`
    : `<span class="post-prev"></span>`;
  const next = newer
    ? `<a class="post-next" href="${esc(newer.url)}"><span class="post-adj-k">Next Post &gt;&gt;</span><span class="post-adj-t">${esc(newer.title)}</span></a>`
    : `<a class="post-next" href="${esc(index)}"><span class="post-adj-k">All Posts &gt;&gt;</span></a>`;
  return `<nav class="post-adj" aria-label="Adjacent posts">${prev}${next}</nav>`;
}

export function articleHtml(input: {
  title: string;
  publishedAt: string;
  byline?: string;
  authorHref?: string;
  category?: string;
  categoryHref?: string;
  monthHref?: string;
  canonical?: string;
  bodyHtml: string;
  metaHtml?: string;
  mdHref?: string;
  txtHref?: string;
  /** Whole minutes at 200 words per minute; omitted for short notes. */
  readingMinutes?: number;
}): string {
  const date = new Date(input.publishedAt);
  const cat = input.category
    ? `<a class="byline-cat" href="${esc(input.categoryHref ?? "#")}">${esc(input.category)}</a>`
    : `<span class="byline-cat"></span>`;
  const author = input.byline
    ? input.authorHref
      ? `<a class="author" href="${esc(input.authorHref)}">${esc(input.byline)}</a>`
      : `<span class="author">${esc(input.byline)}</span>`
    : `<span class="author"></span>`;
  const time = `<time datetime="${date.toISOString()}">${bylineDate(input.publishedAt)}</time>`;
  const dated = input.monthHref
    ? `<a class="byline-date" href="${esc(input.monthHref)}">${time}</a>`
    : time;
  const meta = input.metaHtml
    ? `\n<div class="sec post-meta">${input.metaHtml}</div>`
    : "";
  const md = input.mdHref
    ? `<button type="button" class="copy-md" data-src="${esc(input.mdHref)}">[MD]</button>`
    : "";
  const txt = input.txtHref
    ? `<button type="button" class="copy-txt" data-src="${esc(input.txtHref)}">[TXT]</button>`
    : "";
  const copy =
    md && txt
      ? `<span class="nav-sep" aria-hidden="true">|</span> Copy: ${md} <span class="nav-sep" aria-hidden="true">|</span> ${txt}`
      : "";
  const read = input.readingMinutes
    ? `<span class="mast-read">${input.readingMinutes} min read</span><span class="nav-sep" aria-hidden="true">|</span> `
    : "";
  return `<main id="content" tabindex="-1" class="article-wrap">
<article class="article-body">
<div class="sec mast">
<header>
<p class="byline">${dated}${cat}${author}</p>
<hr class="nav-rule">
<h1>${esc(input.title)}</h1>
<hr class="nav-rule mast-tools-rule">
<p class="mast-tools">${read}<label class="mast-toc" for="toc-toggle">Table of Contents</label>${copy}</p>
</header>
</div>
<div class="article-rest">
<div class="sec">
<div class="prose">
${input.bodyHtml}
</div>
</div>${meta}
</div>
</article>
</main>`;
}

export interface IndexCard {
  title: string;
  url: string;
  date: string;
  category: string;
  excerpt: string;
  imageUrl?: string;
  author?: string;
}

export function indexMain(
  posts: IndexCard[],
  toolsHtml: string,
  title = "Posts",
): string {
  const cards = posts
    .map((p) => {
      const month = p.date.slice(0, 7);
      const img = p.imageUrl
        ? `<a class="card-thumb" href="${esc(p.url)}" aria-label="${esc(p.title)}"><span class="ht"><span class="ht-map"><img src="${esc(p.imageUrl)}" alt="" loading="lazy"><span class="ht-ink" aria-hidden="true"></span></span></span></a>`
        : "";
      const author = p.author
        ? `<a class="author" href="?author=${esc(encodeURIComponent(p.author))}">${esc(p.author)}</a>`
        : `<span class="author"></span>`;
      const row =
        img || p.excerpt
          ? `<div class="card-row">
${img}
${p.excerpt ? `<p class="card-ex">${esc(p.excerpt)}</p>` : ""}
</div>
<hr class="nav-rule">`
          : "";
      return `<article class="sec post-card" data-title="${esc(p.title)}" data-cat="${esc(p.category)}" data-author="${esc(p.author ?? "")}" data-month="${esc(month)}">
<header>
<p class="card-meta"><time datetime="${esc(p.date)}">${bylineDate(p.date)}</time>${author}</p>
<h2><a href="${esc(p.url)}">${esc(p.title)}</a></h2>
</header>
${row}
<p class="card-foot"><span class="byline-cat">${esc(p.category)}</span><a class="card-more" href="${esc(p.url)}" aria-label="Read more: ${esc(p.title)}">Read more</a></p>
</article>`;
    })
    .join("\n");
  return `<main id="content" tabindex="-1" class="article-wrap">
<article class="article-body">
<div class="sec mast index-mast">
<header>
<h1>${esc(title)}</h1>
${toolsHtml}
</header>
</div>
<div class="article-rest">
${cards || '<section class="sec"><p>No posts published yet.</p></section>'}
</div>
</article>
</main>`;
}

/**
 * Section-scoped 404. Lands the reader in the section they aimed at, with the
 * latest posts and the machine-readable maps, rather than a bare apology.
 */
export function notFoundHtml(
  chrome: Chrome,
  basePath: string,
  input: {
    sectionTitle?: string;
    recent?: { title: string; url: string; date: string }[];
  } = {},
): string {
  const section = input.sectionTitle ?? "this section";
  const recent = (input.recent ?? []).slice(0, 5);
  const recentHtml = recent.length
    ? `<h2>Latest in ${esc(section)}</h2>
<ul>
${recent
  .map(
    (p) =>
      `<li><a href="${esc(p.url)}">${esc(p.title)}</a> <time datetime="${esc(p.date)}">${esc(p.date.slice(0, 10))}</time></li>`,
  )
  .join("\n")}
</ul>`
    : "";
  return htmlPage({
    title: "404 — Not found",
    description: "This page does not exist.",
    canonical: "about:blank",
    jsonld: [],
    noindex: true,
    chrome,
    mainHtml: `<main id="content" tabindex="-1" class="article-wrap">
<article class="article-body">
<div class="sec mast">
<header>
<h1>404 — Not found</h1>
</header>
</div>
<div class="article-rest">
<div class="sec">
<div class="prose">
<p>That URL is not here. It may have moved, or it never existed.</p>
${recentHtml}
<h2>Where to go</h2>
<ul>
<li><a href="${esc(basePath)}">${esc(section)} index</a></li>
<li><a href="${esc(basePath)}/rss.xml"><code>rss.xml</code></a></li>
<li><a href="${esc(basePath)}/sitemap.xml"><code>sitemap.xml</code></a></li>
<li><a href="${esc(basePath)}/llms.txt"><code>llms.txt</code></a></li>
<li><a href="/">remilia.org</a></li>
</ul>
</div>
</div>
</div>
</article>
</main>`,
  });
}
