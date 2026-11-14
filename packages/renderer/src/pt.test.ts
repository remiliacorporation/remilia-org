import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bodyShowsImage,
  extractHeadings,
  imageAssetId,
  portableTextToHtml,
  tocItems,
  type PTBlock,
} from "./pt";
import { cdnUrl } from "./section";

const span = (text: string, marks: string[] = []) => ({
  _type: "span" as const,
  text,
  marks,
});

const OPTS = { imageUrl: () => "https://cdn.sanity.io/x.jpg?w=1600" };

test("styles, marks, and links serialize with escaping", () => {
  const blocks: PTBlock[] = [
    { _type: "block", style: "h2", children: [span("Head <2>")] },
    {
      _type: "block",
      children: [span("bold", ["strong"]), span(" & "), span("site", ["l1"])],
      markDefs: [{ _key: "l1", _type: "link", href: "https://example.com/a" }],
    },
    { _type: "block", style: "blockquote", children: [span("quoted")] },
  ];
  const html = portableTextToHtml(blocks, OPTS);
  assert.ok(
    html.includes(
      '<h2 id="head-2"><a class="hlink" href="#head-2">Head &lt;2&gt;</a></h2>',
    ),
  );
  assert.ok(html.includes("<strong>bold</strong>"));
  assert.ok(html.includes(" &amp; "));
  assert.ok(
    html.includes(
      '<a class="outlink" href="https://example.com/a" rel="external noopener">site</a>',
    ),
  );
  assert.ok(html.includes("<blockquote><p>quoted</p></blockquote>"));
});

test("consecutive list items group into one list; style switch splits", () => {
  const blocks: PTBlock[] = [
    { _type: "block", listItem: "bullet", children: [span("a")] },
    { _type: "block", listItem: "bullet", children: [span("b")] },
    { _type: "block", listItem: "number", children: [span("c")] },
    { _type: "block", children: [span("after")] },
  ];
  const html = portableTextToHtml(blocks, OPTS);
  assert.ok(html.includes("<ul><li>a</li><li>b</li></ul>"));
  assert.ok(html.includes("<ol><li>c</li></ol>"));
  assert.ok(html.includes("<p>after</p>"));
});

test("images render as figures with alt; unknown types are skipped", () => {
  const blocks: PTBlock[] = [
    {
      _type: "image",
      alt: "A photo",
      caption: "cap",
      asset: { _ref: "image-x" },
    },
    { _type: "mysteryCard" },
  ];
  const html = portableTextToHtml(blocks, OPTS);
  assert.ok(html.includes('alt="A photo"'));
  assert.ok(html.includes('<a href="https://cdn.sanity.io/x.jpg?w=1600">'));
  assert.ok(html.includes('<span class="ht">'));
  assert.ok(
    html.includes(
      '<figcaption><a href="https://cdn.sanity.io/x.jpg?w=1600">cap</a></figcaption>',
    ),
  );
  assert.ok(!html.includes("mysteryCard"));
});

test("cdnUrl parses asset refs and rejects garbage", () => {
  assert.equal(
    cdnUrl("8x9419lh", "production", "image-abc123-1200x800-jpg", "w=1600"),
    "https://cdn.sanity.io/images/8x9419lh/production/abc123-1200x800.jpg?w=1600",
  );
  assert.equal(cdnUrl("p", "d", "file-abc-pdf", "w=1"), undefined);
});

test("headings: whole text is the link; slug ids dedupe", () => {
  const blocks: PTBlock[] = [
    { _type: "block", style: "h2", children: [span("Fixes & Improvements")] },
    { _type: "block", style: "h2", children: [span("Fixes & Improvements")] },
  ];
  const html = portableTextToHtml(blocks, OPTS);
  assert.ok(
    html.includes(
      '<h2 id="fixes-improvements"><a class="hlink" href="#fixes-improvements">',
    ),
  );
  assert.ok(
    html.includes(
      '<h2 id="fixes-improvements-1"><a class="hlink" href="#fixes-improvements-1">',
    ),
  );
  const heads = extractHeadings(blocks);
  assert.deepEqual(
    heads.map((h) => h.id),
    ["fixes-improvements", "fixes-improvements-1"],
  );
});

test("tocItems excludes h4; includes h2/h3", () => {
  const blocks: PTBlock[] = [
    { _type: "block", style: "h2", children: [span("One")] },
    { _type: "block", style: "h3", children: [span("Two")] },
    { _type: "block", style: "h4", children: [span("Hidden")] },
    { _type: "block", style: "h2", children: [span("Three")] },
  ];
  const items = tocItems(extractHeadings(blocks));
  assert.ok(
    items.includes(
      '<li class="toc-l2"><a href="#one"><span class="toc-label">One</span></a></li>',
    ),
  );
  assert.ok(
    items.includes(
      '<li class="toc-l3"><a href="#two"><span class="toc-label">Two</span></a></li>',
    ),
  );
  assert.ok(!items.includes("hidden"));
});

