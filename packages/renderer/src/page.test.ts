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
  cardHtml,
  termIndexMain,
  type Chrome,
  titleEm,
} from "./page";
import { authorSel, dateSel, leftRail, sectionNav } from "./nav";
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
      '<html lang="en" dir="ltr" data-hue="255" data-dots="large" data-scheme="light">',
    ),
  );
  assert.ok(
    PAGE.includes('<main id="content" tabindex="-1" class="article-wrap">'),
  );
  assert.ok(PAGE.includes('<article class="article-body">'));
  assert.ok(
    PAGE.includes('<time datetime="2026-08-01T00:00:00.000Z">08.01.26</time>'),
  );
  // A short title fits at display size and takes no sizing class.
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
  // The head sits in the left rail, where it is boxed at every width.
  assert.ok(nf.includes(`<div class="left-rail">\n${CHROME.header}`));
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

test("article rails put the sections, read info and ToC on the left; the theme and search on the right", () => {
  const html = htmlPage({
    title: "Vaults — Devblog",
    description: "How vaults work.",
    canonical: "https://www.remilia.net/blog/vaults",
    jsonld: [],
    chrome: CHROME,
    leftRail: `<div class="post-nav">nav</div>`,
    sectionNav: sectionNav(SECTIONS),
    tocHtml: `<div class="toc">toc</div>`,
    readHtml: citeBox({
      canonical: "https://www.remilia.net/blog/vaults",
      mdHref: "/blog/vaults.md",
      txtHref: "/blog/vaults.txt",
      minutes: 3,
      words: 612,
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
  // The left rail holds the section links, the read info, then the
  // contents; the right rail holds the theme box, then the search box.
  const left = html.indexOf('class="left-rail"');
  const secs = html.indexOf('class="sec-box"');
  const toc = html.indexOf('class="toc"');
  const right = html.indexOf('class="right-rail"');
  const theme = html.indexOf('class="theme-sel"');
  const cite = html.indexOf('class="cite-box"');
  const nav = html.indexOf('class="post-nav"');
  assert.ok(
    left >= 0 && secs > left && cite > secs && toc > cite && right > toc && theme > right && nav > theme,
  );
  assert.ok(html.includes("3 min read — 612 words"));
  assert.ok(html.includes('class="nav-rule"'));
  assert.ok(html.includes("Copy:"));
  assert.ok(html.includes("[URL]"));
  assert.ok(html.includes(">[MD]</button>"));
  assert.ok(html.includes(">[TXT]</button>"));
});

test("a title's one-line width grows with its length and counts unknown glyphs wide", () => {
  assert.ok(titleEm("Vaults") < titleEm("Vaults and Rails"));
  // Set in capitals, so case does not change the width.
  assert.equal(titleEm("vaults"), titleEm("VAULTS"));
  // I is the narrowest capital and W the widest; a glyph with no entry is a full em.
  assert.ok(titleEm("I") < titleEm("W") && titleEm("W") < titleEm("\u4e00"));
});

test("a long title is classed by its width in whole ems, up to the size where it wraps", () => {
  const h1 = (title: string) =>
    /<h1[^>]*>/.exec(articleHtml({ title, publishedAt: "2026-08-01T00:00:00Z", bodyHtml: "" }))?.[0];
  assert.equal(h1("Vaults"), "<h1>");
  const long = "KALI/ACC Basilisk: A Survival Horror Eschatology";
  assert.equal(h1(long), `<h1 class="title-fit-${Math.ceil(titleEm(long))}">`);
  assert.equal(h1(long.repeat(3)), '<h1 class="title-fit-41">');
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

test("a post with notes and no headings gets a contents box with the note row alone", () => {
  const html = tocBox(undefined, 3);
  assert.ok(html.includes('<div class="toc">'));
  assert.ok(html.includes('href="#fn-3">[3]</a>'));
  assert.ok(!html.includes("<ol>"));
  assert.equal(tocBox(undefined, 0), "");
  assert.equal(tocBox("", 0), "");
});

test("toc notes are a labeled row, not bold-only chips", () => {
  const html = tocBox(`<li>One</li>`, 2);
  assert.ok(html.includes("Notes: "));
  assert.ok(html.includes('href="#fn-1">[1]</a>'));
  assert.ok(html.includes('href="#fn-2">[2]</a>'));
});

const SECTIONS = {
  cats: [
    { label: "Updates", href: "/blog/updates" },
    { label: "Press", href: "/blog/press" },
    { label: "Thought", href: "/blog/thought" },
  ],
  current: "Press",
  allHref: "/blog",
};

test("the section row links every section, All first, and marks the one shown", () => {
  const row = sectionNav(SECTIONS);
  assert.match(row, /^<nav class="sec-nav" aria-label="Sections">/);
  assert.deepEqual(
    [...row.matchAll(/<a href="([^"]+)"( aria-current="true")?>([^<]+)<\/a>/g)].map((m) => [m[1], m[3], Boolean(m[2])]),
    [
      ["/blog", "All", false],
      ["/blog/updates", "Updates", false],
      ["/blog/press", "Press", true],
      ["/blog/thought", "Thought", false],
    ],
  );
  // The pooled index marks All.
  assert.match(sectionNav({ ...SECTIONS, current: "" }), /<a href="\/blog" aria-current="true">All<\/a>/);
  // A host with one section and no pooled index has nothing to switch to.
  assert.equal(sectionNav({ cats: [{ label: "News", href: "/a/blog/news" }], current: "News" }), "");
});

test("a post's masthead holds the byline and the title; the author control shares the search's line", () => {
  const html = articleHtml({
    title: "Vaults",
    publishedAt: "2026-08-01T00:00:00Z",
    byline: "Remilia",
    category: "Press",
    categoryHref: "/blog/press",
    bodyHtml: "<p>body</p>",
  });
  assert.match(html, /<div class="sec mast">\n<header>\n<div class="byline">[\s\S]*<\/header>\n<\/div>/);
  assert.equal(html.includes("sec-nav"), false);
  assert.match(html, /<div class="byline">[\s\S]*<a class="byline-cat" href="\/blog\/press">Press<\/a>[\s\S]*class="author"/);
  assert.equal(html.includes("<details"), false);
  const rail = leftRail([], "", "/blog/press", undefined, SECTIONS, authorSel(AUTHORS, "/blog/press"));
  assert.match(
    rail,
    /<div class="nav-box">\n\n<div class="nav-page">\n<form class="nav-search"[\s\S]*<\/form>\n<details class="sel nav-cat-sel" id="post-author"[\s\S]*<\/details>\n<\/div>\n<hr class="nav-rule">\n<ul class="nav-all">/,
  );
  assert.equal(rail.includes("sec-nav"), false);
});

test("a post names its bylines as the page author; other pages name the host", () => {
  const page = (author?: string) =>
    htmlPage({
      title: "Four Notes",
      description: "d",
      canonical: "https://remilia.org/blog/thought/four-notes",
      channel: "thought",
      author,
      jsonld: [],
      chrome: CHROME,
      mainHtml: "<main id=\"content\"><h1>Four Notes</h1></main>",
    });
  assert.ok(page("paultristis").includes('<meta name="author" content="paultristis">'));
  assert.ok(page("A, B").includes('<meta name="author" content="A, B">'));
  for (const none of [undefined, "", "  "])
    assert.ok(page(none).includes('<meta name="author" content="Remigumi-guchi Digital, LLC">'));
});

const AUTHORS = [
  { label: "Charlotte Fang", href: "/blog/press/authors/charlotte-fang" },
  { label: "minds0n", href: "/blog/authors/minds0n" },
];

test("the author dropdown opens each author's archive", () => {
  const html = authorSel(AUTHORS, "/blog/press");
  assert.match(html, /^<details class="sel nav-cat-sel" id="post-author" data-value="" aria-label="Author">/);
  assert.match(html, /<span class="sel-label">All authors<\/span>/);
  assert.deepEqual(
    [...html.matchAll(/data-href="([^"]+)"[^>]*>([^<]+)</g)].map((m) => [m[1], m[2]]),
    [
      ["/blog/press", "All authors"],
      ["/blog/press/authors/charlotte-fang", "Charlotte Fang"],
      ["/blog/authors/minds0n", "minds0n"],
    ],
  );
  // On an author's archive it names them and marks their option.
  const on = authorSel(AUTHORS, "/blog/press", "minds0n");
  assert.match(on, /data-value="minds0n" aria-label="Author">\n<summary><span class="sel-label">minds0n<\/span>/);
  assert.ok(on.includes('data-value="minds0n" data-href="/blog/authors/minds0n" aria-current="page">minds0n</button>'));
  assert.equal((on.match(/aria-current/g) ?? []).length, 1);
  // No archives, no control.
  assert.equal(authorSel([], "/blog/press"), "");
});

test("index listings carry the status line and cards", () => {
  const index = indexMain([POST]);
  const rail = leftRail([POST], "Press", "/press");
  assert.match(index, /Read more: Vaults/);
  assert.match(index, /08\.01\.26/);
  assert.match(index, />Showing all posts</);
  const thought = indexMain([POST], undefined, {
    section: "Thought",
    tag: "Essay",
  });
  assert.match(thought, />Showing all Thought posts tagged Essay</);
  assert.match(thought, /data-section="Thought"/);
  assert.match(index, /data-excerpt="How vaults work."/);
  assert.match(rail, /placeholder="Search"/);
  assert.match(rail, /aria-label="Previous page"/);
});

test("index card stretches its link from an overlay the keyboard skips", () => {
  const html = indexMain([POST]);
  assert.match(
    html,
    /<article class="sec post-card"[^>]*>\n<a class="card-hit" href="\/press\/vaults" tabindex="-1" aria-hidden="true"><\/a>\n<header>/,
  );
  assert.match(html, /<h2><a href="\/press\/vaults">Vaults<\/a><\/h2>/);
});

test("post dates link to their month archive, keeping the time element", () => {
  const month = "/press/months/2026-08";
  const card = indexMain([{ ...POST, monthHref: month }]);
  assert.ok(
    card.includes(
      `<p class="card-meta"><a class="byline-date" href="${month}"><time datetime="2026-08-01T00:00:00Z">08.01.26</time></a>`,
    ),
  );
  const rail = leftRail([{ ...POST, monthHref: month }], "Press", "/press");
  assert.ok(
    rail.includes(
      `<span class="nav-meta"><a class="nav-date" href="${month}"><time datetime="2026-08-01T00:00:00Z">08.01.26</time></a> — `,
    ),
  );
  const article = articleHtml({
    title: "Vaults",
    publishedAt: "2026-08-01T00:00:00Z",
    monthHref: month,
    bodyHtml: "<p>x</p>",
  });
  assert.ok(
    article.includes(
      `<div class="byline"><a class="byline-date" href="${month}"><time datetime="2026-08-01T00:00:00.000Z">08.01.26</time></a>`,
    ),
  );
  const nf = notFoundHtml(CHROME, "/press", {
    recent: [{ title: "Vaults", url: "/press/vaults", date: POST.date, monthHref: month }],
  });
  assert.ok(
    nf.includes(
      `<a class="post-date" href="${month}"><time datetime="2026-08-01T00:00:00Z">2026-08-01</time></a>`,
    ),
  );
  // Without an archive the date stays a plain time.
  assert.ok(indexMain([POST]).includes('<p class="card-meta"><time datetime='));
});

test("a listing's mast is its status line; the empty-search note waits above the cards", () => {
  const html = indexMain([POST]);
  assert.match(
    html,
    /<div class="sec mast index-mast list-mast">\n<header>\n<h1[^>]*>Showing all posts<\/h1>\n<\/header>\n<\/div>/,
  );
  assert.match(
    html,
    /<div class="article-rest">\n<p class="sec list-empty"[\s\S]*<\/p>\n<article class="sec post-card"/,
  );
  // Search, the author control, and the section links live in the rail's
  // box, not the column.
  assert.equal(html.includes("mast-tools"), false);
  assert.equal(html.includes('id="post-filter"'), false);
  assert.equal(html.includes("sec-nav"), false);
  assert.match(html, /<p class="sec list-empty" role="status" hidden>[\s\S]*<button type="button" class="list-clear">Clear search<\/button><\/p>/);
  assert.equal(html.includes("site-sec"), false);
  assert.equal(html.includes('class="byline"'), false);
  assert.equal(html.includes("index-tools"), false);
});

test("date dropdown is absent without month archives", () => {
  assert.equal(dateSel([], "/blog/press"), "");
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

test("a listing names its search index, and a card renders the same alone", () => {
  const html = indexMain([POST], undefined, { index: "/blog/updates/search.json" });
  assert.ok(html.includes(' data-index="/blog/updates/search.json">Showing all posts</h1>'));
  assert.ok(!indexMain([POST]).includes("data-index"));
  assert.ok(html.includes(cardHtml(POST)));
  assert.ok(cardHtml(POST).startsWith('<article class="sec post-card"'));
});

test("a term directory wears the listing mast, with its own line", () => {
  const html = termIndexMain("Tag", [{ label: "Theory", href: "/blog/tags/theory", count: 3 }]);
  const mast = (s: string) => s.slice(s.indexOf('<div class="sec mast'), s.indexOf('<div class="article-rest">'));
  assert.equal(
    mast(html),
    mast(indexMain([POST])).replace("Showing all posts", "Showing all tags"),
  );
  assert.equal(html.includes("mast-tools"), false);
});
