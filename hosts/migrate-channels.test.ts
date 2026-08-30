import assert from "node:assert/strict";
import { classify } from "./migrate-channels";

const base = {
  _id: "x",
  channel: "press",
  slug: "s",
  hrefs: [] as (string | null)[],
  source: "ghost" as string | null,
};

assert.equal(
  classify({ ...base, title: "01/2026 Tokyo: FRUiTS", tags: ["Events"] }).to,
  "events",
);
assert.equal(
  classify({
    ...base,
    title: "Press Release: Remilia launches CULT",
    tags: ["Press", "Press Release"],
  }).to,
  "press",
);
assert.equal(
  classify({
    ...base,
    title: "Feature: Decrypt - Something (2025)",
    tags: ["Press", "Feature"],
  }).to,
  "press",
);
assert.equal(
  classify({
    ...base,
    title: "RemiliaNET Alpha v0.8: Global Chat",
    tags: ["Project"],
  }).to,
  "dev-updates",
);
assert.equal(
  classify({
    ...base,
    title: "RemiliaNET Alpha v0.8.1: Remilia API and Developer Portal",
    tags: ["Feature"],
  }).to,
  "dev-blog",
);
assert.equal(
  classify({
    ...base,
    title: "Remilia Wiki Launch",
    tags: ["Announcements", "Feature"],
    slug: "remilia-wiki-launch",
  }).to,
  "dev-updates",
);
assert.equal(
  classify({
    ...base,
    title: "Dynasty Mindset",
    tags: [],
    source: "paragraph",
  }).to,
  "thought",
);
assert.equal(
  classify({
    ...base,
    title: "Neogyaru",
    tags: [],
    source: "substack",
  }).to,
  "news",
);
assert.equal(
  classify({
    ...base,
    title: "Pre-Release Announcement: The Exegesis of Miya…",
    tags: ["Announcements"],
    slug: "pre-release-announcement-the-exegesis-of-miya-black-hearted-cyber-angel-baby",
  }).to,
  "news",
);

console.log("migrate-channels.test.ts: ok");
