import { test } from "node:test";
import assert from "node:assert/strict";
import { CHANNELS, CHANNEL_HOST, CHANNEL_HUE, themeFor } from "@remilia/seo";
import { htmlPage, type Chrome } from "./page";
import { emptyRail } from "./nav";
import { THEME_JS } from "./theme";

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

const attrs = (html: string): string => html.match(/<html[^>]*>/)?.[0] ?? "";

test("remilia.com serves dark red with no lattice", () => {
  const html = attrs(shell("news"));
  assert.match(html, /data-hue="30"/);
  assert.match(html, /data-dots="none"/);
  assert.match(html, /data-scheme="dark"/);
});

test("remilia.net serves light blue and lets the scheme set the lattice", () => {
  const html = attrs(shell("dev-blog"));
  assert.match(html, /data-hue="255"/);
  assert.match(html, /data-scheme="light"/);
  assert.doesNotMatch(html, /data-dots=/);
});

test("org sections take their own hue and follow the reader's scheme", () => {
  const expectHue: Record<string, string> = {
    blog: "30",
    updates: "255",
    thought: "30",
    devblog: "145",
    press: "95",
    archive: "330",
  };
  for (const [channel, hue] of Object.entries(expectHue)) {
    const html = attrs(shell(channel as (typeof CHANNELS)[number]));
    assert.match(html, new RegExp(`data-hue="${hue}"`), channel);
    assert.doesNotMatch(html, /data-scheme=/, channel);
    assert.doesNotMatch(html, /data-dots=/, channel);
  }
});

test("com and net stay pinned; org follows the reader", () => {
  for (const channel of CHANNELS) {
    const html = attrs(shell(channel));
    if (CHANNEL_HOST[channel] === "org")
      assert.doesNotMatch(html, /data-scheme=/, channel);
    else assert.match(html, /data-scheme="(light|dark)"/, channel);
  }
});

test("the page has no color or lattice picker", () => {
  for (const channel of CHANNELS) {
    const html = shell(channel);
    assert.equal(html.includes("theme-sel"), false, channel);
    assert.equal(html.includes("theme-hue"), false, channel);
    assert.equal(html.includes("theme-dots"), false, channel);
  }
});

test("a stored scheme is applied before paint and a stored hue is ignored", () => {
  const apply = THEME_JS.indexOf('localStorage.getItem("remilia-scheme")');
  const ready = THEME_JS.indexOf("DOMContentLoaded");
  assert.ok(apply >= 0 && ready > apply);
  assert.ok(THEME_JS.includes('!root.hasAttribute("data-scheme")'));
  assert.equal(THEME_JS.includes("remilia-hue"), false);
  assert.equal(THEME_JS.includes("remilia-dots"), false);
});

test("org hues follow the section row, and a host's scheme and lattice stay shared", () => {
  for (const channel of CHANNELS) {
    const theme = themeFor(channel);
    const hostTheme = themeFor(
      CHANNELS.find((c) => CHANNEL_HOST[c] === CHANNEL_HOST[channel]) ?? channel,
    );
    assert.equal(theme.scheme, hostTheme.scheme, channel);
    assert.equal(theme.dots, hostTheme.dots, channel);
    assert.equal(theme.hue, CHANNEL_HUE[channel] ?? hostTheme.hue, channel);
  }
});
