/**
 * THE single source of truth for where each channel lives. Render apps,
 * the 301 map, and the conformance checker all import from here — a URL
 * scheme change is one edit, not three app audits.
 */
export type Channel = "press" | "studio" | "devblog";

export const CHANNEL_ORIGIN: Record<Channel, string> = {
  press: "https://remilia.org",
  studio: "https://remilia.com",
  devblog: "https://www.remilia.net",
};

export const CHANNEL_BASEPATH: Record<Channel, string> = {
  press: "/press",
  studio: "/a/studio",
  devblog: "/blog",
};

export const indexUrl = (c: Channel): string =>
  `${CHANNEL_ORIGIN[c]}${CHANNEL_BASEPATH[c]}`;

export const canonicalFor = (c: Channel, slug: string): string =>
  `${indexUrl(c)}/${slug}`;

export const rssUrl = (c: Channel): string => `${indexUrl(c)}/rss.xml`;

export const atomUrl = (c: Channel): string => `${indexUrl(c)}/atom.xml`;

export const sitemapUrl = (c: Channel): string => `${indexUrl(c)}/sitemap.xml`;

export const eventUrl = (slug: string): string =>
  `${indexUrl("studio")}/events/${slug}`;

/** Ghost cutover: legacy blog URL → new canonical (the per-slug 301 map). */
export const legacyRedirect = (c: Channel, slug: string): { from: string; to: string } => ({
  from: `https://blog.remilia.org/${slug}/`,
  to: canonicalFor(c, slug),
});
