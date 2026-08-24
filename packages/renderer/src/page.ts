import { esc } from "./html";

/**
 * The one HTML document shell every baked page uses. Semantic structure is
 * fixed here (lang, single title/description/canonical, landmarks); hosts
 * differ only through `chrome` (header/footer fragments + stylesheet href).
 *
 * Layout: full-width header, then a `.layout` grid of an optional left rail
 * (post nav) + `<main>` (the article-wrap the caller supplies), then footer.
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
  /** Optional left rail markup (post nav). Sticky column on desktop. */
  leftRail?: string;
  /** Optional scripts before </body> (e.g. the nav fuzzy filter). */
  bodyEnd?: string;
  chrome: Chrome;
  noindex?: boolean;
  lang?: string;
}

export function htmlPage(p: PageInput): string {
  const ld = p.jsonld
    .map((d) => `<script type="application/ld+json">${JSON.stringify(d)}</script>`)
    .join("\n");
  return `<!DOCTYPE html>
<html lang="${p.lang ?? "en"}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(p.title)}</title>
<meta name="description" content="${esc(p.description)}">
<link rel="canonical" href="${esc(p.canonical)}">
<meta property="og:title" content="${esc(p.title)}">
<meta property="og:description" content="${esc(p.description)}">
<meta property="og:url" content="${esc(p.canonical)}">
<meta property="og:type" content="article">
${p.noindex ? '<meta name="robots" content="noindex">\n' : ""}<link rel="stylesheet" href="${esc(p.chrome.stylesheet)}">
${p.headExtra ?? ""}
${ld}
</head>
<body>
${p.chrome.header}
<div class="layout">
${p.leftRail ?? ""}
${p.mainHtml}
</div>
${p.chrome.footer}
${p.bodyEnd ?? ""}
</body>
</html>
`;
}

/**
 * Post: `<main class="article-wrap">` = the ToC rail (right on desktop, a
 * closed dropdown at the top on mobile) + the bordered `.article-body`.
 * Sidenotes float into the body's right gutter at the citation line.
 */
export function articleHtml(input: {
  title: string;
  publishedAt: string;
  byline?: string;
  bodyHtml: string;
  metaHtml?: string;
  /** ToC <li> items from tocItems(); empty string = no ToC. */
  tocItems?: string;
}): string {
  const date = new Date(input.publishedAt);
  const shown = date.toISOString().slice(0, 10);
  const byline = input.byline ? `<address>${esc(input.byline)}</address>` : "";
  const meta = input.metaHtml ? `\n<div class="post-meta">${input.metaHtml}</div>` : "";
  const toc = input.tocItems
    ? `<div class="toc">
<input type="checkbox" id="toc-toggle" class="disclosure">
<label for="toc-toggle" class="disclosure-label">Contents</label>
<nav aria-label="Contents" role="doc-toc"><ol>
${input.tocItems}
</ol></nav>
</div>`
    : "";
  return `<main class="article-wrap">
${toc}
<article class="article-body">
<header>
<h1>${esc(input.title)}</h1>
<p><time datetime="${date.toISOString()}">${shown}</time>${byline}</p>
</header>
<div class="prose">
${input.bodyHtml}
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
