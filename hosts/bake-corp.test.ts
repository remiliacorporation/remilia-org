
import assert from "node:assert/strict";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { expandIncludes, stripFxLayer } from "./bake-corp.ts";
import { injectFx, layerBounds } from "./bake-fx.ts";

const partialsDir = join(fileURLToPath(new URL(".", import.meta.url)), "../deploy/src/_partials");

test("expandIncludes inlines partials", async () => {
  const html = `<head>\n<!-- @include _partials/head-common.html -->\n<title>T</title>\n</head>`;
  const out = await expandIncludes(html, partialsDir);
  assert.match(out, /<meta charset="UTF-8">/);
  assert.match(out, /<title>T<\/title>/);
  assert.equal(out.includes("@include"), false);
});

test("stripFxLayer removes decorative twin", () => {
  const src = `<div class="layer-wrap">
<div class="layer-fx" aria-hidden="true"><p>fx</p></div><!-- /layer-fx -->
<div class="layer-base"><p id="x">base</p></div><!-- /layer-base -->
</div>`;
  const out = stripFxLayer(src);
  assert.equal(out.includes("layer-fx"), false);
  assert.match(out, /id="x"/);
});

test("corp bake pipeline: partials then fx", async () => {
  const src = `<!DOCTYPE html><html><head>
<!-- @include _partials/head-common.html -->
<title>Test</title>
</head><body><div class="layer-wrap"><div class="layer-base"><h1 id="h">Hi</h1></div><!-- /layer-base --></div></body></html>`;
  const merged = await expandIncludes(src, partialsDir);
  const { html, status } = injectFx(merged);
  assert.equal(status, "injected");
  assert.equal(layerBounds(html, "fx") !== null, true);
  assert.equal(layerBounds(html, "base") !== null, true);
  assert.match(html, /id="h"/);
  assert.equal(/id=/.test(layerBounds(html, "fx")!.inner), false);
});
