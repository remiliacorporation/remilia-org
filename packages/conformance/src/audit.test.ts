import { test } from "node:test";
import assert from "node:assert/strict";
import { atom, feedLinks, rss, sitemap, llmsTxt } from "@remilia/seo";
import {
  audit404,
  auditArticleSemantics,
  auditAtom,
  auditFeedDiscovery,
  auditLlmsTxt,
  auditPage,
  auditIndexability,
  auditRobots,
  auditRss,
  auditSitemap,
} from "./audit";

const BODY_TEXT = "How vaults work on RemiliaNET, in enough detail that an agent without JavaScript still reads real content. ".repeat(6);
const GOOD_PAGE = `<!doctype html><html><head>
<title>Vaults — RemiliaNET Devblog</title>
<meta name="description" content="How vaults work.">
<link rel="canonical" href="https://www.remilia.net/blog/vaults">
<meta property="og:url" content="https://www.remilia.net/blog/vaults">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"BlogPosting","headline":"Vaults"}</script>
</head><body><h1>Vaults</h1><p>${BODY_TEXT}</p></body></html>`;

test("auditPage passes a conforming page", () => {
  assert.deepEqual(auditPage(GOOD_PAGE, "https://www.remilia.net/blog/vaults"), []);
});

test("auditPage catches missing/duplicate/wrong signals", () => {
  const wrongCanonical = auditPage(GOOD_PAGE, "https://www.remilia.net/blog/other");
  assert.ok(wrongCanonical.some((e) => e.includes("canonical is")));

  const noLd = auditPage(GOOD_PAGE.replace(/<script[\s\S]*?<\/script>/, ""), "https://www.remilia.net/blog/vaults");
  assert.ok(noLd.includes("no JSON-LD <script> found"));

  const noH1 = auditPage(GOOD_PAGE.replace("<h1>Vaults</h1>", ""), "https://www.remilia.net/blog/vaults");
  assert.ok(noH1.some((e) => e.includes("<h1>")));

  const thin = auditPage(GOOD_PAGE.replace(BODY_TEXT, "ok"), "https://www.remilia.net/blog/vaults");
  assert.ok(thin.some((e) => e.includes("no-JS text content")));

  const twoTitles = auditPage(GOOD_PAGE.replace("</head>", "<title>x</title></head>"), "https://www.remilia.net/blog/vaults");
  assert.ok(twoTitles.some((e) => e.includes("exactly one <title>")));

  const vercelCanonical = auditPage(
    GOOD_PAGE.replaceAll("https://www.remilia.net/blog/vaults", "https://x.vercel.app/blog/vaults"),
    "https://x.vercel.app/blog/vaults",
  );
  assert.ok(vercelCanonical.some((e) => e.includes("vercel.app")));
});

test("auditIndexability enforces both directions", () => {
  assert.deepEqual(auditIndexability(GOOD_PAGE, true), []);
  assert.ok(auditIndexability(GOOD_PAGE, false).length === 1);
  const noindexed = GOOD_PAGE.replace("</head>", '<meta name="robots" content="noindex"></head>');
  assert.ok(auditIndexability(noindexed, true).length === 1);
  assert.deepEqual(auditIndexability(noindexed, false), []);
});

const POSTS = [
  { channel: "devblog" as const, slug: "vaults", title: "Vaults", excerpt: "e", publishedAt: "2026-08-01T00:00:00Z" },
];

test("generated feeds pass their own audits (generator ↔ auditor lockstep)", () => {
  const rssXml = rss({ channel: "devblog", title: "Devblog", description: "d" }, POSTS);
  assert.deepEqual(auditRss(rssXml, "devblog"), []);

  const atomXml = atom({ channel: "devblog", title: "Devblog", description: "d" }, POSTS);
  assert.deepEqual(auditAtom(atomXml, "devblog"), []);

  const head = feedLinks({ channel: "devblog", title: "Devblog", description: "d" });
  assert.deepEqual(auditFeedDiscovery(`<head>${head}</head>`, "devblog"), []);

  const sitemapXml = sitemap([{ loc: "https://www.remilia.net/blog/vaults", lastmod: "2026-08-01" }]);
  assert.deepEqual(auditSitemap(sitemapXml, "devblog"), []);

  const llms = llmsTxt({
    hostTitle: "RemiliaNET",
    lead: "Product notes.",
    channel: "devblog",
    channelLabel: "Devblog",
    whenToUse: ["Cite RemiliaNET engineering decisions, changelogs, and vault mechanics."],
    posts: POSTS,
    citeElsewhere: [
      { label: "Remilia Corporation (wiki)", url: "https://wiki.remilia.org/Remilia_Corporation" },
      { label: "Press", url: "https://remilia.org/press" },
    ],
  });
  assert.deepEqual(auditLlmsTxt(llms, "devblog"), []);
});

test("feed discovery and article semantics catch omissions", () => {
  assert.ok(auditFeedDiscovery("<head></head>", "devblog").length === 2);

  const article = `<main><article><h1>V</h1><time datetime="2026-08-01">Aug 1</time></article></main>`;
  assert.deepEqual(auditArticleSemantics(article), []);
  assert.ok(auditArticleSemantics("<main><h1>V</h1></main>").some((e) => e.includes("<article>")));
  assert.ok(auditArticleSemantics("<article>x</article>").some((e) => e.includes("<time")));
});

test("audits reject cross-host leaks", () => {
  const leakySitemap = sitemap([{ loc: "https://remilia.org/press/launch" }]);
  assert.ok(auditSitemap(leakySitemap, "devblog").some((e) => e.includes("foreign host")));

  const leakyLlms = "# X\nwiki.remilia.org\n- [post](https://remilia.org/press/launch)";
  assert.ok(auditLlmsTxt(leakyLlms, "devblog").some((e) => e.includes("foreign-host")));
});

test("audit404 rejects soft-404s and bare 404 bodies", () => {
  assert.ok(audit404(200, "app shell").some((e) => e.includes("soft-404")));
  assert.ok(audit404(404, "gone").some((e) => e.includes("sitemap")));
  assert.deepEqual(audit404(404, "Not found. See /blog/sitemap.xml or /llms.txt"), []);
  assert.deepEqual(audit404(410, "Gone. Index: /llms.txt"), []);
});

test("auditRobots requires the channel sitemap line", () => {
  assert.deepEqual(
    auditRobots("User-agent: *\nSitemap: https://www.remilia.net/blog/sitemap.xml", "devblog"),
    [],
  );
  assert.ok(auditRobots("User-agent: *", "devblog").length === 1);
});
