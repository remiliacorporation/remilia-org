import { test } from "node:test";
import assert from "node:assert/strict";
import { CHANNELS, CHANNEL_HOST, siteMetaFor } from "@remilia/seo";
import { htmlPage, type Chrome } from "./page";
import { emptyRail } from "./nav";

const CHROME: Chrome = {
  stylesheet: "/blog.css",
  header: `<header><nav><a href="/">Remilia</a></nav></header>`,
  footer: `<footer><p>Remilia Corporation</p></footer>`,
};

const shell = (channel: (typeof CHANNELS)[number]): string =>
  htmlPage({
    title: "T",
    description: "D",
    canonical: "https://remilia.org/x",
    channel,
    jsonld: [],
    chrome: CHROME,
    leftRail: emptyRail(),
    mainHtml: '<main id="content"><h1>T</h1></main>',
  });

test("remilia.com serves dark red with no lattice", () => {
  const html = shell("news");
  assert.match(html, /<html[^>]*data-hue="30"/);
  assert.match(html, /<html[^>]*data-dots="none"/);
  assert.match(html, /<html[^>]*data-scheme="dark"/);
  // The CSS-only path keys off :checked, so the dial has to agree.
  assert.match(html, /id="theme-dark" class="theme-dark" checked>/);
  assert.match(html, /id="theme-hue-30"[^>]*checked>/);
  assert.match(html, /id="theme-dots-none"[^>]*checked>/);
});

test("remilia.net serves light blue with a dense lattice", () => {
  const html = shell("dev-blog");
  assert.match(html, /<html[^>]*data-hue="255"/);
  assert.match(html, /<html[^>]*data-dots="small"/);
  assert.match(html, /<html[^>]*data-scheme="light"/);
  assert.match(html, /id="theme-dark" class="theme-dark">/);
  assert.match(html, /id="theme-hue-255"[^>]*checked>/);
  assert.match(html, /id="theme-dots-small"[^>]*checked>/);
});

test("remilia.org serves pinned light red with a sparse lattice", () => {
  const html = shell("updates");
  assert.match(html, /<html[^>]*data-hue="30"/);
  assert.match(html, /<html[^>]*data-dots="large"/);
  assert.match(html, /<html[^>]*data-scheme="light"/);
  assert.match(html, /id="theme-hue-30"[^>]*checked>/);
  assert.match(html, /id="theme-dots-large"[^>]*checked>/);
  assert.match(html, /id="theme-dark" class="theme-dark">/);
});

test("no host is left following the reader's OS by accident", () => {
  for (const channel of CHANNELS)
    assert.match(
      shell(channel),
      /<html[^>]*data-scheme="(light|dark)"/,
      `${channel} has no pinned scheme`,
    );
});

test("exactly one hue and one density are pre-checked per host", () => {
  for (const channel of CHANNELS) {
    const html = shell(channel);
    assert.equal(
      (html.match(/name="theme-hue"[^>]*checked>/g) ?? []).length,
      1,
      `${channel}: hue dial must have one default`,
    );
    assert.equal(
      (html.match(/name="theme-dots"[^>]*checked>/g) ?? []).length,
      1,
      `${channel}: dots dial must have one default`,
    );
  }
});

test("channels on the same host share its theme", () => {
  for (const channel of CHANNELS) {
    assert.deepEqual(
      siteMetaFor(channel).theme,
      siteMetaFor(
        CHANNELS.find((c) => CHANNEL_HOST[c] === CHANNEL_HOST[channel]) ??
          channel,
      ).theme,
      `${channel} disagrees with its host`,
    );
  }
});
