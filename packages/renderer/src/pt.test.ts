import { test } from "node:test";
import assert from "node:assert/strict";
import { extractHeadings, portableTextToHtml, tocItems, type PTBlock } from "./pt";
import { cdnUrl } from "./bake";

const span = (text: string, marks: string[] = []) => ({ _type: "span" as const, text, marks });

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
  assert.ok(html.includes('<h2 id="head-2"><a class="hlink" href="#head-2">Head &lt;2&gt;</a></h2>'));
  assert.ok(html.includes("<strong>bold</strong>"));
  assert.ok(html.includes(" &amp; "));
  assert.ok(html.includes('<a href="https://example.com/a" rel="external noopener">site</a>'));
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
    { _type: "image", alt: "A photo", caption: "cap", asset: { _ref: "image-x" } },
    { _type: "mysteryCard" },
  ];
  const html = portableTextToHtml(blocks, OPTS);
  assert.ok(html.includes('alt="A photo"'));
  assert.ok(html.includes('<a href="https://cdn.sanity.io/x.jpg?w=1600">'));
  assert.ok(html.includes('<span class="ht">'));
  assert.ok(html.includes("<figcaption><a href=\"https://cdn.sanity.io/x.jpg?w=1600\">cap</a></figcaption>"));
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
  assert.ok(html.includes('<h2 id="fixes-improvements"><a class="hlink" href="#fixes-improvements">'));
  assert.ok(html.includes('<h2 id="fixes-improvements-1"><a class="hlink" href="#fixes-improvements-1">'));
  const heads = extractHeadings(blocks);
  assert.deepEqual(heads.map((h) => h.id), ["fixes-improvements", "fixes-improvements-1"]);
});

test("tocItems excludes h4; includes h2/h3", () => {
  const blocks: PTBlock[] = [
    { _type: "block", style: "h2", children: [span("One")] },
    { _type: "block", style: "h3", children: [span("Two")] },
    { _type: "block", style: "h4", children: [span("Hidden")] },
    { _type: "block", style: "h2", children: [span("Three")] },
  ];
  const items = tocItems(extractHeadings(blocks));
  assert.ok(items.includes('<li class="toc-l2"><a href="#one"><span class="toc-label">One</span></a></li>'));
  assert.ok(items.includes('<li class="toc-l3"><a href="#two"><span class="toc-label">Two</span></a></li>'));
  assert.ok(!items.includes("hidden"));
});

test("tocItems renders levels and respects the minimum", () => {
  const blocks: PTBlock[] = [
    { _type: "block", style: "h2", children: [span("One")] },
    { _type: "block", style: "h3", children: [span("Two")] },
    { _type: "block", style: "h2", children: [span("Three")] },
  ];
  const items = tocItems(extractHeadings(blocks));
  assert.ok(items.includes('<li class="toc-l3"><a href="#two"><span class="toc-label">Two</span></a></li>'));
  assert.ok(items.includes('<li class="toc-l2"><a href="#one"><span class="toc-label">One</span></a></li>'));
  assert.equal(tocItems(extractHeadings(blocks.slice(0, 2))), "");
});

test("external links marked rel=external; internal links get hover cards", () => {
  const blocks: PTBlock[] = [
    {
      _type: "block",
      children: [span("ext", ["e"]), span(" and "), span("int", ["i"])],
      markDefs: [
        { _key: "e", _type: "link", href: "https://example.com/x" },
        { _key: "i", _type: "link", href: "https://remilia.org/press/launch" },
      ],
    },
  ];
  const html = portableTextToHtml(blocks, {
    ...OPTS,
    linkCard: (href) =>
      href === "https://remilia.org/press/launch"
        ? { title: "Launch", description: "We launched.", imageUrl: "https://cdn/x.jpg" }
        : undefined,
  });
  assert.ok(html.includes('rel="external noopener">ext</a>'));
  assert.ok(html.includes('<a class="interlink" href="https://remilia.org/press/launch">'));
  assert.ok(html.includes('<span class="link-card" role="tooltip"><span class="ht">'));
  assert.ok(html.includes('src="https://cdn/x.jpg"'));
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
  assert.ok(html.includes('<label class="fn-ref" for="fn-1-on">[1]</label>'));
  assert.ok(html.includes('<span class="fn-note" role="note" data-n="1"><strong>1:</strong><span class="sn-text">First source.</span></span>'));
  assert.ok(!html.includes('class="sidenote"'));
  assert.ok(html.includes("Second &lt;source&gt;."));
  assert.ok(!html.includes("sn-toggle"));
});
