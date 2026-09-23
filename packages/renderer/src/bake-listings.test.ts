import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bake } from "./bake";
import { checkInternalLinks } from "./links";
import type { Chrome } from "./page";

const CHROME: Chrome = {
  stylesheet: "/blog/updates/blog.css",
  header: `<header class="site-head"><a class="site-title" href="/blog/updates">Updates</a></header>`,
  footer: `<footer><p>Remilia Corporation</p></footer>`,
};

const HOST = {
  title: "Remilia Corporation — Updates",
  description: "Company essays and memos.",
  lead: "Company essays.",
  whenToUse: ["Cite company essays."],
  citeElsewhere: [{ label: "wiki", url: "https://wiki.remilia.org/x" }],
};

/** 25 posts so pagination has to split, with two tags and two authors. */
const posts = Array.from({ length: 25 }, (_, i) => ({
  title: `Post ${i + 1}`,
  slug: `post-${i + 1}`,
  excerpt: `Excerpt ${i + 1}`,
  publishedAt: `2026-0${(i % 9) + 1}-01T00:00:00.000Z`,
  updatedAt: `2026-0${(i % 9) + 1}-02T00:00:00.000Z`,
  body: [
    {
      _type: "block",
      style: "normal",
      children: [{ _type: "span", text: `Body of post ${i + 1}. `.repeat(5) }],
    },
  ],
  authors: [{ name: i % 2 === 0 ? "Remilia Jackson" : "Charlotte Fang" }],
  tags: [i % 3 === 0 ? "Theory" : "Notes"],
}));

