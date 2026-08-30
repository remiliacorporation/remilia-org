import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canonicalFor,
  legacyRedirect,
  rssUrl,
  sitemapUrl,
  eventUrl,
  eventsIndexUrl,
  blogPosting,
  event,
  imageGallery,
  organization,
  rss,
  sitemap,
  llmsTxt,
  CHANNEL_BASEPATH,
  ORG_SECTIONS,
  COM_SECTIONS,
  COM_POST_SECTIONS,
  EVENTS_PATH_LABEL,
} from "./index";

test("canonical URLs follow the ratified section map", () => {
  assert.equal(canonicalFor("updates", "note"), "https://remilia.org/updates/note");
  assert.equal(canonicalFor("press", "launch"), "https://remilia.org/press/launch");
  assert.equal(canonicalFor("thought", "essay"), "https://remilia.org/thought/essay");
  assert.equal(canonicalFor("archive", "interview"), "https://remilia.org/archive/interview");
  assert.equal(canonicalFor("news", "fw26"), "https://remilia.com/a/news/fw26");
  assert.equal(canonicalFor("events", "party"), "https://remilia.com/a/events/party");
  assert.equal(canonicalFor("dev-updates", "ship"), "https://www.remilia.net/updates/ship");
  assert.equal(canonicalFor("dev-blog", "vaults"), "https://www.remilia.net/blog/vaults");
  assert.equal(eventUrl("tokyo"), "https://remilia.com/a/events/tokyo");
  assert.equal(eventsIndexUrl(), "https://remilia.com/a/events");
  assert.equal(rssUrl("dev-blog"), "https://www.remilia.net/blog/rss.xml");
  assert.equal(sitemapUrl("news"), "https://remilia.com/a/news/sitemap.xml");
  assert.equal(CHANNEL_BASEPATH["dev-updates"], "/updates");
  assert.equal(CHANNEL_BASEPATH.events, "/a/events");
  assert.deepEqual(ORG_SECTIONS, ["updates", "press", "thought", "archive"]);
  assert.deepEqual(COM_SECTIONS, ["news", "events"]);
  assert.deepEqual(COM_POST_SECTIONS, ["news", "events"]);
  assert.equal(EVENTS_PATH_LABEL, "remilia.com/a/events");
});

test("legacy Ghost redirect maps slug to the channel host", () => {
  assert.deepEqual(legacyRedirect("dev-blog", "vault-notes"), {
    from: "https://blog.remilia.org/vault-notes/",
    to: "https://www.remilia.net/blog/vault-notes",
  });
  assert.deepEqual(legacyRedirect("press", "vault-notes"), {
    from: "https://blog.remilia.org/vault-notes/",
    to: "https://remilia.org/press/vault-notes",
  });
});

test("blogPosting JSON-LD carries required Article fields", () => {
  const ld = blogPosting({
    channel: "press",
    slug: "launch",
    title: "Launch",
    excerpt: "We launched.",
    publishedAt: "2026-08-01T00:00:00Z",
    authors: [{ name: "Remilia" }],
  });
  assert.equal(ld["@type"], "BlogPosting");
  assert.equal(ld.url, "https://remilia.org/press/launch");
  assert.equal(ld.mainEntityOfPage, ld.url);
  assert.equal(ld.datePublished, "2026-08-01T00:00:00Z");
  assert.equal(ld.dateModified, ld.datePublished);
  assert.ok(ld.description.length > 0);
  assert.ok(JSON.stringify(ld).includes('"author":[{"@type":"Person","name":"Remilia"}]'));
});

test("event JSON-LD distinguishes physical and online locations", () => {
  const physical = event({
    slug: "tokyo",
    title: "Tokyo",
    summary: "Show",
    startsAt: "2026-09-01T18:00:00Z",
    locationName: "Shibuya",
  });
  assert.deepEqual(physical.location, { "@type": "Place", name: "Shibuya" });
  const online = event({
    slug: "stream",
    title: "Stream",
    summary: "Online show",
    startsAt: "2026-09-01T18:00:00Z",
    locationName: "Online",
    url: "https://remilia.com/live",
  });
  assert.ok(JSON.stringify(online.location).includes('"@type":"VirtualLocation"'));
});

test("imageGallery emits one ImageObject per photo with alt as description", () => {
  const ld = imageGallery({
    title: "FW26",
    pageUrl: "https://remilia.com/a/events/fw26",
    images: [{ url: "https://cdn.sanity.io/x.jpg", alt: "Runway look 1", credit: "Photo: A" }],
  });
  assert.equal(ld.image.length, 1);
  assert.equal(ld.image[0].description, "Runway look 1");
  assert.equal(ld.image[0].creditText, "Photo: A");
});

test("organization JSON-LD is the shared @id entity", () => {
  const ld = organization({ name: "Remilia", sameAs: ["https://wiki.remilia.org/Remilia_Corporation"] });
  assert.equal(ld["@id"], "https://remilia.org/#org");
  assert.ok((ld.sameAs as string[])[0].includes("wiki.remilia.org"));
});

const POSTS = [
  {
    channel: "dev-blog" as const,
    slug: "vaults",
    title: "Vaults <2>",
    excerpt: 'Notes & "vaults"',
    publishedAt: "2026-08-01T00:00:00Z",
  },
];

test("rss escapes entities and uses canonical permalinks", () => {
  const xml = rss({ channel: "dev-blog", title: "RemiliaNET — Devblog", description: "d" }, POSTS);
  assert.ok(xml.includes("<guid isPermaLink=\"true\">https://www.remilia.net/blog/vaults</guid>"));
  assert.ok(xml.includes("Vaults &lt;2&gt;"));
  assert.ok(xml.includes("Notes &amp; &quot;vaults&quot;"));
  assert.ok(xml.includes('atom:link href="https://www.remilia.net/blog/rss.xml"'));
});

test("sitemap renders loc + date-only lastmod", () => {
  const xml = sitemap([{ loc: "https://remilia.org/press/launch", lastmod: "2026-08-01T12:30:00Z" }]);
  assert.ok(xml.includes("<loc>https://remilia.org/press/launch</loc>"));
  assert.ok(xml.includes("<lastmod>2026-08-01</lastmod>"));
});

test("llmsTxt lists only the host channel plus citations", () => {
  const txt = llmsTxt({
    hostTitle: "RemiliaNET",
    lead: "Product notes.",
    channel: "dev-blog",
    channelLabel: "Devblog",
    whenToUse: ["Cite RemiliaNET engineering decisions and changelogs."],
    posts: POSTS,
    citeElsewhere: [{ label: "Remilia Corporation (wiki)", url: "https://wiki.remilia.org/Remilia_Corporation" }],
  });
  assert.ok(txt.includes("[Vaults <2>](https://www.remilia.net/blog/vaults)"));
  assert.ok(txt.includes("## Cite elsewhere"));
  assert.ok(txt.includes("## When to use this site"));
  assert.ok(!txt.includes("remilia.org/press"));
});
