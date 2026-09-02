import assert from "node:assert/strict";
import { test } from "node:test";
import { injectFx, layerBounds, toFxInner } from "./bake-fx.ts";

test("layerBounds finds nested divs and trailing comment", () => {
  const html = `<div class="layer-wrap">
<div class="layer-base"><div class="inner"><p id="x">Hi</p></div></div><!-- /layer-base -->
</div>`;
  const b = layerBounds(html, "base");
  assert.ok(b);
  assert.match(b!.inner, /<div class="inner">/);
  assert.match(b!.inner, /id="x"/);
  assert.equal(html.slice(b!.start, b!.end).includes("<!-- /layer-base -->"), true);
});

test("toFxInner strips ids and blanks iframe src", () => {
  const inner = `
<a href="/" aria-label="Home" id="crest">x</a>
<iframe id="sc" src="https://w.soundcloud.com/player" height="166"></iframe>
<h1 id="top">Title</h1>`;
  const out = toFxInner(inner);
  assert.equal(/id=/.test(out), false);
  assert.match(out, /src="about:blank"/);
  assert.equal(/soundcloud/.test(out), false);
  assert.match(out, /tabindex="-1"/);
  assert.equal(/aria-label=/.test(out), false);
});

test("injectFx is idempotent and replaces prior twin", () => {
  const src = `<div class="layer-wrap">
<div class="layer-fx" aria-hidden="true"><p>stale</p></div><!-- /layer-fx -->

<div class="layer-base">
<a href="/" aria-label="Home">crest</a>
<p id="intro">Hello</p>
</div><!-- /layer-base -->
</div>`;
  const once = injectFx(src);
  assert.equal(once.status, "replaced");
  assert.match(once.html, /Hello/);
  assert.equal(once.html.includes("stale"), false);
  assert.equal((once.html.match(/class="layer-fx"/g) ?? []).length, 1);
  const fx = layerBounds(once.html, "fx");
  assert.ok(fx);
  assert.equal(/id=/.test(fx!.inner), false);
  assert.match(once.html, /layer-base[\s\S]*id="intro"/);

  const twice = injectFx(once.html);
  assert.equal(twice.status, "replaced");
  assert.equal(twice.html, once.html);
});

test("injectFx inserts when twin missing", () => {
  const src = `<div class="layer-wrap">
<div class="layer-base"><p id="a">Only</p></div><!-- /layer-base -->
</div>`;
  const { html, status } = injectFx(src);
  assert.equal(status, "injected");
  assert.match(html, /layer-fx/);
  assert.match(html, /layer-base[\s\S]*id="a"/);
  const fx = layerBounds(html, "fx");
  assert.ok(fx);
  assert.equal(/id=/.test(fx!.inner), false);
});
