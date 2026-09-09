import { test } from "node:test";
import assert from "node:assert/strict";
import {
  htmlPage,
  articleHtml,
  adjacentHtml,
  citeBox,
  notFoundHtml,
  tocBox,
  indexMain,
  type Chrome,
} from "./page";
import { filterBar, leftRail } from "./nav";
import { breadcrumbs } from "@remilia/seo";

import {
  auditPage,
  auditArticleSemantics,
  auditDiscovery,
  auditIndexability,
} from "../../conformance/src/audit";
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
  channel: "dev-blog",
  publishedTime: "2026-08-01T00:00:00Z",
  modifiedTime: "2026-08-02T00:00:00Z",
  alternates: [
    {
      type: "text/markdown",
      title: "Vaults (Markdown)",
      href: "/blog/vaults.md",
    },
    {
      type: "text/plain",
      title: "Vaults (plain text)",
      href: "/blog/vaults.txt",
    },
  ],
  jsonld: [
    {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: "Vaults",
    },
    breadcrumbs("https://www.remilia.net/blog/vaults", [
      { name: "RemiliaNET", url: "https://www.remilia.net/" },
      { name: "Devblog", url: "https://www.remilia.net/blog" },
      { name: "Vaults", url: "https://www.remilia.net/blog/vaults" },
    ]),
  ],
  chrome: CHROME,
  mainHtml: articleHtml({
    title: "Vaults",
    publishedAt: "2026-08-01T00:00:00Z",
    byline: "Remilia",
    canonical: "https://www.remilia.net/blog/vaults",
    bodyHtml: `<p>${"Vault mechanics explained at length. ".repeat(20)}</p>`,
  }),
});

const POST = {
  title: "Vaults",
  url: "/press/vaults",
  date: "2026-08-01T00:00:00Z",
  category: "Feature",
  excerpt: "How vaults work.",
  author: "Remilia",
};

test("page shell emits the fixed semantic structure", () => {
  // The fixture is a dev-blog page, so it carries the net host's theme.
  assert.ok(
    PAGE.includes(
      '<html lang="en" dir="ltr" data-hue="255" data-dots="small" data-scheme="light">',
    ),
  );
  assert.ok(
    PAGE.includes('<main id="content" tabindex="-1" class="article-wrap">'),
  );
  assert.ok(PAGE.includes('<article class="article-body">'));
  assert.ok(
    PAGE.includes('<time datetime="2026-08-01T00:00:00.000Z">08.01.26</time>'),
  );
  assert.ok(PAGE.includes("<h1>Vaults</h1>"));
  assert.ok(PAGE.includes('<link rel="stylesheet" href="/blog/blog.css">'));
});

test("baked page passes the conformance page auditor", () => {
  assert.deepEqual(auditPage(PAGE, "https://www.remilia.net/blog/vaults"), []);
  assert.deepEqual(auditArticleSemantics(PAGE), []);
  assert.deepEqual(auditIndexability(PAGE, true), []);
  assert.deepEqual(auditDiscovery(PAGE, "dev-blog"), []);
});

test("post head carries article times and its own renditions", () => {
  assert.ok(
    PAGE.includes(
      '<meta property="article:published_time" content="2026-08-01T00:00:00Z">',
    ),
  );
  assert.ok(
    PAGE.includes(
      '<meta property="article:modified_time" content="2026-08-02T00:00:00Z">',
    ),
  );
  assert.ok(
    PAGE.includes(
      '<link rel="alternate" type="text/markdown" title="Vaults (Markdown)" href="/blog/vaults.md">',
    ),
  );
  assert.ok(
    PAGE.includes(
      '<link rel="alternate" type="text/plain" title="Vaults (plain text)" href="/blog/vaults.txt">',
    ),
  );
});

test("a page without a channel keeps the minimal head", () => {
  const bare = htmlPage({
    title: "Bare",
    description: "No host identity.",
    canonical: "https://www.remilia.net/blog/bare",
    jsonld: [],
    chrome: CHROME,
    mainHtml: "<main id=\"content\"><h1>Bare</h1></main>",
  });
  assert.ok(!bare.includes("og:site_name"));
  assert.ok(!bare.includes('rel="me"'));
  assert.ok(bare.includes('<meta name="robots" content="index, follow">'));
});

test("section 404 is noindex and offers a way back into the section", () => {
  const nf = notFoundHtml(CHROME, "/blog", {
    sectionTitle: "Devblog",
    recent: [
      { title: "Vaults", url: "/blog/vaults", date: "2026-08-01T00:00:00Z" },
      { title: "Rails", url: "/blog/rails", date: "2026-07-01T00:00:00Z" },
    ],
  });
  assert.ok(nf.includes('content="noindex"'));
  assert.ok(nf.includes('<a href="/blog/vaults">Vaults</a>'));
  assert.ok(nf.includes('<time datetime="2026-08-01T00:00:00Z">2026-08-01</time>'));
  assert.ok(nf.includes('<a href="/blog">Devblog index</a>'));
  assert.ok(nf.includes("/blog/rss.xml"));
  assert.ok(nf.includes("/blog/sitemap.xml"));
  assert.ok(nf.includes("/blog/llms.txt"));
});

test("section 404 without posts still routes somewhere useful", () => {
  const nf = notFoundHtml(CHROME, "/blog");
  assert.ok(!nf.includes("Latest in"));
  assert.ok(nf.includes('<a href="/blog">this section index</a>'));
  assert.ok(nf.includes("/blog/sitemap.xml"));
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
  assert.ok(
    left >= 0 && toc > left && cite > toc && cite < right && nav > right,
  );
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

test("index filter bar includes category and author dropdowns", () => {
  const html = filterBar([POST]);
  assert.ok(html.includes('id="post-cat"'));
  assert.ok(html.includes(">All posts</button>"));
  assert.ok(html.includes('id="post-author"'));
  assert.ok(html.includes(">All authors</button>"));
  assert.ok(html.includes(">Remilia</button>"));
  const index = indexMain([POST], "<p>tools</p>");
  const rail = leftRail([POST], "Press", "/press");
  assert.match(index, /Read more: Vaults/);
  assert.match(index, /08\.01\.26/);
  assert.match(rail, /placeholder="Search"/);
  assert.match(rail, /aria-label="Previous page"/);
});

test("gallery renders figures with alt and a dialog lightbox", () => {
  const html = galleryHtml("FW26", [
    {
      url: "https://cdn/x-800.jpg",
      fullUrl: "https://cdn/x-2400.jpg",
      alt: "Look 1",
      credit: "A",
    },
  ]);
  assert.ok(html.includes('alt="Look 1"'));
  assert.ok(html.includes('href="https://cdn/x-2400.jpg"'));
  assert.ok(html.includes("<dialog"));
  assert.ok(html.includes("<figcaption>A</figcaption>"));
});

test("JSON-LD cannot close its script element", () => {
  const html = htmlPage({
    title: "Safe",
    description: "Safe",
    canonical: "https://remilia.org/press/safe",
    jsonld: [
      {
        "@type": "BlogPosting",
        headline: "</script><script>alert(1)</script>",
      },
    ],
    mainHtml: "<main><h1>Safe</h1></main>",
    chrome: { stylesheet: "/style.css", header: "", footer: "" },
  });
  assert.ok(!html.includes("<script>alert(1)</script>"));
  const block = html.match(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/,
  )?.[1];
  assert.equal(
    JSON.parse(block!).headline,
    "</script><script>alert(1)</script>",
  );
});
