import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LEGACY_REDIRECTS_BEGIN,
  LEGACY_REDIRECTS_END,
  mergeLegacyRedirects,
  netlifyRedirectLine,
} from "./redirects";

const STATIC = `/jobs         /careers    301
/careers      /careers.html   200
/about   /about/index.html   200
/*    /404.html    404
`;

test("netlifyRedirectLine forces 301", () => {
  assert.equal(
    netlifyRedirectLine({
      from: "https://blog.remilia.org/vault/",
      to: "https://remilia.org/press/vault",
    }),
    "https://blog.remilia.org/vault/  https://remilia.org/press/vault  301!",
  );
});

test("mergeLegacyRedirects inserts block before catch-all 404", () => {
  const out = mergeLegacyRedirects(STATIC, [
    { from: "https://blog.remilia.org/", to: "https://remilia.org/press/" },
    { from: "https://blog.remilia.org/a/", to: "https://remilia.org/press/a" },
  ]);
  assert.ok(out.includes(LEGACY_REDIRECTS_BEGIN));
  assert.ok(out.includes(LEGACY_REDIRECTS_END));
  assert.ok(out.includes("https://blog.remilia.org/a/  https://remilia.org/press/a  301!"));
  assert.match(out, /# END bake:legacy-redirects\n\/\*    \/404\.html    404/);
  assert.ok(out.includes("/jobs         /careers    301"));
});

test("mergeLegacyRedirects replaces a previous bake block", () => {
  const once = mergeLegacyRedirects(STATIC, [
    { from: "https://blog.remilia.org/old/", to: "https://remilia.org/press/old" },
  ]);
  const twice = mergeLegacyRedirects(once, [
    { from: "https://blog.remilia.org/new/", to: "https://remilia.org/press/new" },
  ]);
  assert.ok(!twice.includes("/old/"));
  assert.ok(twice.includes("/new/"));
  assert.equal(twice.split(LEGACY_REDIRECTS_BEGIN).length - 1, 1);
});

test("mergeLegacyRedirects dedupes by from", () => {
  const out = mergeLegacyRedirects(STATIC, [
    { from: "https://blog.remilia.org/a/", to: "https://remilia.org/press/a" },
    { from: "https://blog.remilia.org/a/", to: "https://remilia.org/press/b" },
  ]);
  assert.equal((out.match(/blog\.remilia\.org\/a\//g) ?? []).length, 1);
  assert.ok(out.includes("/press/a"));
  assert.ok(!out.includes("/press/b"));
});
