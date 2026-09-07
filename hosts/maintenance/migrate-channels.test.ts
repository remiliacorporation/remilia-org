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
    title:
      "Press Release: Remilia Corporation Debuts Luxury Streetwear Collection, HIKKI PUNKS EXIT SOCIETY",
    tags: ["Press", "Press Release"],
  }).to,
  "news",
);
assert.equal(
  classify({
    ...base,
    title:
      "Press Release: Remilia Corporation condemns Caroline Ellison as Unrepresentative Of Milady Values",
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
    title: "Feature: Decrypt - Something (2025)",
    tags: ["Press", "Feature"],
    hrefs: ["https://decrypt.co/1/article?ref=blog.remilia.org"],
  }).origin,
  "external",
);
assert.equal(
  classify({
    ...base,
    title: "Corporate Memo: Remilia 2024 Christmas Missive",
    tags: ["Announcements"],
    slug: "corporate-memo-remilia-2024-christmas-missive",
  }).to,
  "updates",
);
assert.equal(
  classify({
    ...base,
    title: "Admin Reveal: I said I'm just a vessel bro",
    tags: [],
    source: "paragraph",
    slug: "admin-reveal-i-said-i-m-just-a-vessel-bro",
  }).to,
  "updates",
);
assert.equal(
  classify({
    ...base,
    title: "Remilia Corporation Onboarding Package",
    tags: [],
    source: "paragraph",
    slug: "remilia-corporation-onboarding-package",
  }).to,
  "thought",
);
assert.equal(
  classify({
    ...base,
    title: "Dynasty Mindset",
    tags: [],
    source: "paragraph",
    slug: "dynasty-mindset",
  }).to,
  "archive",
);
assert.equal(
  classify({
    ...base,
    title: "Neogyaru",
    tags: [],
    source: "substack",
    slug: "neogyaru",
  }).to,
  "archive",
);
assert.equal(
  classify({
    ...base,
    title: "Remilia Wiki Launch",
    tags: ["Announcements"],
    slug: "remilia-wiki-launch",
  }).to,
  "dev-blog",
);
assert.equal(
  classify({
    ...base,
    title: "RemiliaNET Alpha v0.8: Global Chat",
    tags: ["Project"],
  }).to,
  "dev-blog",
);
assert.equal(
  classify({
    ...base,
    title: "Remilia New Vault Architecture",
    tags: ["NFT"],
  }).to,
  "dev-updates",
);

console.log("migrate-channels.test.ts: ok");
