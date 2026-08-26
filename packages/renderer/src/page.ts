import { esc } from "./html";

/**
 * The one HTML document shell every baked page uses. Semantic structure is
 * fixed here (lang, single title/description/canonical, landmarks); hosts
 * differ only through `chrome` (header/footer fragments + stylesheet href).
 *
 * Layout: left rail is site-head + ToC; right rail is theme + cite + post-nav;
 * `<main>` is the article (title stays in the center column).
 */
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
  /** The <main> element (from articleHtml / simpleMain). */
  mainHtml: string;
  /** Optional post-nav markup. Right rail on desktop. */
  leftRail?: string;
  /** Optional ToC box. Left rail on desktop; stacked under the article on mobile. */
  tocHtml?: string;
  /** Optional cite box (permalink / copy). Right rail, under theme. */
  citeHtml?: string;
  /** Optional scripts before </body> (e.g. the nav fuzzy filter). */
  bodyEnd?: string;
  /** Absolute (or site-root) image URL for Open Graph / Twitter cards. */
  ogImage?: string;
  chrome: Chrome;
  noindex?: boolean;
  lang?: string;
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

export function htmlPage(p: PageInput): string {
  const ld = p.jsonld
    .map((d) => `<script type="application/ld+json">${JSON.stringify(d)}</script>`)
    .join("\n");
  return `<!DOCTYPE html>
<html lang="${p.lang ?? "en"}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(p.title)}</title>
<meta name="description" content="${esc(p.description)}">
<link rel="canonical" href="${esc(p.canonical)}">
<meta property="og:title" content="${esc(p.title)}">
<meta property="og:description" content="${esc(p.description)}">
<meta property="og:url" content="${esc(p.canonical)}">
<meta property="og:type" content="article">
${p.ogImage ? `<meta property="og:image" content="${esc(p.ogImage)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${esc(p.ogImage)}">` : `<meta name="twitter:card" content="summary">`}
${p.noindex ? '<meta name="robots" content="noindex">\n' : ""}<link rel="stylesheet" href="${esc(p.chrome.stylesheet)}">
<script>(()=>{try{var d=document.documentElement;var h=localStorage.getItem("remilia-hue");var s=localStorage.getItem("remilia-scheme");var t=localStorage.getItem("remilia-dots");if(h){d.style.setProperty("--hue",h);d.setAttribute("data-hue",h)}if(s==="light"||s==="dark")d.setAttribute("data-scheme",s);if(t==="none"||t==="small"||t==="large")d.setAttribute("data-dots",t)}catch(e){}document.addEventListener("DOMContentLoaded",function(){try{var d=document.documentElement;var dark=document.getElementById("theme-dark");var s=localStorage.getItem("remilia-scheme");var h=localStorage.getItem("remilia-hue");var t=localStorage.getItem("remilia-dots");if(dark){dark.checked=s?s==="dark":matchMedia("(prefers-color-scheme: dark)").matches;dark.addEventListener("change",function(){var v=dark.checked?"dark":"light";d.setAttribute("data-scheme",v);localStorage.setItem("remilia-scheme",v)})}if(h){var r=document.getElementById("theme-hue-"+h);if(r)r.checked=true}document.querySelectorAll('input[name="theme-hue"]').forEach(function(el){el.addEventListener("change",function(){if(el.checked){d.style.setProperty("--hue",el.value);d.setAttribute("data-hue",el.value);localStorage.setItem("remilia-hue",el.value)}})});if(t){var r=document.getElementById("theme-dots-"+t);if(r)r.checked=true}document.querySelectorAll('input[name="theme-dots"]').forEach(function(el){el.addEventListener("change",function(){if(el.checked){d.setAttribute("data-dots",el.value);localStorage.setItem("remilia-dots",el.value)}})})}catch(e){}})})();</script>
${p.headExtra ?? ""}
${ld}
</head>
<body>
<div class="wm" aria-hidden="true">
<svg class="wm-field" xmlns="http://www.w3.org/2000/svg">
<defs>
<pattern id="wm-pat" patternUnits="userSpaceOnUse" width="var(--rose-period)" height="var(--rose-period)">
<image href="/press/emblem.svg" width="var(--rose-size)" height="var(--rose-size)" preserveAspectRatio="xMidYMid meet"/>
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
<div class="layout">
${p.leftRail
    ? `<div class="left-rail">
${p.chrome.header}
${p.tocHtml ?? ""}
</div>
<div class="right-rail">
${themeSelHtml()}
${p.citeHtml ?? ""}
${p.leftRail}
</div>`
    : p.chrome.header}
${p.mainHtml}
</div>
${p.chrome.footer}
${p.bodyEnd ?? ""}
</body>
</html>
`;
}

