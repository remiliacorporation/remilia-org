import { test } from "node:test";
import assert from "node:assert/strict";
import {
  caseRedirect,
  localeRedirect,
  machineNotFound,
  SECTION_PREFIXES,
} from "../../../netlify/edge-functions/lib/paths";
import { CHANNELS, CHANNEL_BASEPATH } from "./urls";

test("the edge function knows every section the bake publishes", () => {
  const baked = [...new Set(CHANNELS.map((c) => CHANNEL_BASEPATH[c]))].sort();
  assert.deepEqual(
    [...SECTION_PREFIXES].sort(),
    baked,
    "SECTION_PREFIXES drifted from CHANNEL_BASEPATH",
  );
});

test("a mixed-case section URL redirects to the canonical lowercase path", () => {
  assert.equal(caseRedirect("/Updates/Level-2-Notes"), "/updates/level-2-notes");
  assert.equal(caseRedirect("/PRESS"), "/press");
  assert.equal(caseRedirect("/A/News/Drop"), "/a/news/drop");
});

test("an already-lowercase path is left alone", () => {
  assert.equal(caseRedirect("/updates/level-2-notes"), undefined);
  assert.equal(caseRedirect("/press"), undefined);
});

test("case-sensitive paths outside the sections are untouched", () => {
  assert.equal(caseRedirect("/assets/RQ.png"), undefined);
  assert.equal(caseRedirect("/assets/css/site.css"), undefined);
  assert.equal(caseRedirect("/About"), undefined);
});

test("corporate locale routing honors explicit, saved, browser, then country choices", () => {
  assert.deepEqual(
    localeRedirect({
      pathname: "/about",
      requested: "jp",
      preference: "kr",
      acceptLanguage: "ko",
      country: "KR",
    }),
    { pathname: "/jp/about", locale: "jp", remember: true },
  );
  assert.deepEqual(
    localeRedirect({
      pathname: "/careers",
      preference: "kr",
      acceptLanguage: "ja",
      country: "CN",
    }),
    { pathname: "/kr/careers", locale: "kr", remember: false },
  );
  assert.deepEqual(
    localeRedirect({
      pathname: "/contact",
      acceptLanguage: "en-US;q=0.8, ja-JP;q=0.9",
      country: "CN",
    }),
    { pathname: "/jp/contact", locale: "jp", remember: false },
  );
  assert.equal(
    localeRedirect({
      pathname: "/contact",
      acceptLanguage: "en-US, ja-JP;q=0.9",
      country: "JP",
    }),
    undefined,
  );
  assert.deepEqual(
    localeRedirect({ pathname: "/", country: "CN" }),
    { pathname: "/cn/", locale: "cn", remember: false },
  );
});

test("locale routing never captures blogs, assets, or an existing locale URL", () => {
  assert.equal(localeRedirect({ pathname: "/press", country: "KR" }), undefined);
  assert.equal(
    localeRedirect({ pathname: "/assets/logo.png", country: "JP" }),
    undefined,
  );
  assert.equal(localeRedirect({ pathname: "/kr/about", country: "JP" }), undefined);
});

test("selecting English cleans the URL and records the preference", () => {
  assert.deepEqual(
    localeRedirect({ pathname: "/cn/contact", requested: "en" }),
    { pathname: "/contact", locale: "en", remember: true },
  );
});

test("a missing markdown rendition answers as markdown", () => {
  const fallback = machineNotFound("/updates/gone.md");
  assert.ok(fallback);
  assert.match(fallback.contentType, /^text\/markdown/);
  assert.match(fallback.body, /404 Not found/);
  assert.match(fallback.body, /Index: \/updates/);
});

test("a missing feed answers as parseable xml, not html", () => {
  const fallback = machineNotFound("/press/rss.xml");
  assert.ok(fallback);
  assert.match(fallback.contentType, /^application\/xml/);
  assert.match(fallback.body, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(fallback.body, /<status>404<\/status>/);
  assert.ok(!fallback.body.includes("<html"));
});

test("a missing json answers with parseable json", () => {
  const fallback = machineNotFound("/thought/data.json");
  assert.ok(fallback);
  const parsed: unknown = JSON.parse(fallback.body);
  assert.ok(parsed && typeof parsed === "object" && "status" in parsed);
});

test("page requests keep the HTML 404", () => {
  assert.equal(machineNotFound("/updates/gone"), undefined);
  assert.equal(machineNotFound("/updates"), undefined);
});

test("a rendition outside any section still names a map", () => {
  const fallback = machineNotFound("/llms.txt");
  assert.ok(fallback);
  assert.match(fallback.body, /Index: \//);
});
