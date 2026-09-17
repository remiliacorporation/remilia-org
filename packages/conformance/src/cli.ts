#!/usr/bin/env node

import {
  type Channel,
  CHANNEL_BASEPATH,
  CHANNEL_ORIGIN,
  indexUrl,
  isChannel,
} from "@remilia/seo";
import {
  audit404,
  auditArticleSemantics,
  auditDiscovery,
  auditAtom,
  auditFeedDiscovery,
  auditLlmsTxt,
  auditPage,
  auditIndexability,
  auditRobots,
  auditRss,
  auditSitemap,
  auditMarkup,
  auditComponents,
  auditStylesheet,
  auditDesignSystem,
} from "./audit";

const args = process.argv.slice(2);
const channelArg = args.find((a) => !a.startsWith("--"));
const baseFlag = args.indexOf("--base");
const base = baseFlag >= 0 ? args[baseFlag + 1]?.replace(/\/$/, "") : undefined;

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
  record(
    `${origin}/robots.txt`,
    auditRobots(await get(`${origin}/robots.txt`), channel),
  );

  const sitemapXml = await get(`${origin}${basePath}/sitemap.xml`);
  record("sitemap.xml", auditSitemap(sitemapXml, channel));
  const sitemapLocs = Array.from(
    sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/gi),
    (m) => m[1],
  );
  const empty = !sitemapLocs.some(
    (loc) =>
      loc.startsWith(`${CHANNEL_ORIGIN[channel]}${basePath}/`) &&
      !loc.endsWith(basePath),
  );

  record(
    "rss.xml",
    auditRss(await get(`${origin}${basePath}/rss.xml`), channel).filter(
      (e) => !(empty && e === "rss has no items"),
    ),
  );
  record(
    "atom.xml",
    auditAtom(await get(`${origin}${basePath}/atom.xml`), channel).filter(
      (e) => !(empty && e === "atom has no entries"),
    ),
  );
  record(
    "llms.txt",
    auditLlmsTxt(await get(`${origin}${basePath}/llms.txt`), channel),
  );

  const missing = await fetch(
    `${origin}${basePath}/this-page-does-not-exist-9f3a`,
    {
      redirect: "follow",
    },
  );
  const missingBody = await missing.text();
  record("404 behavior", [
    ...audit404(missing.status, missingBody),
    ...auditComponents(missingBody),
  ]);

  const md = await fetch(`${origin}${basePath}`, {
    headers: { accept: "text/markdown" },
    redirect: "follow",
  });
  if (!md.headers.get("content-type")?.includes("markdown"))
    console.warn(
      "note: no text/markdown content negotiation (bonus signal, not scored)",
    );

  const indexHtml = await get(`${origin}${basePath}`);
  record("index page", [
    ...auditPage(indexHtml, indexUrl(channel), empty ? 120 : 500),
    ...auditMarkup(indexHtml),
    ...auditComponents(indexHtml),
    ...auditIndexability(indexHtml, true),
    ...auditFeedDiscovery(indexHtml, channel),
    ...auditDiscovery(indexHtml, channel),
  ]);

  const sample = Array.from(
    sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/gi),
    (m) => m[1],
  ).find(
    (loc) =>
      loc.startsWith(`${CHANNEL_ORIGIN[channel]}${basePath}/`) &&
      !loc.endsWith(basePath),
  );
  if (sample) {
    const postUrl = base
      ? sample.replace(CHANNEL_ORIGIN[channel], origin)
      : sample;
    const postHtml = await get(postUrl);
    record(`post ${sample}`, [
      ...auditPage(postHtml, sample),
      ...auditMarkup(postHtml),
      ...auditComponents(postHtml),
      ...auditIndexability(postHtml, true),
      ...auditArticleSemantics(postHtml),
      ...auditDiscovery(postHtml, channel),
    ]);
  } else {
    console.warn("no post URL in sitemap yet — page-level post audit skipped");
  }

  const surface = (re: RegExp): string | undefined =>
    sitemapLocs.find((l) => re.test(l));
  const surfaces: [string, string | undefined][] = [
    ["tag directory", surface(new RegExp(`${basePath}/tags/?$`))],
    ["author directory", surface(new RegExp(`${basePath}/authors/?$`))],
    ["tag archive", surface(new RegExp(`${basePath}/tags/[^/]+/?$`))],
    ["author archive", surface(new RegExp(`${basePath}/authors/[^/]+/?$`))],
    ["pagination", surface(new RegExp(`${basePath}/page/\\d+/?$`))],
  ];
  for (const [what, loc] of surfaces) {
    if (!loc) {
      console.warn(`no ${what} URL in sitemap — surface audit skipped`);
      continue;
    }
    const url = base ? loc.replace(CHANNEL_ORIGIN[channel], origin) : loc;
    const html = await get(url);
    record(`${what} ${loc}`, [
      ...auditPage(html, loc, 200),
      ...auditMarkup(html),
      ...auditComponents(html),
      ...auditIndexability(html, true),
    ]);
  }

  const stylesheet = Array.from(indexHtml.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/gi), (m) => m[1])[0];
  if (stylesheet) {
    const css = await get(new URL(stylesheet, origin).href);
    record("stylesheet", [...auditStylesheet(css), ...auditDesignSystem(css)]);
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
