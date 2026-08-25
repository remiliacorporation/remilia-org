import { test } from "node:test";
import assert from "node:assert/strict";
import { htmlPage, articleHtml, notFoundHtml, type Chrome } from "./page";
// Cross-package source import: lockstep proof that baked output passes the auditor.
import { auditPage, auditArticleSemantics, auditIndexability } from "../../conformance/src/audit";
import { galleryHtml } from "./gallery";

const CHROME: Chrome = {
  stylesheet: "/blog/blog.css",
  header: `<header><nav><a href="/">RemiliaNET</a></nav></header>`,
  footer: `<footer><p>Remilia Corporation</p></footer>`,
};

const PAGE = htmlPage({
  title: "Vaults — Devblog",
  description: "How vaults work.",
  canonical: "https://www.remilia.net/blog/vaults",
  jsonld: [{ "@context": "https://schema.org", "@type": "BlogPosting", headline: "Vaults" }],
  chrome: CHROME,
  mainHtml: articleHtml({
    title: "Vaults",
    publishedAt: "2026-08-01T00:00:00Z",
    byline: "Remilia",
    bodyHtml: `<p>${"Vault mechanics explained at length. ".repeat(20)}</p>`,
  }),
});

test("page shell emits the fixed semantic structure", () => {
  assert.ok(PAGE.includes('<html lang="en">'));
  assert.ok(PAGE.includes('<main class="article-wrap">'));
  assert.ok(PAGE.includes('<article class="article-body">'));
  assert.ok(PAGE.includes('<time datetime="2026-08-01T00:00:00.000Z">08.01.26</time>'));
  assert.ok(PAGE.includes("<h1>Vaults</h1>"));
  assert.ok(PAGE.includes('<link rel="stylesheet" href="/blog/blog.css">'));
});

test("baked page passes the conformance page auditor", () => {
  assert.deepEqual(auditPage(PAGE, "https://www.remilia.net/blog/vaults"), []);
  assert.deepEqual(auditArticleSemantics(PAGE), []);
  assert.deepEqual(auditIndexability(PAGE, true), []);
});

test("404 page is noindex and points at sitemap and llms.txt", () => {
  const nf = notFoundHtml(CHROME, "/blog");
  assert.ok(nf.includes('content="noindex"'));
  assert.ok(nf.includes("/blog/sitemap.xml"));
  assert.ok(nf.includes("/llms.txt"));
});

test("gallery renders figures with alt and a dialog lightbox", () => {
  const html = galleryHtml("FW26", [
    { url: "https://cdn/x-800.jpg", fullUrl: "https://cdn/x-2400.jpg", alt: "Look 1", credit: "A" },
  ]);
  assert.ok(html.includes('alt="Look 1"'));
  assert.ok(html.includes('href="https://cdn/x-2400.jpg"'));
  assert.ok(html.includes("<dialog"));
  assert.ok(html.includes("<figcaption>A</figcaption>"));
});
