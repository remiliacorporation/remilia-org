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
  stylesheet: "/updates/blog.css",
  header: `<header class="site-head"><a class="site-title" href="/updates">Updates</a></header>`,
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

async function fixtureServer(): Promise<{ url: string; close: () => void }> {
  const server: Server = createServer((req, res) => {
    const query = decodeURIComponent(new URL(req.url ?? "/", "http://x").search);
    const body = query.includes('_id == "org"')
      ? { result: { name: "Remigumi-guchi Digital, LLC" } }
      : query.includes("count(")
        ? { result: posts.length }
        : { result: posts };
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

test("a section bakes paginated listings, taxonomy archives and resolvable links", async () => {
  const fixture = await fixtureServer();
  const outDir = await mkdtemp(join(tmpdir(), "bake-listings-"));
  try {
    // Host-level files a section links to but does not own.
    await mkdir(join(outDir, "assets"), { recursive: true });
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
    ])
      await writeFile(join(outDir, file), "stub");

    await bake({
      channel: "updates",
      chrome: CHROME,
      host: HOST,
      outDir,
      projectId: "test",
      dataset: "production",
      token: "sk-test",
      apiHost: fixture.url,
      stylesheets: [],
    });
    const page1 = await readFile(join(outDir, "updates/index.html"), "utf8");
    const page2 = await readFile(
      join(outDir, "updates/page/2/index.html"),
      "utf8",
    );

    // 25 posts at 20 per page: two pages, 20 then 5.
    assert.equal((page1.match(/class="sec post-card"/g) ?? []).length, 20);
    assert.equal((page2.match(/class="sec post-card"/g) ?? []).length, 5);
    assert.ok(page1.includes('rel="next" href="/updates/page/2"'));
    assert.ok(page1.includes("Page 1 of 2"));
    assert.ok(page2.includes('rel="prev" href="/updates"'));
    assert.ok(
      page2.includes(
        '<link rel="canonical" href="https://remilia.org/updates/page/2">',
      ),
    );
    assert.ok(
      page1.includes('<link rel="next" href="https://remilia.org/updates/page/2">'),
      "page 1 must declare rel=next in the head",
    );

    // Tag archives: Theory holds every third post, Notes the rest.
    const theory = await readFile(
      join(outDir, "updates/tags/theory/index.html"),
      "utf8",
    );
    assert.equal((theory.match(/class="sec post-card"/g) ?? []).length, 9);
    assert.ok(theory.includes("Theory — Remilia Corporation — Updates"));
    const tagFeed = await readFile(
      join(outDir, "updates/tags/theory/rss.xml"),
      "utf8",
    );
    assert.equal((tagFeed.match(/<item>/g) ?? []).length, 9);

    const tagDir = await readFile(join(outDir, "updates/tags/index.html"), "utf8");
    assert.ok(tagDir.includes('href="/updates/tags/theory"'));
    assert.ok(tagDir.includes('<span class="term-count">9</span>'));

    // Author archives split the same posts by byline.
    const author = await readFile(
      join(outDir, "updates/authors/remilia-jackson/index.html"),
      "utf8",
    );
    assert.equal((author.match(/class="sec post-card"/g) ?? []).length, 13);
    const authorDir = await readFile(
      join(outDir, "updates/authors/index.html"),
      "utf8",
    );
    assert.ok(authorDir.includes('href="/updates/authors/charlotte-fang"'));

    // A post's byline points at the archives, not a query filter.
    const post = await readFile(join(outDir, "updates/post-1/index.html"), "utf8");
    assert.ok(post.includes('href="/updates/tags/theory"'));
    assert.ok(post.includes('href="/updates/authors/remilia-jackson"'));

    // Every listing is in the sitemap.
    const sitemap = await readFile(join(outDir, "updates/sitemap.xml"), "utf8");
    for (const loc of [
      "https://remilia.org/updates/page/2",
      "https://remilia.org/updates/tags/theory",
      "https://remilia.org/updates/tags",
      "https://remilia.org/updates/authors/charlotte-fang",
    ])
      assert.ok(sitemap.includes(`<loc>${loc}</loc>`), `sitemap missing ${loc}`);

    // Nothing the bake wrote links into nowhere.
    const broken = await checkInternalLinks(outDir, ["https://remilia.org"]);
    assert.deepEqual(broken, []);

    const written = await readdir(join(outDir, "updates"));
    assert.ok(written.includes("tags"));
    assert.ok(written.includes("authors"));
    assert.ok(written.includes("page"));
  } finally {
    fixture.close();
  }
});
