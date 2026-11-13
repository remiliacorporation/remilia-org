import { THEME_JS } from "./theme";
import { NAV_SEARCH, datedHtml, emptyRail } from "./nav";
import {
  type Channel,
  CHANNEL_BASEPATH,
  jsonLdScript,
  siteMetaFor,
  sitemapUrl,
  type HostTheme,
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

  /**
   * The search box (`leftRail` in nav.ts): the search with the author
   * control on its line, then the posts. It closes the right rail, under
   * the theme box and a post's read info. A page without it has no rails.
   */
  leftRail?: string;

  /** The host's section links (`sectionNav`): the left rail's box under the site head. */
  sectionNav?: string;

  /** A post's contents, in the left rail under the section links. */
  tocHtml?: string;

  /** A post's reading time, word count and copy links: the right rail's box. */
  readHtml?: string;

  layoutClass?: string;

  bodyEnd?: string;

  ogImage?: string;
  ogType?: "article" | "website";
  chrome: Chrome;
  noindex?: boolean;
  lang?: string;

  /** Drives host identity, icons, social profiles and alternate formats. */
  channel?: Channel;

  /** The post's bylines; the host's author when absent. */
  author?: string;

  /** Article timestamps; emitted as Open Graph article metadata. */
  publishedTime?: string;
  modifiedTime?: string;

  /** Per-page alternate renditions, e.g. the `.md` and `.txt` siblings. */
  alternates?: { type: string; title: string; href: string }[];
}

const DEFAULT_THEME: HostTheme = { hue: 30, scheme: "system", dots: "large" };

