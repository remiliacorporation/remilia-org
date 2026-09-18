
import assert from "node:assert/strict";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { expandIncludes, layerBounds, stripFxLayer } from "./bake-corp";
import { localizeCorpChrome } from "./corp-locales";

const partialsDir = join(fileURLToPath(new URL(".", import.meta.url)), "../deploy/src/_partials");

test("expandIncludes inlines partials", async () => {
  const html = `<head>\n<!-- @include _partials/head-common.html -->\n<title>T</title>\n</head>`;
  const out = await expandIncludes(html, partialsDir);
  assert.match(out, /<meta charset="UTF-8"\s*\/?>/);
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

test("layerBounds brace-matches nested divs", () => {
  const html = `<div class="layer-wrap">
<div class="layer-base"><div class="inner"><p id="x">Hi</p></div></div>
</div>`;
  const b = layerBounds(html, "base");
  assert.ok(b);
  assert.match(b!.inner, /<div class="inner">/);
  assert.match(b!.inner, /id="x"/);
  assert.equal(html.slice(b!.start, b!.end).endsWith("</div>"), true);
});

test("corp bake pipeline leaves one ink-treated surface", async () => {
  const src = `<!DOCTYPE html><html><head>
<!-- @include _partials/head-common.html -->
<title>Test</title>
</head><body><div class="layer-wrap"><div class="layer-fx" aria-hidden="true"><h1>Ghost</h1></div><!-- /layer-fx --><div class="layer-base"><h1 id="h">Hi</h1></div><!-- /layer-base --></div></body></html>`;
  const html = stripFxLayer(await expandIncludes(src, partialsDir));
  assert.equal(layerBounds(html, "fx"), null);
  assert.equal(layerBounds(html, "base") !== null, true);
  assert.equal(html.includes("Ghost"), false);
  assert.match(html, /id="h"/);
  assert.match(html, /site\.css/);
});

test("corporate locale chrome maps SEO and selectors to equivalent pages", () => {
  const html = localizeCorpChrome(
    "<html><head></head><body><main>안녕하세요</main></body></html>",
    "kr/about/index.html",
  );
  assert.match(html, /property="og:locale" content="ko_KR"/);
  assert.match(
    html,
    /hreflang="ja" href="https:\/\/remilia\.org\/jp\/about"/,
  );
  assert.match(html, /hreflang="x-default" href="https:\/\/remilia\.org\/about"/);
  assert.match(html, /href="\/about\?lang=en"/);
  assert.match(html, /data-locale="cn" href="\/cn\/about\?lang=cn"/);
  assert.match(html, /<span lang="ko" aria-current="page">한국어<\/span>/);
});
