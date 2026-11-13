import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { footnoteCount, portableTextToHtml, type PTBlock } from "./pt";
import { portableTextToMarkdown } from "./md";
import {
  hasOldFootnotes,
  liftFootnotes,
  lowerFootnotes,
  migrateFootnotes,
  numberFootnotes,
} from "./footnotes";

const OPTS = { imageUrl: (i: { asset?: { _ref?: string } }) => i.asset?._ref };

// Blocks copied from published posts on 2026-11-13: notes with stored
// numbers, without, with an image, with a number used twice, a first note
// numbered 2, in-note references, and a trailing notes list.
const REAL: { post: string; body: PTBlock[] }[] = JSON.parse(
  readFileSync(new URL("./fixtures/real-footnotes.json", import.meta.url), "utf8"),
);

const span = (text: string, key: string, marks: string[] = []) => ({
  _type: "span",
  _key: key,
  text,
  marks,
});
const block = (key: string, children: unknown[], extra: object = {}) =>
  ({ _type: "block", _key: key, style: "normal", markDefs: [], children, ...extra }) as PTBlock;
const note = (key: string, text: string, extra: object = {}) => ({
  _type: "footnote",
  _key: key,
  content: [block(`${key}b`, [span(text, `${key}s`)])],
  ...extra,
});