function themeSelHtml(theme: HostTheme): string {
  const hues: [number, string][] = [
    [30, "Red"],
    [95, "Yellow"],
    [145, "Green"],
    [255, "Blue"],
    [330, "Magenta"],
  ];
  const radios = hues
    .map(([h, name]) => {
      const checked = h === theme.hue ? " checked" : "";
      return `<input type="radio" name="theme-hue" id="theme-hue-${h}" value="${h}" aria-label="${name}"${checked}><label for="theme-hue-${h}" data-tip="${name}"></label>`;
    })
    .join("");
  const dots = [
    ["none", "No lattice"],
    ["small", "Dense lattice"],
    ["large", "Sparse lattice"],
  ]
    .map(([id, name]) => {
      const checked = id === theme.dots ? " checked" : "";
      return `<input type="radio" name="theme-dots" id="theme-dots-${id}" value="${id}" aria-label="${name}"${checked}><label for="theme-dots-${id}" class="theme-dot theme-dot-${id}" data-tip="${name}"></label>`;
    })
    .join("");
  // Checked drives the CSS-only path; the JS toggle keeps it in sync after.
  const dark = theme.scheme === "dark" ? " checked" : "";
  return `<aside class="theme-sel">
<input type="checkbox" id="theme-pop" class="disclosure">
<label for="theme-pop" class="theme-label">Theme</label>
<hr class="nav-rule">
<div class="theme-controls">
<div class="theme-hues" role="radiogroup" aria-label="Theme color">
${radios}
</div>
<span class="theme-div" aria-hidden="true"></span>
<input type="checkbox" id="theme-dark" class="theme-dark"${dark}>
<label for="theme-dark" class="theme-mode" data-tip="Dark mode" aria-label="Dark mode"></label>
<span class="theme-div" aria-hidden="true"></span>
<div class="theme-dots" role="radiogroup" aria-label="Wallpaper lattice">
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
    `<meta name="author" content="${esc(p.author?.trim() || site.author)}">`,
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

/**
 * The resting halftone, in the picture's own colors: each channel takes three
 * tones, ink below 5/48 of full brightness, paper from two thirds up, the mid
 * tone between. Equal thirds turned a dark picture into a solid block, because
 * the dot screen can at most double a pixel's brightness and a shadow under
 * one sixth never reached the mid tone.
 */
function ditherFilter(id: string, paper: number): string {
  const table = [
    ...Array<number>(5).fill(0.1),
    ...Array<number>(27).fill(0.55),
    ...Array<number>(16).fill(paper),
  ].join(" ");
  return `<filter id="${id}" color-interpolation-filters="sRGB">
<feComponentTransfer>
<feFuncR type="discrete" tableValues="${table}"/>
<feFuncG type="discrete" tableValues="${table}"/>
<feFuncB type="discrete" tableValues="${table}"/>
</feComponentTransfer>
</filter>`;
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
  const theme = p.channel ? siteMetaFor(p.channel).theme : DEFAULT_THEME;
  // `system` leaves data-scheme off, which is what the prefers-color-scheme
  // rules key on; a pinned scheme overrides the reader's OS.
  const themeAttrs = [
    ` data-hue="${theme.hue}"`,
    ` data-dots="${theme.dots}"`,
    theme.scheme === "system" ? "" : ` data-scheme="${theme.scheme}"`,
  ].join("");
  return `<!DOCTYPE html>
<html lang="${esc(p.lang ?? "en")}" dir="ltr"${themeAttrs}>
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
${ditherFilter("dither-3", 1)}
<filter id="dither-hover" color-interpolation-filters="sRGB">
<feComponentTransfer result="q">
<feFuncR type="discrete" tableValues="0.098 0.2 0.4 0.6 0.8 1"/>
<feFuncG type="discrete" tableValues="0 0.2 0.4 0.6 0.8 0.992"/>
<feFuncB type="discrete" tableValues="0 0.2 0.4 0.6 0.8 0.992"/>
</feComponentTransfer>
<feComposite in="q" in2="SourceGraphic" operator="arithmetic" k1="0" k2="0.7" k3="0.3" k4="0"/>
</filter>
${ditherFilter("dither-3-dark", 0.88)}
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
${p.sectionNav ? `<div class="sec-box">\n${p.sectionNav}\n</div>` : ""}
${p.readHtml ?? ""}
<div class="left-stack">
${p.tocHtml ?? ""}
</div>
</div>
<div class="right-rail">
${themeSelHtml(theme)}
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

/**
 * Advance widths of the masthead title's face (Alte Haas Grotesk Bold), in
 * thousandths of an em, for the capitals a title is set in. Measured in the
 * browser from the shipped font; a glyph missing here counts a full em.
 */
const TITLE_GLYPHS = new Map<string, number>(
  (
    [
      ["|", 223],
      ["`", 259],
      [" !',.:;‘’", 278],
      ["I", 295],
      ["()", 296],
      ["[]{}", 333],
      ["/\\", 371],
      ["*-", 407],
      ["\"“”", 463],
      ["_–", 500],
      ["#$0123456789?J", 556],
      ["FL", 593],
      ["+<=>^~", 600],
      ["T", 611],
      ["V", 630],
      ["EZÉ", 648],
      ["S", 649],
      ["PXY", 667],
      ["&A", 685],
      ["B", 704],
      ["KR", 722],
      ["CDHNU", 741],
      ["G", 759],
      ["OQ", 778],
      ["@", 800],
      ["M", 907],
      ["W", 944],
      ["%—…", 1000],
    ] as [string, number][]
  ).flatMap(([chars, w]) => [...chars].map((c): [string, number] => [c, w])),
);

/**
 * A title's width on one line, in ems: its capitals' advances plus the caps
 * tracking, with a little slack for rounding. The masthead divides its width
 * by this to find the size at which the title fits one line.
 */
export function titleEm(title: string): number {
  let em = 0;
  for (const c of title.toUpperCase())
    em += (TITLE_GLYPHS.get(c) ?? 1000) / 1000 + 0.03;
  return Math.ceil(em * 1.02 * 100) / 100;
}

/**
 * The class that sizes a title to one line: its width rounded up to a whole
 * em, which the stylesheet turns into a size. A title of 19 ems or less fits
 * every masthead at display size and takes no class; past 41 ems it is at
 * the smallest size everywhere and wraps.
 */
function titleFit(title: string): string {
  const em = Math.ceil(titleEm(title));
  return em <= 19 ? "" : ` class="title-fit-${Math.min(em, 41)}"`;
}

function bylineDate(iso: string): string {
  const d = new Date(iso);
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const yy = String(d.getUTCFullYear()).slice(-2);
  return `${mm}.${dd}.${yy}`;
}

/**
 * The contents box: the headings, then the row of note links. A post with
 * notes and no headings gets the box with the note links alone.
 */
export function tocBox(items?: string, noteCount = 0): string {
  const notes =
    noteCount > 0
      ? `<p class="toc-notes">Notes: ${Array.from(
          { length: noteCount },
          (_, i) => `<a class="toc-note" href="#fn-${i + 1}">[${i + 1}]</a>`,
        ).join(" ")}</p>`
      : "";
  const rows = [items ? `<ol>\n${items}\n</ol>` : "", notes].filter(Boolean);
  if (!rows.length) return "";
  return `<div class="toc">
<input type="checkbox" id="toc-toggle" class="disclosure">
<label for="toc-toggle" class="disclosure-label">Contents</label>
<label class="toc-scrim" for="toc-toggle"></label>
<nav aria-label="Table of Contents" role="doc-toc">
<h2>Table of Contents</h2>
<hr class="nav-rule">
${rows.join('\n<hr class="nav-rule">\n')}
</nav>
</div>`;
}

export function citeBox(input: {
  canonical: string;
  mdHref: string;
  txtHref: string;
  minutes?: number;
  words?: number;
}): string {
  const stats = [
    input.minutes ? `${input.minutes} min read` : "",
    input.words ? `${input.words.toLocaleString("en-US")} words` : "",
  ]
    .filter(Boolean)
    .join(" — ");
  return `<aside class="cite-box">
<div class="nav-box">
<p class="cite-url">${stats}</p>
<hr class="nav-rule">
<p class="cite-copy">Copy: <button type="button" class="copy-url" data-url="${esc(input.canonical)}">[URL]</button> — <button type="button" class="copy-md" data-src="${esc(input.mdHref)}">[MD]</button> — <button type="button" class="copy-txt" data-src="${esc(input.txtHref)}">[TXT]</button></p>
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

export interface BylineInput {
  publishedAt: string;
  byline?: string;
  authorHref?: string;
  category?: string;
  categoryHref?: string;
  monthHref?: string;
}

/** The article byline's three slots: date, section, author. */
export function bylineHtml(input: BylineInput): string {
  const date = new Date(input.publishedAt);
  const cat = input.category
    ? `<a class="byline-cat" href="${esc(input.categoryHref ?? "#")}">${esc(input.category)}</a>`
    : `<span class="byline-cat"></span>`;
  const author = input.byline
    ? input.authorHref
      ? `<a class="author" href="${esc(input.authorHref)}">${esc(input.byline)}</a>`
      : `<span class="author">${esc(input.byline)}</span>`
    : `<span class="author"></span>`;
  // An undated draft (only the Studio sees one) keeps the slot empty.
  const dated = Number.isNaN(date.getTime())
    ? `<span class="byline-date"></span>`
    : datedHtml(
        date.toISOString(),
        bylineDate(input.publishedAt),
        input.monthHref,
        "byline-date",
      );
  return `${dated}${cat}${author}`;
}

export function articleHtml(
  input: BylineInput & {
    title: string;
    canonical?: string;
    bodyHtml: string;
    metaHtml?: string;
    mdHref?: string;
    txtHref?: string;
    /** Whole minutes at 200 words per minute; omitted for short notes. */
    readingMinutes?: number;
  },
): string {
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
      ? `<span class="mast-copy"><span class="nav-sep" aria-hidden="true">—</span> Copy: ${md} — ${txt}</span>`
      : "";
  const read = input.readingMinutes
    ? `<span class="mast-read">${input.readingMinutes} min read</span>`
    : "";
  return `<main id="content" tabindex="-1" class="article-wrap">
<article class="article-body">
<div class="sec mast">
<header>
<div class="byline">${bylineHtml(input)}</div>
<hr class="nav-rule">
<h1${titleFit(input.title)}>${esc(input.title)}</h1>
<hr class="nav-rule mast-tools-rule">
<p class="mast-tools">${read}<label class="mast-toc" for="toc-toggle"><span class="nav-sep" aria-hidden="true">—</span> Contents</label>${copy}</p>
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
  /** Author archive; the name stays plain text without one. */
  authorHref?: string;
  /** Tag archive; falls back to a plain label. */
  categoryHref?: string;
  /** Month archive; falls back to a plain date. */
  monthHref?: string;
}

export interface Pager {
  page: number;
  pages: number;
  prevHref?: string;
  nextHref?: string;
}

/** Newer/older links plus position, so a long section is walkable without JS. */
export function pagerHtml(pager?: Pager): string {
  if (!pager || pager.pages < 2) return "";
  const prev = pager.prevHref
    ? `<a class="pager-prev" rel="prev" href="${esc(pager.prevHref)}">← Newer</a>`
    : `<span class="pager-prev"></span>`;
  const next = pager.nextHref
    ? `<a class="pager-next" rel="next" href="${esc(pager.nextHref)}">Older →</a>`
    : `<span class="pager-next"></span>`;
  return `<nav class="sec pager" aria-label="Pagination">
${prev}
<span class="pager-at">Page ${pager.page} of ${pager.pages}</span>
${next}
</nav>`;
}

/**
 * The masthead of a listing or a term directory: one line that says what
 * the page lists, which the page script keeps current with the search.
 */
function listMast(h1: string): string {
  return `<div class="sec mast index-mast list-mast">
<header>
${h1}
</header>
</div>`;
}

/** One listing card. The search index carries the same markup, so a card
 * found by search is the card its own page would show. */
export function cardHtml(p: IndexCard): string {
  const img = p.imageUrl
    ? `<a class="card-thumb" href="${esc(p.url)}" aria-label="${esc(p.title)}"><span class="ht"><span class="ht-map"><img src="${esc(p.imageUrl)}" alt="" loading="lazy"><span class="ht-ink" aria-hidden="true"></span></span></span></a>`
    : "";
  const author = p.author
    ? p.authorHref
      ? `<a class="author" href="${esc(p.authorHref)}">${esc(p.author)}</a>`
      : `<span class="author">${esc(p.author)}</span>`
    : `<span class="author"></span>`;
  const category = p.categoryHref
    ? `<a class="byline-cat" href="${esc(p.categoryHref)}">${esc(p.category)}</a>`
    : `<span class="byline-cat">${esc(p.category)}</span>`;
  const row =
    img || p.excerpt
      ? `<div class="card-row">
${img}
${p.excerpt ? `<p class="card-ex">${esc(p.excerpt)}</p>` : ""}
</div>`
      : "";
  return `<article class="sec post-card" data-title="${esc(p.title)}" data-excerpt="${esc(p.excerpt)}" data-cat="${esc(p.category)}" data-author="${esc(p.author ?? "")}">
<a class="card-hit" href="${esc(p.url)}" tabindex="-1" aria-hidden="true"></a>
<header>
<p class="card-meta">${datedHtml(p.date, bylineDate(p.date), p.monthHref, "byline-date")}${author}</p>
<hr class="nav-rule">
<h2><a href="${esc(p.url)}">${esc(p.title)}</a></h2>
</header>
${row}
<p class="card-foot">${category}<a class="card-more" href="${esc(p.url)}" aria-label="Read more: ${esc(p.title)}">Read more</a></p>
</article>`;
}

export function indexMain(
  posts: IndexCard[],
  pager?: Pager,
  filter?: {
    tag?: string;
    author?: string;
    month?: string;
    section?: string;
    /** The listing's search index, so search covers every page of it. */
    index?: string;
  },
): string {
  const tag = filter?.tag ?? "";
  const authorF = filter?.author ?? "";
  const month = filter?.month ?? "";
  const section = filter?.section ?? "";
  const surface = section ? `${section} posts` : "posts";
  const heading = `Showing all ${surface}${tag ? ` tagged ${tag}` : ""}${authorF ? ` by ${authorF}` : ""}${month ? ` from ${month}` : ""}`;
  const filterAttrs = `${tag ? ` data-tag="${esc(tag)}"` : ""}${authorF ? ` data-author="${esc(authorF)}"` : ""}${month ? ` data-month="${esc(month)}"` : ""}${section ? ` data-section="${esc(section)}"` : ""}${filter?.index ? ` data-index="${esc(filter.index)}"` : ""}`;
  const cards = posts.map(cardHtml).join("\n");
  return `<main id="content" tabindex="-1" class="article-wrap">
<article class="article-body">
${listMast(`<h1${filterAttrs}>${heading}</h1>`)}
<div class="article-rest">
<p class="sec list-empty" role="status" hidden><span class="list-empty-text">No posts match.</span> <button type="button" class="list-clear">Clear search</button></p>
${cards || '<section class="sec"><p>No posts published yet.</p></section>'}
${pagerHtml(pager)}
</div>
</article>
</main>`;
}

/** Directory of taxonomy terms with post counts. */
export function termIndexMain(
  noun: string,
  terms: { label: string; href: string; count: number }[],
): string {
  const rows = terms
    .map(
      (t) =>
        `<li><a href="${esc(t.href)}">${esc(t.label)}</a> <span class="term-count">${t.count}</span></li>`,
    )
    .join("\n");
  return `<main id="content" tabindex="-1" class="article-wrap">
<article class="article-body">
${listMast(`<h1>Showing all ${esc(noun.toLowerCase())}s</h1>`)}
<div class="article-rest">
<div class="sec">
<div class="prose">
${
  terms.length
    ? `<ul class="term-list">\n${rows}\n</ul>`
    : `<p>No ${noun.toLowerCase()}s yet.</p>`
}
</div>
</div>
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
    channel?: Channel;
    recent?: { title: string; url: string; date: string; monthHref?: string }[];
    /** The page script, so the head menu closes and returns focus here too. */
    bodyEnd?: string;
    /** The search box and the section links, as on every other page. */
    leftRail?: string;
    sectionNav?: string;
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
      `<li><a href="${esc(p.url)}">${esc(p.title)}</a> ${datedHtml(p.date, p.date.slice(0, 10), p.monthHref, "post-date")}</li>`,
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
    channel: input.channel,
    chrome,
    // The frame every other page has, so the head keeps its box on a phone.
    leftRail: input.leftRail ?? emptyRail(),
    sectionNav: input.sectionNav,
    bodyEnd: input.bodyEnd,
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
<li><a href="${esc(basePath || "/")}">${esc(section)} index</a></li>
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
