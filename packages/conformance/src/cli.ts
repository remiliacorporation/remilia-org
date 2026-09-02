#!/usr/bin/env node
/**
 * Audits a live host against the SEO/LLM contract. CI gate for every
 * render app (post-deploy smoke, like reminet's deploy-docs smoke check).
 *
 *   seo-conformance <channel> [--base https://staging-host]
 *
 * Without --base, audits the production host for the channel. Discovers a
 * sample post from the sitemap, then audits: robots.txt, sitemap, RSS,
 * llms.txt, the index page, and the sample post page. Exit 1 on violations.
 */
import {
  type Channel,
  CHANNEL_BASEPATH,
  CHANNEL_ORIGIN,
  indexUrl,
} from "@remilia/seo";
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

const args = process.argv.slice(2);
const channelArg = args.find((a) => !a.startsWith("--"));
const baseFlag = args.indexOf("--base");
const base = baseFlag >= 0 ? args[baseFlag + 1]?.replace(/\/$/, "") : undefined;

function isChannel(v: string | undefined): v is Channel {
  return (
    v === "updates" ||
    v === "press" ||
    v === "thought" ||
    v === "archive" ||
    v === "news" ||
    v === "events" ||
    v === "dev-updates" ||
    v === "dev-blog"
  );
}
if (!isChannel(channelArg)) {
  console.error(
    "usage: seo-conformance <updates|press|thought|archive|news|events|dev-updates|dev-blog> [--base <origin>]",
  );
  process.exit(2);
}
const channel: Channel = channelArg;
const origin = base ?? CHANNEL_ORIGIN[channel];
const basePath = CHANNEL_BASEPATH[channel];

async function get(url: string): Promise<string> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  return res.text();
}

const failures: { where: string; errors: string[] }[] = [];
function record(where: string, errors: string[]): void {
  if (errors.length) failures.push({ where, errors });
}

try {
  record(`${origin}/robots.txt`, auditRobots(await get(`${origin}/robots.txt`), channel));

  const sitemapXml = await get(`${origin}${basePath}/sitemap.xml`);
  record("sitemap.xml", auditSitemap(sitemapXml, channel));

  record("rss.xml", auditRss(await get(`${origin}${basePath}/rss.xml`), channel));
  record("atom.xml", auditAtom(await get(`${origin}${basePath}/atom.xml`), channel));
  record("llms.txt", auditLlmsTxt(await get(`${origin}/llms.txt`), channel));

  const missing = await fetch(`${origin}${basePath}/this-page-does-not-exist-9f3a`, {
    redirect: "follow",
  });
  record("404 behavior", audit404(missing.status, await missing.text()));

  // Emerging bonus, warn-only: text/markdown content negotiation with Vary.
  const md = await fetch(`${origin}${basePath}`, {
    headers: { accept: "text/markdown" },
    redirect: "follow",
  });
  if (!md.headers.get("content-type")?.includes("markdown"))
    console.warn("note: no text/markdown content negotiation (bonus signal, not scored)");

  const indexHtml = await get(`${origin}${basePath}`);
  record("index page", [
    ...auditPage(indexHtml, indexUrl(channel)),
    ...auditIndexability(indexHtml, true),
    ...auditFeedDiscovery(indexHtml, channel),
  ]);

  // Sample the newest post URL out of the sitemap (any loc under the basepath that isn't the index).
  const sample = Array.from(sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/gi), (m) => m[1]).find(
    (loc) => loc.startsWith(`${CHANNEL_ORIGIN[channel]}${basePath}/`) && !loc.endsWith(basePath),
  );
  if (sample) {
    const postUrl = base ? sample.replace(CHANNEL_ORIGIN[channel], origin) : sample;
    const postHtml = await get(postUrl);
    record(`post ${sample}`, [
      ...auditPage(postHtml, sample),
      ...auditIndexability(postHtml, true),
      ...auditArticleSemantics(postHtml),
    ]);
  } else {
    console.warn("no post URL in sitemap yet — page-level post audit skipped");
  }
} catch (err) {
  failures.push({ where: "fetch", errors: [String(err)] });
}

if (failures.length) {
  for (const f of failures) {
    console.error(`✖ ${f.where}`);
    for (const e of f.errors) console.error(`    ${e}`);
  }
  process.exit(1);
}
console.log(`✓ ${channel} host conforms to the SEO/LLM contract`);