/** The numbers a page shows, in the order its endnotes list them. */
const shown = (html: string): number[] =>
  [...html.matchAll(/class="fn-end" id="[^"]*"><strong>(\d+)\./g)].map((m) => +m[1]);

for (const { post, body } of REAL) {
  test(`migrating ${post} leaves its page and Markdown unchanged`, () => {
    assert.ok(hasOldFootnotes(body));
    const m = migrateFootnotes(body);
    assert.equal(hasOldFootnotes(m.blocks), false);
    assert.ok(m.moved > 0);
    assert.equal(portableTextToHtml(m.blocks, OPTS), portableTextToHtml(body, OPTS));
    assert.equal(portableTextToMarkdown(m.blocks), portableTextToMarkdown(body));
    assert.equal(footnoteCount(m.blocks), footnoteCount(body));
    // Running it again changes nothing.
    const again = migrateFootnotes(m.blocks);
    assert.deepEqual(again.blocks, m.blocks);
    assert.equal(again.moved + again.unpinned, 0);
  });

  test(`${post}: the editor's numbers are the page's numbers`, () => {
    const m = migrateFootnotes(body);
    assert.deepEqual(
      numberFootnotes(m.blocks).map((x) => x.n),
      shown(portableTextToHtml(m.blocks, OPTS)),
    );
  });

  test(`${post}: a migrated body has no empty marked span for the editor to drop`, () => {
    for (const b of migrateFootnotes(body).blocks as { children?: { text?: string; marks?: string[] }[] }[]) {
      for (const c of b.children ?? []) {
        if (c.text === "") assert.deepEqual(c.marks ?? [], []);
      }
    }
  });
}

test("numbers that differ from the reading order are kept unless renumbering is asked for", () => {
  const dynasty = REAL.find((r) => r.post.endsWith("dynasty-mindset"))!.body;
  const kept = migrateFootnotes(dynasty);
  assert.deepEqual(kept.pinned, [4, 5, 4]);
  assert.equal(kept.unpinned, 0);
  const renumbered = migrateFootnotes(dynasty, { renumber: true });
  assert.equal(renumbered.unpinned, 3);
  assert.deepEqual(numberFootnotes(renumbered.blocks).map((x) => x.n), [1, 2, 3]);
});

test("stored numbers that match the reading order are removed", () => {
  const body = [
    block("b1", [span("One", "s1"), span("", "s2", ["f1"]), span(" two", "s3"), span("", "s4", ["f2"])], {
      markDefs: [
        { _key: "f1", _type: "footnote", n: 1, text: "First." },
        { _key: "f2", _type: "footnote", n: 2, text: "Second." },
      ],
    }),
  ];
  const m = migrateFootnotes(body);
  assert.equal(m.moved, 2);
  assert.equal(m.unpinned, 2);
  assert.equal(JSON.stringify(m.blocks).includes('"n"'), false);
  assert.equal(portableTextToHtml(m.blocks, OPTS), portableTextToHtml(body, OPTS));
});

test("a note takes its number from its place: inserting, deleting, and moving renumber the rest", () => {
  const a = note("a", "Note A");
  const b = note("b", "Note B");
  const c = note("c", "Note C");
  const numbers = (body: PTBlock[]) =>
    Object.fromEntries(numberFootnotes(body).map((x) => [x.keys.at(-1), x.n]));
  const start = [block("p1", [span("x", "s1"), a, span("y", "s2"), b])];
  assert.deepEqual(numbers(start), { a: 1, b: 2 });
  // Insert before both.
  const inserted = [block("p0", [span("w", "s0"), c]), ...start];
  assert.deepEqual(numbers(inserted), { c: 1, a: 2, b: 3 });
  assert.deepEqual(shown(portableTextToHtml(inserted, OPTS)), [1, 2, 3]);
  // Delete the first.
  const deleted = [block("p1", [span("x", "s1"), span("y", "s2"), b])];
  assert.deepEqual(numbers(deleted), { b: 1 });
  // Move the last note ahead of the others.
  const moved = [block("p1", [b, span("x", "s1"), a]), block("p0", [span("w", "s0"), c])];
  assert.deepEqual(numbers(moved), { b: 1, a: 2, c: 3 });
  const html = portableTextToHtml(moved, OPTS);
  assert.deepEqual(shown(html), [1, 2, 3]);
  assert.ok(html.indexOf("Note B") < html.indexOf("Note A"));
});

test("a note holds paragraphs, a block quote, marks, and links, in the box and in the endnotes", () => {
  const body = [
    block("p", [
      span("Claim", "s1"),
      {
        _type: "footnote",
        _key: "n1",
        content: [
          block("q1", [span("As ", "a"), span("she", "b", ["em"]), span(" wrote:", "c")]),
          block("q2", [span("A quoted <passage>.", "d")], { style: "blockquote" }),
          block("q3", [span("See ", "e"), span("the source", "f", ["l"])], {
            markDefs: [{ _key: "l", _type: "link", href: "https://example.com/s" }],
          }),
        ],
      },
      span(".", "s2"),
    ]),
  ];
  const html = portableTextToHtml(body, OPTS);
  const inner =
    '<span class="fn-par">As <em>she</em> wrote:</span>' +
    '<span class="fn-q">A quoted &lt;passage&gt;.</span>' +
    '<span class="fn-par">See <a class="outlink" href="https://example.com/s" rel="external noopener">the source</a></span>';
  // The hover box (the sidenote on wide screens) and the endnote both hold it.
  assert.ok(
    html.includes(
      `<span class="fn-note" role="note" data-n="1"><strong>1:</strong><span class="sn-text">${inner}</span></span>`,
    ),
  );
  assert.ok(
    html.includes(
      `<div class="fn-end" id="fndef-1"><strong>1.</strong><span class="sn-text">${inner}</span><a class="fn-hit" href="#fn-1"`,
    ),
  );
  // A note sits inside a paragraph: nothing in it may be a block element.
  assert.equal(/<(?:p|div|blockquote)\b[^>]*>(?=[^]*<\/span><\/span><\/p>)/.test(html.split("\n")[0]), false);
  const md = portableTextToMarkdown(body);
  assert.ok(md.includes("Claim[^1]."));
  assert.ok(
    md.includes(
      "[^1]: As *she* wrote:\n\n    > A quoted <passage>.\n\n    See [the source](https://example.com/s)",
    ),
  );
});

test("a note inside a note: one sequence in reading order, linked both ways", () => {
  const inner = note("in", "The inner note.");
  const outer = {
    _type: "footnote",
    _key: "out",
    content: [block("ob", [span("Outer text", "o1"), inner, span(" goes on.", "o2")])],
  };
  const body = [
    block("p1", [span("First", "s1"), outer, span(" then", "s2"), note("next", "The next note.")]),
  ];
  // Outer 1, the note inside it 2, the next note in the text 3.
  assert.deepEqual(
    numberFootnotes(body).map((x) => [x.keys.at(-1), x.n]),
    [
      ["out", 1],
      ["in", 2],
      ["next", 3],
    ],
  );
  const html = portableTextToHtml(body, OPTS);
  assert.deepEqual(shown(html), [1, 2, 3]);
  assert.equal(footnoteCount(body), 3);
  // In the endnotes, the outer note's text holds the inner note's mark,
  // which links to the inner note's entry.
  assert.ok(
    html.includes(
      '<div class="fn-end" id="fndef-1"><strong>1.</strong><span class="sn-text"><span class="fn-par">Outer text<a class="fn-xref" id="fn-2" href="#fndef-2" aria-label="Note 2"><sup>2</sup></a> goes on.</span></span>',
    ),
  );
  // The inner note's entry links back to that mark.
  assert.ok(
    html.includes(
      '<div class="fn-end" id="fndef-2"><strong>2.</strong><span class="sn-text"><span class="fn-par">The inner note.</span></span><a class="fn-hit" href="#fn-2" aria-label="Back to reference 2"></a></div>',
    ),
  );
  // The hover box repeats the mark without the id, so every id is unique
  // and every link has a target.
  const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const [, target] of html.matchAll(/href="#([^"]+)"/g))
    assert.ok(ids.includes(target), `#${target} has a target`);
  assert.ok(
    html.includes(
      '<span class="fn-note" role="note" data-n="1"><strong>1:</strong><span class="sn-text"><span class="fn-par">Outer text<a class="fn-xref" href="#fndef-2" aria-label="Note 2"><sup>2</sup></a> goes on.</span></span></span>',
    ),
  );
  const md = portableTextToMarkdown(body);
  assert.ok(md.includes("First[^1] then[^3]"));
  assert.ok(md.includes("[^1]: Outer text[^2] goes on.\n[^2]: The inner note.\n[^3]: The next note."));
});

test("lowering and lifting are inverse on a stored body", () => {
  const body = [
    block("p1", [span("First", "s1"), note("a", "A"), span(" then", "s2"), note("b", "B"), span("", "s3")]),
  ];
  assert.deepEqual(liftFootnotes(lowerFootnotes(body)), body);
  assert.equal(hasOldFootnotes(body), false);
  assert.equal(hasOldFootnotes(lowerFootnotes(body)), true);
});

test("the renderer tells the editor each note's markup", () => {
  const body = [block("p1", [span("First", "s1"), note("a", "A <b>")])];
  const seen: string[] = [];
  portableTextToHtml(body, {
    ...OPTS,
    onNote: (b, n, html) => seen.push(`${b}/${n}: ${html}`),
  });
  assert.deepEqual(seen, [
    'p1/a: <strong>1:</strong><span class="sn-text"><span class="fn-par">A &lt;b&gt;</span></span>',
  ]);
});
