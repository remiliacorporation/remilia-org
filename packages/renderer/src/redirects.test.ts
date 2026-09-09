import { test } from "node:test";
import assert from "node:assert/strict";
import {
  blockBegin,
  blockEnd,
  aliasRules,
  mergeRedirectBlock,
  netlifyRedirectLine,
} from "./redirects";

const STATIC = `/jobs         /careers    301
/careers      /careers.html   200
/about   /about/index.html   200
/*    /404.html    404
`;

test("a rule renders as from, to, status", () => {
  assert.equal(
    netlifyRedirectLine({
      from: "https://blog.remilia.org/vault-notes/",
      to: "https://remilia.org/press/vault-notes",
      force: true,
    }),
    "https://blog.remilia.org/vault-notes/  https://remilia.org/press/vault-notes  301!",
  );
  assert.equal(
    netlifyRedirectLine({ from: "/updates/*", to: "/updates/404.html", status: 404 }),
    "/updates/*  /updates/404.html  404",
  );
});

test("a block lands before the catch-all so narrower rules win", () => {
  const out = mergeRedirectBlock(STATIC, "redirects:press", [
    { from: "/press/old", to: "/press/new" },
  ]);
  assert.match(
    out,
    /# END bake:redirects:press\n\/\*    \/404\.html    404/,
    "catch-all must stay last",
  );
  assert.ok(out.includes("/jobs         /careers    301"));
});

test("re-baking replaces a block rather than stacking copies", () => {
  const once = mergeRedirectBlock(STATIC, "redirects:press", [
    { from: "/press/old", to: "/press/new" },
  ]);
  const twice = mergeRedirectBlock(once, "redirects:press", [
    { from: "/press/newer", to: "/press/new" },
  ]);
  assert.ok(!twice.includes("/press/old"));
  assert.ok(twice.includes("/press/newer"));
  assert.equal(twice.split(blockBegin("redirects:press")).length - 1, 1);
});

test("blocks for different sections coexist", () => {
  const withPress = mergeRedirectBlock(STATIC, "redirects:press", [
    { from: "/press/old", to: "/press/new" },
  ]);
  const both = mergeRedirectBlock(withPress, "redirects:updates", [
    { from: "/updates/old", to: "/updates/new" },
  ]);
  assert.ok(both.includes(blockEnd("redirects:press")));
  assert.ok(both.includes(blockEnd("redirects:updates")));
  assert.match(both, /# END bake:redirects:updates\n\/\*    \/404\.html    404/);
});

test("duplicate sources collapse to the first rule", () => {
  const out = mergeRedirectBlock(STATIC, "redirects:press", [
    { from: "/press/a", to: "/press/one" },
    { from: "/press/a", to: "/press/two" },
  ]);
  assert.equal((out.match(/^\/press\/a\s/gm) ?? []).length, 1);
  assert.ok(out.includes("/press/one"));
  assert.ok(!out.includes("/press/two"));
});

test("a comment naming the markers does not swallow the catch-all", () => {
  const withComment = `/about   /about/index.html   200
# bake:org inserts section rules here (see ${blockBegin("redirects:press")})
/*    /404.html    404
`;
  const out = mergeRedirectBlock(withComment, "redirects:press", [
    { from: "/press/old", to: "/press/new" },
  ]);
  const again = mergeRedirectBlock(out, "redirects:press", [
    { from: "/press/old", to: "/press/new" },
  ]);
  assert.ok(again.includes("/*    /404.html    404"));
  assert.equal(again.split(`\n${blockBegin("redirects:press")}`).length - 1, 1);
});

test("an empty rule set removes the block and leaves the file usable", () => {
  const once = mergeRedirectBlock(STATIC, "redirects:press", [
    { from: "/press/old", to: "/press/new" },
  ]);
  const cleared = mergeRedirectBlock(once, "redirects:press", []);
  assert.ok(!cleared.includes("bake:redirects:press"));
  assert.ok(cleared.includes("/*    /404.html    404"));
});

test("a renamed post keeps its old slug and its renditions alive", () => {
  assert.deepEqual(
    aliasRules("/updates", [{ slug: "level-2-notes", aliases: ["level2"] }]),
    [
      { from: "/updates/level2", to: "/updates/level-2-notes" },
      { from: "/updates/level2.md", to: "/updates/level-2-notes.md" },
      { from: "/updates/level2.txt", to: "/updates/level-2-notes.txt" },
    ],
  );
});

test("a post moved between sections keeps its old full path", () => {
  const rules = aliasRules("/thought", [
    { slug: "art-criticism", aliases: ["/press/art-criticism/", "old-name"] },
  ]);
  assert.deepEqual(
    rules.filter((r) => !r.from.includes(".")),
    [
      { from: "/press/art-criticism", to: "/thought/art-criticism" },
      { from: "/thought/old-name", to: "/thought/art-criticism" },
    ],
  );
  assert.ok(
    rules.some(
      (r) =>
        r.from === "/press/art-criticism.txt" &&
        r.to === "/thought/art-criticism.txt",
    ),
  );
});

test("an alias equal to the current path is not a redirect loop", () => {
  assert.deepEqual(
    aliasRules("/updates", [
      { slug: "same", aliases: ["same", "/updates/same", "  "] },
    ]),
    [],
  );
});

test("posts without aliases contribute nothing", () => {
  assert.deepEqual(aliasRules("/updates", [{ slug: "plain" }]), []);
});

test("merging every section twice converges byte for byte", () => {
  const sections = ["updates", "press", "thought", "archive"];
  const pass = (file: string): string =>
    sections.reduce(
      (acc, section) =>
        mergeRedirectBlock(acc, `redirects:${section}`, [
          { from: `/${section}/*`, to: `/${section}/404.html`, status: 404 },
        ]),
      file,
    );
  const first = pass(STATIC);
  assert.equal(pass(first), first, "a second bake must not change the file");
  assert.equal(pass(pass(first)), first, "nor a third");
  assert.ok(first.trimEnd().endsWith("/*    /404.html    404"));
});