async function fixtureServer(
  served: unknown[] = posts,
): Promise<{ url: string; close: () => void }> {
  const server: Server = createServer((req, res) => {
    const query = decodeURIComponent(new URL(req.url ?? "/", "http://x").search);
    const body = query.includes('_id == "org"')
      ? { result: { name: "Remigumi-guchi Digital, LLC" } }
      : query.includes("count(")
        ? { result: served.length }
        : { result: served };
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => server.close(),
  };
}

/** Host-level files a section links to but does not own — including the
 * shared index and sibling sections the category nav points at. */
async function hostStubs(outDir: string): Promise<void> {
  await mkdir(join(outDir, "assets"), { recursive: true });
  for (const dir of ["blog", "blog/press", "blog/thought", "blog/archive"])
    await mkdir(join(outDir, dir), { recursive: true });
  for (const file of [
    "assets/emblem.svg",
    "assets/logo.png",
    "assets/apple-touch-icon.png",
    "assets/og.png",
    "favicon.ico",
    "site.webmanifest",
    "index.html",
    "llms.txt",
    "llms-full.txt",
    "blog/index.html",
    "blog/press/index.html",
    "blog/thought/index.html",
    "blog/archive/index.html",
  ])
    await writeFile(join(outDir, file), "stub");
}

async function bakeUpdates(outDir: string, apiHost: string): Promise<void> {
  await bake({
    channel: "updates",
    chrome: CHROME,
    host: HOST,
    outDir,
    projectId: "test",
    dataset: "production",
    token: "sk-test",
    apiHost,
    stylesheets: [],
  });
}

test("a section bakes paginated listings, taxonomy archives and resolvable links", async () => {
  const fixture = await fixtureServer();
  const outDir = await mkdtemp(join(tmpdir(), "bake-listings-"));
  try {
    await hostStubs(outDir);
    await bakeUpdates(outDir, fixture.url);
    const page1 = await readFile(join(outDir, "blog/updates/index.html"), "utf8");
    const page2 = await readFile(
      join(outDir, "blog/updates/page/2/index.html"),
      "utf8",
    );

    // 25 posts at 20 per page: two pages, 20 then 5.
    assert.equal((page1.match(/class="sec post-card"/g) ?? []).length, 20);
    assert.equal((page2.match(/class="sec post-card"/g) ?? []).length, 5);
    assert.ok(page1.includes('rel="next" href="/blog/updates/page/2"'));
    assert.ok(page1.includes("Page 1 of 2"));
    assert.ok(page2.includes('rel="prev" href="/blog/updates"'));
    assert.ok(
      page2.includes(
        '<link rel="canonical" href="https://remilia.org/blog/updates/page/2">',
      ),
    );
    assert.ok(
      page1.includes('<link rel="next" href="https://remilia.org/blog/updates/page/2">'),
      "page 1 must declare rel=next in the head",
    );

    // Tag archives: Theory holds every third post, Notes the rest.
    const theory = await readFile(
      join(outDir, "blog/updates/tags/theory/index.html"),
      "utf8",
    );
    assert.equal((theory.match(/class="sec post-card"/g) ?? []).length, 9);
    assert.ok(theory.includes("Theory — Remilia Corporation — Updates"));
    const tagFeed = await readFile(
      join(outDir, "blog/updates/tags/theory/rss.xml"),
      "utf8",
    );
    assert.equal((tagFeed.match(/<item>/g) ?? []).length, 9);

    const tagDir = await readFile(join(outDir, "blog/updates/tags/index.html"), "utf8");
    assert.ok(tagDir.includes('href="/blog/updates/tags/theory"'));
    assert.ok(tagDir.includes('<span class="term-count">9</span>'));

    // Author archives split the same posts by byline.
    const author = await readFile(
      join(outDir, "blog/updates/authors/remilia-jackson/index.html"),
      "utf8",
    );
    assert.equal((author.match(/class="sec post-card"/g) ?? []).length, 13);
    const authorDir = await readFile(
      join(outDir, "blog/updates/authors/index.html"),
      "utf8",
    );
    assert.ok(authorDir.includes('href="/blog/updates/authors/charlotte-fang"'));

    // The date dropdown rides every page of the index, but a tag or author
    // archive would lose its filter to a month pick, so it has none.
    for (const page of [page1, page2]) {
      assert.ok(page.includes('id="post-date" data-value=""'));
      assert.ok(page.includes('data-href="/blog/updates/months/2026-09">September 2026</button>'));
    }
    for (const page of [theory, author, tagDir, authorDir])
      assert.equal(page.includes('id="post-date"'), false);

    // A post's byline points at its section index and author archive.
    const post = await readFile(
      join(outDir, "blog/updates/post-1/index.html"),
      "utf8",
    );
    assert.ok(post.includes('id="site-sec"'));
    assert.ok(post.includes('data-href="/blog/updates"'));
    assert.ok(post.includes('href="/blog/updates/authors/remilia-jackson"'));

    // Every listing is in the sitemap.
    const sitemap = await readFile(join(outDir, "blog/updates/sitemap.xml"), "utf8");
    for (const loc of [
      "https://remilia.org/blog/updates/page/2",
      "https://remilia.org/blog/updates/tags/theory",
      "https://remilia.org/blog/updates/tags",
      "https://remilia.org/blog/updates/authors/charlotte-fang",
    ])
      assert.ok(sitemap.includes(`<loc>${loc}</loc>`), `sitemap missing ${loc}`);

    // Nothing the bake wrote links into nowhere.
    const broken = await checkInternalLinks(outDir, ["https://remilia.org"]);
    assert.deepEqual(broken, []);

    const written = await readdir(join(outDir, "blog", "updates"));
    assert.ok(written.includes("tags"));
    assert.ok(written.includes("authors"));
    assert.ok(written.includes("page"));
  } finally {
    fixture.close();
  }
});

test("a section bakes a paginated archive and a directory for each month", async () => {
  // 22 posts in December (two pages), 3 in November, 2 in September —
  // newest first, as the posts query returns them.
  const dates = [
    ...Array.from({ length: 22 }, (_, i) => `2024-12-${String(22 - i).padStart(2, "0")}T12:00:00.000Z`),
    "2024-11-30T23:30:00.000Z",
    "2024-11-15T12:00:00.000Z",
    "2024-11-01T00:00:00.000Z",
    "2024-09-20T12:00:00.000Z",
    "2024-09-02T12:00:00.000Z",
  ];
  const monthly = dates.map((publishedAt, i) => ({
    ...posts[0],
    title: `Dated ${i + 1}`,
    slug: `dated-${i + 1}`,
    publishedAt,
    updatedAt: publishedAt,
  }));
  const fixture = await fixtureServer(monthly);
  const outDir = await mkdtemp(join(tmpdir(), "bake-months-"));
  try {
    await hostStubs(outDir);
    await bakeUpdates(outDir, fixture.url);
    const read = (path: string) => readFile(join(outDir, path), "utf8");
    const cards = (html: string) =>
      (html.match(/class="sec post-card"/g) ?? []).length;

    const dec1 = await read("blog/updates/months/2024-12/index.html");
    const dec2 = await read("blog/updates/months/2024-12/page/2/index.html");
    assert.equal(cards(dec1), 20);
    assert.equal(cards(dec2), 2);
    assert.ok(dec1.includes("Page 1 of 2"));
    assert.ok(
      dec1.includes(
        '<link rel="next" href="https://remilia.org/blog/updates/months/2024-12/page/2">',
      ),
    );
    assert.ok(
      dec2.includes(
        '<link rel="prev" href="https://remilia.org/blog/updates/months/2024-12">',
      ),
    );
    assert.ok(
      dec1.includes(
        '<h1 data-month="December 2024" data-section="Updates">Showing all Updates posts from December 2024</h1>',
      ),
    );
    assert.ok(dec1.includes("<title>December 2024 — Remilia Corporation — Updates</title>"));
    // The date dropdown names the month shown, on each of its pages.
    for (const page of [dec1, dec2]) {
      assert.ok(page.includes('id="post-date" data-value="2024-12"'));
      assert.ok(page.includes('<span class="sel-label">December 2024</span>'));
      assert.ok(
        page.includes(
          'data-value="2024-12" data-href="/blog/updates/months/2024-12" aria-current="page">December 2024</button>',
        ),
      );
    }

    const nov = await read("blog/updates/months/2024-11/index.html");
    assert.equal(cards(nov), 3, "months are UTC calendar months");
    assert.ok(nov.includes("Showing all Updates posts from November 2024"));
    assert.equal(cards(await read("blog/updates/months/2024-09/index.html")), 2);
    // No October posts, no October page; a closed month carries no feed.
    const months = await readdir(join(outDir, "blog/updates/months"));
    assert.deepEqual(months.sort(), ["2024-09", "2024-11", "2024-12", "index.html"]);
    assert.ok(!(await readdir(join(outDir, "blog/updates/months/2024-12"))).includes("rss.xml"));

    // The directory lists months newest first with their post counts.
    const dir = await read("blog/updates/months/index.html");
    assert.ok(dir.includes("Showing all months"));
    const rows = [...dir.matchAll(/<li><a href="([^"]+)">([^<]+)<\/a> <span class="term-count">(\d+)<\/span><\/li>/g)]
      .map((m) => [m[1], m[2], m[3]]);
    assert.deepEqual(rows, [
      ["/blog/updates/months/2024-12", "December 2024", "22"],
      ["/blog/updates/months/2024-11", "November 2024", "3"],
      ["/blog/updates/months/2024-09", "September 2024", "2"],
    ]);

    const sitemap = await read("blog/updates/sitemap.xml");
    for (const loc of [
      "https://remilia.org/blog/updates/months",
      "https://remilia.org/blog/updates/months/2024-12",
      "https://remilia.org/blog/updates/months/2024-12/page/2",
      "https://remilia.org/blog/updates/months/2024-11",
      "https://remilia.org/blog/updates/months/2024-09",
    ])
      assert.ok(sitemap.includes(`<loc>${loc}</loc>`), `sitemap missing ${loc}`);

    // Card, byline and rail dates link to the month archive.
    assert.ok(dec1.includes('<a class="byline-date" href="/blog/updates/months/2024-12">'));
    const post = await read("blog/updates/dated-23/index.html");
    assert.ok(
      post.includes('<div class="byline"><a class="byline-date" href="/blog/updates/months/2024-11">'),
    );
    assert.ok(post.includes('<a class="nav-date" href="/blog/updates/months/2024-09">'));
    assert.ok(!post.includes("?month="));

    assert.deepEqual(await checkInternalLinks(outDir, ["https://remilia.org"]), []);
  } finally {
    fixture.close();
  }
});

test("the pooled index bakes month archives across every section", async () => {
  // December spans two sections and two pages, as June 2022 spans two
  // sections; a hidden post makes no month on its own.
  const at = (day: number, month = "2024-12") =>
    `${month}-${String(day).padStart(2, "0")}T12:00:00.000Z`;
  const dated = (section: string, n: number, publishedAt: string, extra = {}) => ({
    ...posts[0],
    title: `${section} ${n}`,
    slug: `${section}-${n}`,
    publishedAt,
    updatedAt: publishedAt,
    ...extra,
  });
  const bySection: Record<string, unknown[]> = {
    updates: [
      ...Array.from({ length: 12 }, (_, i) => dated("updates", i + 1, at(28 - i))),
      dated("updates", 13, at(10, "2024-04")),
    ],
    press: [
      ...Array.from({ length: 10 }, (_, i) => dated("press", i + 1, at(15 - i))),
      dated("press", 11, at(5, "2023-11")),
    ],
    thought: [dated("thought", 1, at(9, "2022-06"))],
    archive: [
      dated("archive", 1, at(20, "2022-06")),
      dated("archive", 2, at(1, "2021-01"), { noIndex: true }),
    ],
  };
  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    const query = url.searchParams.get("query") ?? "";
    const channel = JSON.parse(url.searchParams.get("$channel") ?? '""') as string;
    const body = query.includes('_id == "org"')
      ? { result: { name: "Remigumi-guchi Digital, LLC" } }
      : { result: bySection[channel] ?? [] };
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const apiHost = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
  const outDir = await mkdtemp(join(tmpdir(), "bake-pooled-months-"));
  const sections = ["updates", "press", "thought", "archive"] as const;
  const common = {
    chrome: CHROME,
    host: HOST,
    outDir,
    projectId: "test",
    dataset: "production",
    token: "sk-test",
    apiHost,
    stylesheets: [],
  };
  try {
    await hostStubs(outDir);
    for (const channel of sections) await bake({ ...common, channel });
    await bake({
      ...common,
      channel: "blog",
      host: { ...HOST, title: "Remilia Corporation — Blog" },
      aggregateOf: [...sections],
    });
    const read = (path: string) => readFile(join(outDir, path), "utf8");
    const cards = (html: string) =>
      (html.match(/class="sec post-card"/g) ?? []).length;

    // December pools both sections, newest first, over two pages.
    const dec1 = await read("blog/months/2024-12/index.html");
    const dec2 = await read("blog/months/2024-12/page/2/index.html");
    assert.equal(cards(dec1), 20);
    assert.equal(cards(dec2), 2);
    assert.ok(
      dec1.includes(
        '<h1 data-month="December 2024">Showing all posts from December 2024</h1>',
      ),
    );
    assert.ok(dec1.includes("<title>December 2024 — Remilia Corporation — Blog</title>"));
    assert.ok(dec1.includes('href="/blog/updates/updates-1"'));
    assert.ok(dec1.includes('href="/blog/press/press-1"'));
    assert.ok(
      dec1.indexOf("/blog/updates/updates-1") < dec1.indexOf("/blog/press/press-1"),
      "pooled months keep newest-first order across sections",
    );
    assert.ok(
      dec1.includes(
        '<link rel="next" href="https://remilia.org/blog/months/2024-12/page/2">',
      ),
    );
    assert.equal(cards(await read("blog/months/2024-04/index.html")), 1);
    assert.equal(cards(await read("blog/months/2023-11/index.html")), 1);
    assert.equal(cards(await read("blog/months/2022-06/index.html")), 2);

    // Only months holding an indexable post; no feeds; no tag or author
    // archives on the pooled index.
    const months = await readdir(join(outDir, "blog/months"));
    assert.deepEqual(months.sort(), [
      "2022-06",
      "2023-11",
      "2024-04",
      "2024-12",
      "index.html",
    ]);
    assert.ok(!(await readdir(join(outDir, "blog/months/2024-12"))).includes("rss.xml"));
    const pooledRoot = await readdir(join(outDir, "blog"));
    assert.ok(!pooledRoot.includes("tags"));
    assert.ok(!pooledRoot.includes("authors"));

    const dir = await read("blog/months/index.html");
    const rows = [...dir.matchAll(/<li><a href="([^"]+)">([^<]+)<\/a> <span class="term-count">(\d+)<\/span><\/li>/g)]
      .map((m) => [m[1], m[2], m[3]]);
    assert.deepEqual(rows, [
      ["/blog/months/2024-12", "December 2024", "22"],
      ["/blog/months/2024-04", "April 2024", "1"],
      ["/blog/months/2023-11", "November 2023", "1"],
      ["/blog/months/2022-06", "June 2022", "2"],
    ]);

    const sitemap = await read("blog/sitemap.xml");
    for (const loc of [
      "https://remilia.org/blog/months",
      "https://remilia.org/blog/months/2024-12",
      "https://remilia.org/blog/months/2024-12/page/2",
      "https://remilia.org/blog/months/2022-06",
    ])
      assert.ok(sitemap.includes(`<loc>${loc}</loc>`), `sitemap missing ${loc}`);

    // The pooled date dropdown offers the pooled months; an older month's
    // page opens its year.
    const index = await read("blog/index.html");
    assert.ok(index.includes('id="post-date" data-value=""'));
    assert.ok(index.includes('data-href="/blog/months/2024-12">December 2024</button>'));
    assert.ok(index.includes('data-href="/blog/months/2022-06">June</button>'));
    assert.equal(index.includes('data-href="/blog/updates/months/'), false);
    const nov = await read("blog/months/2023-11/index.html");
    assert.ok(nov.includes('<span class="sel-label">November 2023</span>'));
    assert.ok(nov.includes('<details open><summary><span class="sel-label">2023</span>'));
    assert.ok(nov.includes('data-href="/blog/months/2023-11" aria-current="page">November</button>'));

    // Section month archives stay per section.
    assert.equal(cards(await read("blog/updates/months/2024-12/index.html")), 12);
    assert.equal(cards(await read("blog/press/months/2024-12/index.html")), 10);

    assert.deepEqual(await checkInternalLinks(outDir, ["https://remilia.org"]), []);
  } finally {
    server.close();
  }
});
