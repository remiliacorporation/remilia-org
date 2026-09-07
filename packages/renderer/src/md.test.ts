import { test } from "node:test";
import assert from "node:assert/strict";
import {
  markdownToPost,
  portableTextToMarkdown,
  postToMarkdownFile,
} from "./md";
import { portableTextToHtml, footnoteCount } from "./pt";

const SRC = `---
title: RemiliaNET Alpha
slug: remilianet-alpha-v0-8-1
channel: press
publishedAt: 2026-08-10
excerpt: Public API and Developer Portal.
author: Remilia Jackson
tags:
  - Feature
---

One of Remilia's strengths.[^1] See [[credentials|the portal]] and the [OAuth spec](https://datatracker.ietf.org/doc/html/rfc6749).

## Public API

![Lookbook](https://cdn.example/cover.jpg "HIKKI PUNKS")

### Application types

Two types are supported.

- Login clients
- Machine clients

[^1]: Ships a cycle early.
`;

test("frontmatter and Obsidian marks become Portable Text", () => {
  const { meta, body } = markdownToPost(SRC);
  assert.equal(meta.title, "RemiliaNET Alpha");
  assert.equal(meta.slug, "remilianet-alpha-v0-8-1");
  assert.equal(meta.channel, "press");
  assert.equal(meta.author, "Remilia Jackson");
  assert.deepEqual(meta.tags, ["Feature"]);
  assert.equal(footnoteCount(body), 1);
  const html = portableTextToHtml(body, {
    imageUrl: (img) => img.asset?.url,
    linkCard: () => undefined,
  });
  assert.ok(html.includes("<h2"));
  assert.ok(html.includes("<h3"));
  assert.ok(html.includes('href="/press/credentials"'));
  assert.ok(html.includes('rel="external noopener"'));
  assert.ok(html.includes("<ul><li>"));
  assert.ok(html.includes("HIKKI PUNKS"));
  assert.ok(html.includes('class="fn"'));
});

test("markdown export keeps headings, wikilinks, and footnotes", () => {
  const { body } = markdownToPost(SRC);
  const md = portableTextToMarkdown(body);
  assert.ok(md.includes("## Public API"));
  assert.ok(md.includes("[[credentials|the portal]]"));
  assert.ok(md.includes("[^1]:"));
  const file = postToMarkdownFile({
    title: "RemiliaNET Alpha",
    slug: "remilianet-alpha-v0-8-1",
    channel: "press",
    publishedAt: "2026-08-10T00:00:00Z",
    excerpt: "Public API.",
    canonical: "https://remilia.org/press/remilianet-alpha-v0-8-1",
    author: "Remilia Jackson",
    tags: ["Feature"],
    body,
  });
  assert.ok(file.startsWith("---\n"));
  assert.ok(file.includes("channel: press"));
});
