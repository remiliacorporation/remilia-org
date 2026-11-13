import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { scopeBlogCss } from "./embed";

const core = fileURLToPath(new URL("../../../hosts/core/", import.meta.url));
// Same order as BLOG_SHEETS in hosts/core/sections.ts.
const SHEET = [
  "theme.css",
  ...[
    "base",
    "chrome",
    "controls",
    "index",
    "nav",
    "prose",
    "media",
    "notes",
    "sidenotes",
    "layout",
    "print",
  ].map((n) => `blog/${n}.css`),
]
  .map((f) => readFileSync(core + f, "utf8"))
  .join("\n");

const OPTS = { root: ".page", limit: ".edit", container: "page" };
const OUT = scopeBlogCss(SHEET, OPTS);

test("the whole sheet lands inside one @scope with the editor excluded", () => {
  assert.equal(OUT.match(/@scope /g)?.length, 1);
  assert.ok(OUT.includes("@scope (.page) to (.edit) {"));
  const open = OUT.split("{").length;
  const close = OUT.split("}").length;
  assert.equal(open, close, "braces stay balanced");
});

test("root selectors move onto the frame; class names that end in body stay", () => {
  const scoped = OUT.slice(OUT.indexOf("@scope"));
  assert.doesNotMatch(scoped, /(^|[\s,(>+~}])(html|body|:root)[\s,.:[{>+~)#]/);
  assert.ok(scoped.includes(':scope[data-scheme="dark"]'));
  assert.ok(scoped.includes(':scope:has(#theme-hue-30:checked)'));
  assert.ok(scoped.includes(".article-body"));
  assert.ok(scoped.includes("var(--size-root)"));
});

test("width queries follow the frame; other media queries stay", () => {
  assert.doesNotMatch(OUT, /@media \((min|max)-width/);
  assert.ok(
    OUT.includes("@container page (min-width: 824px) and (max-width: 1099px) {"),
  );
  assert.ok(OUT.includes("@container page (min-width: 1100px) {"));
  assert.ok(OUT.includes("@media print"));
  assert.ok(OUT.includes("@media (prefers-color-scheme: dark)"));
});

test("@property stays global and @font-face is left to the embedder", () => {
  assert.ok(OUT.indexOf("@property --hue") < OUT.indexOf("@scope"));
  assert.ok(!OUT.includes("@font-face"));
  assert.ok(!OUT.includes("/*"));
});