test("tocItems renders levels and respects the minimum", () => {
  const blocks: PTBlock[] = [
    { _type: "block", style: "h2", children: [span("One")] },
    { _type: "block", style: "h3", children: [span("Two")] },
    { _type: "block", style: "h2", children: [span("Three")] },
  ];
  const items = tocItems(extractHeadings(blocks));
  assert.ok(
    items.includes(
      '<li class="toc-l3"><a href="#two"><span class="toc-label">Two</span></a></li>',
    ),
  );
  assert.ok(
    items.includes(
      '<li class="toc-l2"><a href="#one"><span class="toc-label">One</span></a></li>',
    ),
  );
  assert.equal(tocItems(extractHeadings(blocks.slice(0, 2))), "");
});

test("external links get outlink metadata; Remilia links stay internal", () => {
  const blocks: PTBlock[] = [
    {
      _type: "block",
      children: [
        span("ext", ["e"]),
        span(" and "),
        span("int", ["i"]),
        span(" and "),
        span("wiki", ["w"]),
      ],
      markDefs: [
        { _key: "e", _type: "link", href: "https://example.com/x" },
        { _key: "i", _type: "link", href: "https://remilia.org/press/launch" },
        { _key: "w", _type: "link", href: "https://wiki.remilia.org/" },
      ],
    },
  ];
  const html = portableTextToHtml(blocks, {
    ...OPTS,
    linkCard: (href) =>
      href === "https://remilia.org/press/launch"
        ? {
            title: "Launch",
            description: "We launched.",
            imageUrl: "https://cdn/x.jpg",
            imageWidth: 1200,
            imageHeight: 630,
          }
        : undefined,
  });
  assert.ok(
    html.includes('class="outlink"') &&
      html.includes('rel="external noopener">ext</a>'),
  );
  assert.ok(
    html.includes(
      '<a class="interlink" href="https://remilia.org/press/launch">',
    ),
  );
  assert.ok(html.includes('<a href="https://wiki.remilia.org/">wiki</a>'));
  assert.ok(
    html.includes('<span class="link-card" role="tooltip"><span class="ht">'),
  );
  // The card's image holds its box before it loads.
  assert.ok(html.includes('src="https://cdn/x.jpg" width="1200" height="630"'));
  assert.ok(html.includes("<strong>Launch</strong><span>We launched.</span>"));
});
test("footnotes render as one .fn with nested note", () => {
  const blocks: PTBlock[] = [
    {
      _type: "block",
      children: [span("Claim", ["f1"]), span(" and more", ["f2"])],
      markDefs: [
        { _key: "f1", _type: "footnote", text: "First source." },
        { _key: "f2", _type: "footnote", text: "Second <source>." },
      ],
    },
  ];
  const html = portableTextToHtml(blocks, OPTS);
  assert.ok(html.includes('<span class="fn" id="fn-1">'));
  assert.ok(html.includes('<a class="fn-ref" href="#fndef-1" aria-label="Note 1"><sup>1</sup></a>'));
  assert.ok(
    html.includes(
      '<div class="fn-end" id="fndef-1"><strong>1.</strong><span class="sn-text"><span class="fn-par">First source.</span></span><a class="fn-hit" href="#fn-1"',
    ),
  );
  assert.ok(
    html.includes(
      '<span class="fn-note" role="note" data-n="1"><strong>1:</strong><span class="sn-text"><span class="fn-par">First source.</span></span></span></span>',
    ),
  );
  assert.ok(!html.includes('class="sidenote"'));
  assert.ok(html.includes("Second &lt;source&gt;."));
  assert.ok(!html.includes("sn-toggle"));
});

test("text-less paragraphs (bare embed links) leave no blank gap", () => {
  const blocks: PTBlock[] = [
    {
      _type: "block",
      children: [span("", ["e"])],
      markDefs: [{ _key: "e", _type: "link", href: "https://example.com/x" }],
    },
    { _type: "block", children: [span("after")] },
    {
      _type: "block",
      children: [span("", ["f"])],
      markDefs: [{ _key: "f", _type: "footnote", text: "note" }],
    },
  ];
  const html = portableTextToHtml(blocks, OPTS);
  assert.ok(!html.includes("example.com"));
  assert.ok(html.includes("<p>after</p>"));
  // a block holding only a bare footnote ref is a notes-list entry, not a popover
  assert.ok(html.includes('class="fn-end" id="fn-1"'));
});

test("link marks reject executable URL schemes", () => {
  for (const href of [
    "javascript:alert(1)",
    "java\nscript:alert(1)",
    "data:text/html,test",
  ]) {
    const html = portableTextToHtml(
      [
        {
          _type: "block",
          children: [{ _type: "span", text: "Link", marks: ["link"] }],
          markDefs: [{ _key: "link", _type: "link", href }],
        },
      ],
      { imageUrl: () => undefined },
    );
    assert.match(html, /href="#"/);
  }
});

