// The Studio's page editor (studio/frameParts.ts) renders a post page's
// rails, byline, and adjacent links through the renderer. These hold that to
// the same markup the bake writes for the same posts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { hostCats, leftRail, sectionNav } from "./nav";
import { adjacentHtml, articleHtml, bylineHtml, citeBox, tocBox } from "./page";
import {
  FRAME_POSTS_QUERY,
  frameBody,
  frameParts,
  type FramePost,
  type FrameRow,
} from "../../../studio/frameParts";

test("hostCats is the section set every masthead and rail is built from", () => {
  assert.deepEqual(hostCats("press"), {
    cats: [
      { label: "Updates", href: "/blog/updates" },
      { label: "Press", href: "/blog/press" },
      { label: "Thought", href: "/blog/thought" },
      { label: "Archive", href: "/blog/archive" },
    ],
    current: "Press",
    allHref: "/blog",
  });
  // A pooled listing has no section of its own.
  assert.equal(hostCats("blog", true).current, "");
  assert.match(
    sectionNav(hostCats("press")),
    /<a href="\/blog\/press" aria-current="true">Press<\/a>/,
  );
});

test("the masthead's byline is bylineHtml, with a plain section link", () => {
  const input = {
    publishedAt: "2026-08-01T00:00:00Z",
    byline: "Remilia",
    authorHref: "/blog/press/authors/remilia",
    category: "Press",
    categoryHref: "/blog/press",
    monthHref: "/blog/press/months/2026-08",
  };
  const byline = bylineHtml(input);
  assert.equal(
    byline,
    '<a class="byline-date" href="/blog/press/months/2026-08"><time datetime="2026-08-01T00:00:00.000Z">08.01.26</time></a><a class="byline-cat" href="/blog/press">Press</a><a class="author" href="/blog/press/authors/remilia">Remilia</a>',
  );
  assert.ok(
    articleHtml({ ...input, title: "T", bodyHtml: "" }).includes(
      `<div class="byline">${byline}</div>`,
    ),
  );
});

const heading = (style: string, text: string) => ({
  _type: "block",
  style,
  children: [{ _type: "span", text }],
});

const ROWS: FrameRow[] = [
  {
    _id: "c",
    title: "Newest",
    slug: "newest",
    excerpt: "Third",
    publishedAt: "2026-03-01T00:00:00.000Z",
    authors: [{ name: "Charlotte Fang" }, null],
  },
  {
    _id: "b",
    title: "Published title",
    slug: "middle",
    excerpt: "Second",
    publishedAt: "2026-02-01T00:00:00.000Z",
    authors: [{ name: "Remilia Jackson" }],
  },
  {
    _id: "a",
    title: "Oldest",
    slug: "oldest",
    excerpt: "First",
    publishedAt: "2026-01-01T00:00:00.000Z",
    authors: [{ name: "Remilia Jackson" }],
  },
];

const POST: FramePost = {
  id: "b",
  title: "Edited title",
  slug: "middle",
  publishedAt: "2026-02-01T00:00:00.000Z",
  excerpt: "Second",
  authors: ["Remilia Jackson"],
  body: frameBody([
    heading("h2", "One"),
    heading("normal", "word ".repeat(400)),
    heading("h2", "Two"),
    heading("h3", "Three"),
    // A block the editor has not given children yet is skipped.
    { _type: "block", style: "h2" },
  ]),
};

