import { test } from "node:test";
import assert from "node:assert/strict";
import { htmlPage, articleHtml, adjacentHtml, citeBox, notFoundHtml, tocBox, indexMain, type Chrome } from "./page";
import { leftRail, filterBar } from "./nav";
// Cross-package source import: lockstep proof that baked output passes the auditor.
import { auditPage, auditArticleSemantics, auditIndexability } from "../../conformance/src/audit";
import { galleryHtml } from "./gallery";

const CHROME: Chrome = {
  stylesheet: "/blog/blog.css",
  header: `<header><nav><a href="/">RemiliaNET</a></nav></header>`,
  footer: `<footer><p>Remilia Corporation</p></footer>`,
};

const PAGE = htmlPage({
  title: "Vaults — Devblog",
  description: "How vaults work.",
  canonical: "https://www.remilia.net/blog/vaults",
  jsonld: [{ "@context": "https://schema.org", "@type": "BlogPosting", headline: "Vaults" }],
  chrome: CHROME,
  mainHtml: articleHtml({
    title: "Vaults",
    publishedAt: "2026-08-01T00:00:00Z",
    byline: "Remilia",
    canonical: "https://www.remilia.net/blog/vaults",
    bodyHtml: `<p>${"Vault mechanics explained at length. ".repeat(20)}</p>`,
  }),
});

test("page shell emits the fixed semantic structure", () => {
  assert.ok(PAGE.includes('<html lang="en">'));
  assert.ok(PAGE.includes('<main class="article-wrap">'));
  assert.ok(PAGE.includes('<article class="article-body">'));
  assert.ok(PAGE.includes('<time datetime="2026-08-01T00:00:00.000Z">08.01.26</time>'));
  assert.ok(PAGE.includes("<h1>Vaults</h1>"));
  assert.ok(PAGE.includes('<link rel="stylesheet" href="/blog/blog.css">'));
});

test("baked page passes the conformance page auditor", () => {
  assert.deepEqual(auditPage(PAGE, "https://www.remilia.net/blog/vaults"), []);
  assert.deepEqual(auditArticleSemantics(PAGE), []);
  assert.deepEqual(auditIndexability(PAGE, true), []);
});

test("404 page is noindex and points at sitemap and llms.txt", () => {
  const nf = notFoundHtml(CHROME, "/blog");
  assert.ok(nf.includes('content="noindex"'));
  assert.ok(nf.includes("/blog/sitemap.xml"));
  assert.ok(nf.includes("/llms.txt"));
});

test("article rails put ToC then cite on the left and post-nav on the right", () => {
  const html = htmlPage({
    title: "Vaults — Devblog",
    description: "How vaults work.",
    canonical: "https://www.remilia.net/blog/vaults",
    jsonld: [],
    chrome: CHROME,
    leftRail: `<div class="post-nav">nav</div>`,
    tocHtml: `<div class="toc">toc</div>`,
    citeHtml: citeBox({
      canonical: "https://www.remilia.net/blog/vaults",
      mdHref: "/blog/vaults.md",
      txtHref: "/blog/vaults.txt",
    }),
    mainHtml: articleHtml({
      title: "Vaults",
      publishedAt: "2026-08-01T00:00:00Z",
      canonical: "https://www.remilia.net/blog/vaults",
      bodyHtml: "<p>x</p>",
      mdHref: "/blog/vaults.md",
      txtHref: "/blog/vaults.txt",
    }),
  });
  const left = html.indexOf('class="left-rail"');
  const toc = html.indexOf('class="toc"');
  const cite = html.indexOf('class="cite-box"');
  const right = html.indexOf('class="right-rail"');
  const nav = html.indexOf('class="post-nav"');
  assert.ok(left >= 0 && toc > left && cite > toc && cite < right && nav > right);
  assert.ok(html.includes("Permalink:"));
  assert.ok(html.includes('class="nav-rule"'));
  assert.ok(html.includes("Copy:"));
  assert.ok(html.includes(">[MD]</button>"));
  assert.ok(html.includes(">[TXT]</button>"));
});