test("an image with an executable URL is left out", () => {
  for (const url of ["javascript:alert(1)", " javascript:alert(1)"]) {
    const html = portableTextToHtml(
      [{ _type: "image", asset: { url } }],
      { imageUrl: (b) => b.asset?.url },
    );
    assert.ok(!html.includes("javascript"));
    assert.ok(!html.includes("<figure"));
  }
});

test("an image's asset id reads the same from a ref or a CDN URL", () => {
  const ref = "image-0dce8420af1b2c3d-800x400-jpg";
  const url =
    "https://cdn.sanity.io/images/8x9419lh/production/0dce8420af1b2c3d-800x400.jpg?w=1600&auto=format";
  assert.equal(imageAssetId({ _ref: ref }), "0dce8420af1b2c3d");
  assert.equal(imageAssetId({ url }), "0dce8420af1b2c3d");
  assert.equal(imageAssetId({ url: "https://example.com/a.jpg" }), undefined);
  const body = [
    { _type: "block", children: [] },
    { _type: "image", asset: { url } },
  ];
  assert.equal(bodyShowsImage(body, ref), true);
  assert.equal(bodyShowsImage(body, "image-ffff-1x1-png"), false);
  assert.equal(bodyShowsImage(body, undefined), false);
});

test("a quote's attribution splits at the PT level, so a mark across the break nests", () => {
  const blocks: PTBlock[] = [
    {
      _type: "block",
      style: "blockquote",
      children: [
        span("“Ethereum honors its first promise.”\n- The EF Mandate", ["code"]),
      ],
    },
    {
      _type: "block",
      style: "blockquote",
      children: [
        span("one "),
        span("two\nthree", ["strong", "l1"]),
        span("\n— Author", ["em", "l1", "n1"]),
      ],
      markDefs: [
        { _key: "l1", _type: "link", href: "https://example.com/a" },
        { _key: "n1", _type: "footnote", text: "Said once." },
      ],
    },
  ];
  const html = portableTextToHtml(blocks, OPTS);
  assert.ok(
    html.includes(
      '<blockquote><p><code>“Ethereum honors its first promise.”</code><br><span class="bq-by"><code>- The EF Mandate</code></span></p></blockquote>',
    ),
    html,
  );
  // Each side closes what it opens: no tag crosses the attribution's box.
  for (const bq of html.match(/<blockquote>[\s\S]*?<\/blockquote>/g) ?? []) {
    const by = bq.match(/<span class="bq-by">([\s\S]*)<\/span><\/p>/)?.[1] ?? "";
    for (const tag of ["code", "strong", "em", "a"])
      assert.equal(
        (by.match(new RegExp(`<${tag}[ >]`, "g")) ?? []).length,
        (by.match(new RegExp(`</${tag}>`, "g")) ?? []).length,
        `${tag} in ${by}`,
      );
  }
  // The line break inside the strong link stays in the quote; the note renders once.
  assert.ok(html.includes("two<br>three"), html);
  assert.equal((html.match(/class="fn-ref"/g) ?? []).length, 1);
  assert.ok(/<span class="bq-by">.*— Author.*class="fn-ref"/.test(html), html);
});

test("a quote whose last line is no attribution keeps its line breaks", () => {
  const html = portableTextToHtml(
    [{ _type: "block", style: "blockquote", children: [span("a\nb", ["em"])] }],
    OPTS,
  );
  assert.ok(html.includes("<blockquote><p><em>a<br>b</em></p></blockquote>"), html);
});

test("a note's picture takes the body's halftone and links to the picture", () => {
  const blocks: PTBlock[] = [
    {
      _type: "block",
      children: [span("text"), span("", ["n1"])],
      markDefs: [
        {
          _key: "n1",
          _type: "footnote",
          text: "see",
          image: { asset: { _ref: "image-abc-800x400-png" }, alt: "A picture" },
        },
      ],
    },
  ];
  const html = portableTextToHtml(blocks, OPTS);
  const pic =
    '<a class="fn-img" href="https://cdn.sanity.io/x.jpg?w=1600" aria-label="A picture"><span class="ht"><span class="ht-map"><img src="https://cdn.sanity.io/x.jpg?w=1600" width="800" height="400" alt="A picture" loading="lazy"><span class="ht-ink" aria-hidden="true"></span></span></span></a>';
  // In the margin and in the list of notes.
  assert.equal(html.split(pic).length - 1, 2, html);
  // The editor gives no image URL: no picture, not a broken one.
  const bare = portableTextToHtml(blocks, { imageUrl: () => undefined });
  assert.ok(!bare.includes("<img"), bare);
});