/**
 * Post: `<main class="article-wrap">` is the bordered `.article-body`.
 * Site-head + ToC sit in the left rail; theme + cite + post-nav in the
 * right. Title stays in the center mast. Notes sit in the right leftover (xl+).
 */
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
          (_, i) =>
            `<a class="toc-note" href="#fn-${i + 1}">[${i + 1}]</a>`,
        ).join(" ")}</p>`
      : "";
  return `<div class="toc">
<input type="checkbox" id="toc-toggle" class="disclosure">
<label for="toc-toggle" class="disclosure-label">Contents</label>
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
<p class="cite-url">Permalink: <a href="${esc(input.canonical)}">${esc(input.canonical)}</a></p>
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
  category?: string;
  categoryHref?: string;
  canonical?: string;
  bodyHtml: string;
  metaHtml?: string;
  mdHref?: string;
  txtHref?: string;
}): string {
  const date = new Date(input.publishedAt);
  const permalink = input.canonical
    ? `<a class="permalink" href="${esc(input.canonical)}">Permalink</a>`
    : `<span class="permalink"></span>`;
  const author = input.byline ? `<span class="author">${esc(input.byline)}</span>` : `<span class="author"></span>`;
  const meta = input.metaHtml ? `\n<div class="sec post-meta">${input.metaHtml}</div>` : "";
  const md = input.mdHref
    ? `<button type="button" class="copy-md" data-src="${esc(input.mdHref)}">[MD]</button>`
    : "";
  const txt = input.txtHref
    ? `<button type="button" class="copy-txt" data-src="${esc(input.txtHref)}">[TXT]</button>`
    : "";
  const copy = md && txt
    ? `<span class="nav-sep" aria-hidden="true">|</span> Copy: ${md} <span class="nav-sep" aria-hidden="true">|</span> ${txt}`
    : "";
  return `<main class="article-wrap">
<article class="article-body">
<div class="sec mast">
<header>
<p class="byline">${permalink}<time datetime="${date.toISOString()}">${bylineDate(input.publishedAt)}</time>${author}</p>
<hr class="nav-rule">
<h1>${esc(input.title)}</h1>
<hr class="nav-rule mast-tools-rule">
<p class="mast-tools"><label class="mast-toc" for="toc-toggle">Table of Contents</label>${copy}</p>
</header>
<hr class="nav-rule">
<div class="prose">
${input.bodyHtml}
</div>
</div>${meta}
</article>
</main>`;
}

/** Non-post pages (index, event, 404): bordered body, no ToC rail. */
export function simpleMain(innerHtml: string): string {
  return `<main class="article-wrap simple">
<article class="article-body">
${innerHtml}
</article>
</main>`;
}

/** Markdown 404 page body (agent-friendly: points at sitemap + llms.txt). */
export function notFoundHtml(chrome: Chrome, basePath: string): string {
  return htmlPage({
    title: "404 — Not found",
    description: "This page does not exist.",
    canonical: "about:blank",
    jsonld: [],
    noindex: true,
    chrome,
    mainHtml: simpleMain(`<h1>404 — Not found</h1>
<p>This page does not exist. Useful indexes:</p>
<ul>
<li><a href="${esc(basePath)}/sitemap.xml">sitemap.xml</a></li>
<li><a href="/llms.txt">llms.txt</a></li>
<li><a href="${esc(basePath)}">index</a></li>
</ul>`),
  });
}