test("the frame reads the section's posts with the bake's own filter", () => {
  assert.match(
    FRAME_POSTS_QUERY,
    /^\*\[_type == "post" && channel == \$channel && defined\(publishedAt\) && \(\$includeFuture \|\| publishedAt <= now\(\)\)\] \| order\(publishedAt desc\) \{/,
  );
});

test("the frame's parts are the renderer's, over the section with the edited post in place", () => {
  const parts = frameParts("press", ROWS, POST);
  const nav = [
    ["Newest", "newest", "2026-03-01T00:00:00.000Z", "Third", "Charlotte Fang", "2026-03"],
    ["Edited title", "middle", "2026-02-01T00:00:00.000Z", "Second", "Remilia Jackson", "2026-02"],
    ["Oldest", "oldest", "2026-01-01T00:00:00.000Z", "First", "Remilia Jackson", "2026-01"],
  ].map(([title, slug, date, excerpt, author, month]) => ({
    title,
    url: `/blog/press/${slug}`,
    date,
    category: "Press",
    categoryHref: "https://remilia.org/blog/press",
    monthHref: `/blog/press/months/${month}`,
    excerpt,
    author,
  }));

  // The rail lists the edited title, not the published one, and marks it.
  assert.equal(
    parts.rail,
    leftRail(nav, "", "/blog/press", "/blog/press/middle", hostCats("press")),
  );
  assert.ok(parts.rail.includes('<a href="/blog/press/middle" aria-current="page">Edited title</a>'));
  assert.ok(!parts.rail.includes("Published title"));

  assert.equal(parts.adjacent, adjacentHtml(nav, "/blog/press/middle"));
  assert.ok(parts.adjacent.includes('href="/blog/press/oldest"'));
  assert.ok(parts.adjacent.includes('href="/blog/press/newest"'));

  assert.equal(
    parts.byline,
    bylineHtml({
      publishedAt: POST.publishedAt,
      byline: "Remilia Jackson",
      authorHref: "/blog/press/authors/remilia-jackson",
      category: "Press",
      categoryHref: "/blog/press",
      monthHref: "/blog/press/months/2026-02",
    }),
  );

  // Contents follow the headings in the editor.
  assert.equal(
    parts.toc,
    tocBox(
      [
        '<li class="toc-l2"><a href="#one"><span class="toc-label">One</span></a></li>',
        '<li class="toc-l2"><a href="#two"><span class="toc-label">Two</span></a></li>',
        '<li class="toc-l3"><a href="#three"><span class="toc-label">Three</span></a></li>',
      ].join("\n"),
    ),
  );
  assert.equal(
    frameParts("press", ROWS, { ...POST, body: POST.body.slice(0, 3) }).toc,
    "",
    "under three headings the site has no contents box",
  );

  assert.equal(
    parts.cite,
    citeBox({
      canonical: "https://remilia.org/blog/press/middle",
      mdHref: "/blog/press/middle.md",
      txtHref: "/blog/press/middle.txt",
      // Blocks join with nothing between them, as the bake counts them.
      minutes: 2,
      words: 401,
    }),
  );
});

test("the frame's tools row is the masthead's own", () => {
  const parts = frameParts("press", ROWS, POST);
  assert.equal(
    parts.mastTools,
    '<span class="mast-read">2 min read</span><label class="mast-toc" for="toc-toggle"><span class="nav-sep" aria-hidden="true">—</span> Contents</label><span class="mast-copy"><span class="nav-sep" aria-hidden="true">—</span> Copy: <button type="button" class="copy-md" data-src="/blog/press/middle.md">[MD]</button> — <button type="button" class="copy-txt" data-src="/blog/press/middle.txt">[TXT]</button></span>',
  );
  assert.ok(
    articleHtml({
      title: "T",
      publishedAt: POST.publishedAt,
      bodyHtml: "",
      mdHref: "/blog/press/middle.md",
      txtHref: "/blog/press/middle.txt",
      readingMinutes: 2,
    }).includes(`<p class="mast-tools">${parts.mastTools}</p>`),
  );
});

test("an unlisted draft and outside coverage render as the site would", () => {
  // No slug yet: the post is in no list, and has no neighbors.
  const draft = frameParts("press", ROWS, { ...POST, id: "new", slug: "" });
  assert.equal(draft.adjacent, "");
  assert.ok(draft.rail.includes("Published title"));
  assert.ok(!draft.rail.includes("Edited title"));

  // An undated draft keeps the byline's date slot empty.
  const undated = frameParts("press", ROWS, { ...POST, id: "new", publishedAt: "" });
  assert.ok(undated.byline.startsWith('<span class="byline-date"></span>'));

  // Coverage names its outlet, unlinked, never the author it is filed under.
  const coverage = frameParts("archive", [], {
    ...POST,
    origin: "external",
    externalUrl: "https://www.forbes.com/feature",
  });
  assert.ok(coverage.byline.endsWith('<span class="author">forbes.com</span>'));
  assert.ok(coverage.rail.includes('data-author="forbes.com"'));
});
