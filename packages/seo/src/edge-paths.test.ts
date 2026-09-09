import { test } from "node:test";
import assert from "node:assert/strict";
import {
  caseRedirect,
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
