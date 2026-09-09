import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CHANNELS,
  CHANNEL_BASEPATH,
  CHANNEL_ORIGIN,
  breadcrumbs,
  canonicalFor,
  indexUrl,
  siteMetaFor,
  sitemapUrl,
} from "@remilia/seo";
import { htmlPage, articleHtml, type Chrome } from "./page";
import { auditDiscovery, auditPage } from "../../conformance/src/audit";

const chromeFor = (basePath: string): Chrome => ({
  stylesheet: `${basePath}/blog.css`,
  header: `<header><nav><a href="${basePath}">Index</a></nav></header>`,
  footer: `<footer><p>Remilia Corporation</p></footer>`,
});

const postPage = (channel: (typeof CHANNELS)[number]): string => {
  const canonical = canonicalFor(channel, "a-post");
  return htmlPage({
    title: "A post",
    description: "A post that exists on every host.",
    canonical,
    channel,
    publishedTime: "2026-08-01T00:00:00Z",
    modifiedTime: "2026-08-01T00:00:00Z",
    alternates: [
      {
        type: "text/markdown",
        title: "A post (Markdown)",
        href: `${CHANNEL_BASEPATH[channel]}/a-post.md`,
      },
    ],
    jsonld: [
      { "@context": "https://schema.org", "@type": "BlogPosting", headline: "A post" },
      breadcrumbs(canonical, [
        { name: siteMetaFor(channel).name, url: `${siteMetaFor(channel).origin}/` },
        { name: "Section", url: indexUrl(channel) },
        { name: "A post", url: canonical },
      ]),
    ],
    chrome: chromeFor(CHANNEL_BASEPATH[channel]),
    mainHtml: articleHtml({
      title: "A post",
      publishedAt: "2026-08-01T00:00:00Z",
      canonical,
      bodyHtml: `<p>${"Body text that is long enough to audit. ".repeat(20)}</p>`,
    }),
  });
};

for (const channel of CHANNELS) {
  test(`${channel} pages are anchored to their own host`, () => {
    const html = postPage(channel);
    const canonical = canonicalFor(channel, "a-post");

    assert.deepEqual(auditPage(html, canonical), []);
    assert.deepEqual(auditDiscovery(html, channel), []);

    assert.ok(canonical.startsWith(CHANNEL_ORIGIN[channel]));
    assert.ok(
      html.includes(`<link rel="canonical" href="${canonical}">`),
      `canonical is not on ${CHANNEL_ORIGIN[channel]}`,
    );
    assert.ok(
      html.includes(`href="${sitemapUrl(channel)}"`),
      `sitemap link is not on ${CHANNEL_ORIGIN[channel]}`,
    );
    assert.ok(
      html.includes(
        `<link rel="home" href="${siteMetaFor(channel).origin}/">`,
      ),
      `home link is not on ${CHANNEL_ORIGIN[channel]}`,
    );
    assert.ok(
      html.includes(
        `<link rel="stylesheet" href="${CHANNEL_BASEPATH[channel]}/blog.css">`,
      ),
      "stylesheet is not section-relative",
    );
  });
}

test("every channel resolves to the host that serves it", () => {
  for (const channel of CHANNELS) {
    const site = siteMetaFor(channel);
    assert.equal(
      site.origin,
      CHANNEL_ORIGIN[channel],
      `${channel}: site origin ${site.origin} does not serve ${CHANNEL_ORIGIN[channel]}`,
    );
  }
});
