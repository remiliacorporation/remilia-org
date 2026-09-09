import { test } from "node:test";
import assert from "node:assert/strict";
import { readingMinutes } from "./bake";
import { portableTextToHtml, type PTBlock } from "./pt";
import { articleHtml } from "./page";

test("reading time rounds to whole minutes at 200wpm", () => {
  assert.equal(readingMinutes("word ".repeat(400)), 2);
  assert.equal(readingMinutes("word ".repeat(1000)), 5);
});

test("short notes carry no reading time", () => {
  assert.equal(readingMinutes("word ".repeat(199)), undefined);
  assert.equal(readingMinutes(""), undefined);
});

test("the masthead shows reading time only when there is one", () => {
  const base = {
    title: "Vaults",
    publishedAt: "2026-08-01T00:00:00Z",
    bodyHtml: "<p>body</p>",
  };
  assert.ok(
    articleHtml({ ...base, readingMinutes: 6 }).includes(
      '<span class="mast-read">6 min read</span>',
    ),
  );
  assert.ok(!articleHtml(base).includes("mast-read"));
});

const image: PTBlock[] = [
  {
    _type: "image",
    alt: "A hall",
    asset: { _ref: "image-abc123-1600x900-jpg" },
  } as PTBlock,
];

test("post images offer candidate widths with a measure-aware sizes hint", () => {
  const html = portableTextToHtml(image, {
    imageUrl: () => "https://cdn/img?w=1600",
    imageSrcSet: () => "https://cdn/img?w=640 640w, https://cdn/img?w=1280 1280w",
  });
  assert.ok(
    html.includes(
      'srcset="https://cdn/img?w=640 640w, https://cdn/img?w=1280 1280w"',
    ),
  );
  assert.ok(html.includes('sizes="(min-width: 1100px) 560px, 100vw"'));
});

test("a caller can override the sizes hint", () => {
  const html = portableTextToHtml(image, {
    imageUrl: () => "https://cdn/img?w=1600",
    imageSrcSet: () => "https://cdn/img?w=640 640w",
    imageSizes: "50vw",
  });
  assert.ok(html.includes('sizes="50vw"'));
});

test("an image without candidates stays a plain single-source img", () => {
  const html = portableTextToHtml(image, {
    imageUrl: () => "https://cdn/img?w=1600",
  });
  assert.ok(html.includes('src="https://cdn/img?w=1600"'));
  assert.ok(!html.includes("srcset"));
  assert.ok(!html.includes("sizes="));
});
