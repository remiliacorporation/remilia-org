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
    hrefs: ["https://decrypt.co/1/article?ref=blog.remilia.org"],
  }).to,
  "archive",
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
  "devblog",
);
assert.equal(
  classify({
    ...base,
    title: "Remilia Presents: NIU LAI - Live on RemiliaNET",
    tags: ["Announcements"],
    slug: "remilia-presents-niu-lai-live-in-miladycraft-and-on-remilianet",
  }).to,
  "updates",
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

console.log("migrate-channels.test.ts: ok");