test("adjacent posts are older left and newer right", () => {
  const newest = adjacentHtml(
    [
      { title: "New", url: "/press/new", date: "2026-08-10T00:00:00Z" },
      { title: "Old", url: "/press/old", date: "2026-06-01T00:00:00Z" },
    ],
    "/press/new",
  );
  assert.ok(newest.includes("&lt;&lt; Previous Post"));
  assert.ok(newest.includes("All Posts &gt;&gt;"));
  assert.ok(newest.includes('href="/press/old"'));
  assert.ok(newest.includes('href="/press"'));
  assert.ok(!newest.includes("Next Post"));
  const oldest = adjacentHtml(
    [
      { title: "New", url: "/press/new", date: "2026-08-10T00:00:00Z" },
      { title: "Old", url: "/press/old", date: "2026-06-01T00:00:00Z" },
    ],
    "/press/old",
  );
  assert.ok(oldest.includes("Next Post &gt;&gt;"));
  assert.ok(oldest.includes('href="/press/new"'));
});

test("toc notes are a labeled row, not bold-only chips", () => {
  const html = tocBox(`<li>One</li>`, 2);
  assert.ok(html.includes("Notes: "));
  assert.ok(html.includes('href="#fn-1">[1]</a>'));
  assert.ok(html.includes('href="#fn-2">[2]</a>'));
});

test("post list meta is date emdash category", () => {
  const html = leftRail(
    [{ title: "A", url: "/press/a", date: "2026-08-10T00:00:00Z", category: "Feature", author: "Remilia" }],
    "Press",
    "/press",
  );
  assert.ok(html.includes(">08.10.26</time> — <span class=\"nav-cat\">Feature</span>"));
  assert.ok(html.includes(">All posts</button>"));
  assert.ok(!html.includes('id="post-author"'));
  assert.ok(html.includes('placeholder="Search"'));
  assert.ok(!html.includes("Showing all"));
  assert.ok(html.includes('aria-label="Previous page">&lt;&lt;</button>'));
});

test("theme picker includes a mobile disclosure", () => {
  const html = htmlPage({
    title: "Vaults — Devblog",
    description: "How vaults work.",
    canonical: "https://www.remilia.net/blog/vaults",
    jsonld: [],
    chrome: CHROME,
    leftRail: `<div class="post-nav">nav</div>`,
    mainHtml: articleHtml({
      title: "Vaults",
      publishedAt: "2026-08-01T00:00:00Z",
      bodyHtml: "<p>x</p>",
    }),
  });
  assert.ok(html.includes('id="theme-pop"'));
  assert.ok(html.includes('for="theme-pop"'));
});

test("index filter bar includes category and author dropdowns", () => {
  const html = filterBar([
    { title: "A", url: "/press/a", date: "2026-08-10T00:00:00Z", category: "Feature", author: "Remilia" },
  ]);
  assert.ok(html.includes('id="post-cat"'));
  assert.ok(html.includes(">All posts</button>"));
  assert.ok(html.includes('id="post-author"'));
  assert.ok(html.includes(">All authors</button>"));
  assert.ok(html.includes(">Remilia</button>"));
});

test("index cards put title under date/author, then caption, then category and read more", () => {
  const html = indexMain(
    [{
      title: "Vaults",
      url: "/press/vaults",
      date: "2026-08-01T00:00:00Z",
      category: "Feature",
      excerpt: "How vaults work.",
      imageUrl: "https://cdn/cover.jpg",
      author: "Remilia",
    }],
    "<p>tools</p>",
  );
  const card = html.indexOf('class="sec post-card"');
  const headerStart = html.indexOf("<header>", card);
  const headerEnd = html.indexOf("</header>", headerStart);
  const header = html.slice(headerStart, headerEnd);
  assert.ok(header.includes('class="author" href="?author=Remilia"'));
  assert.ok(header.includes("<h2>"));
  assert.ok(header.indexOf("card-meta") < header.indexOf("<h2>"));
  assert.ok(!header.includes("byline-cat"));
  const h2 = html.indexOf("<h2>", card);
  const row = html.indexOf('class="card-row"', card);
  const rule = html.indexOf('class="nav-rule"', card);
  const foot = html.indexOf('class="card-foot"', card);
  assert.ok(h2 >= 0 && row > h2 && rule > row && foot > rule);
  assert.ok(html.includes('class="byline-cat">Feature</span>'));
  assert.ok(html.includes('class="card-more" href="/press/vaults">Read more</a>'));
});

test("gallery renders figures with alt and a dialog lightbox", () => {
  const html = galleryHtml("FW26", [
    { url: "https://cdn/x-800.jpg", fullUrl: "https://cdn/x-2400.jpg", alt: "Look 1", credit: "A" },
  ]);
  assert.ok(html.includes('alt="Look 1"'));
  assert.ok(html.includes('href="https://cdn/x-2400.jpg"'));
  assert.ok(html.includes("<dialog"));
  assert.ok(html.includes("<figcaption>A</figcaption>"));
});
