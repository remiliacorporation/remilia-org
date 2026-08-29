/**
 * THE single source of truth for where each section lives. Render apps,
 * the 301 map, and the conformance checker all import from here — a URL
 * scheme change is one edit, not three app audits.
 *
 * Editors pick a section id; host + public path are derived. Schema id
 * `net-updates` avoids colliding with org `updates` in GROQ; both publish
 * at `/updates` on their own host.
 */
export type Channel =
  | "updates"
  | "press"
  | "thought"
  | "archive"
  | "news"
  | "net-updates"
  | "devblog";

export type HostId = "org" | "com" | "net";

export const CHANNELS: Channel[] = [
  "updates",
  "press",
  "thought",
  "archive",
  "news",
  "net-updates",
  "devblog",
];

export const isChannel = (v: string | undefined): v is Channel =>
  !!v && (CHANNELS as string[]).includes(v);

export const CHANNEL_ORIGIN: Record<Channel, string> = {
  updates: "https://remilia.org",
  press: "https://remilia.org",
  thought: "https://remilia.org",
  archive: "https://remilia.org",
  news: "https://remilia.com",
  "net-updates": "https://www.remilia.net",
  devblog: "https://www.remilia.net",
};

export const CHANNEL_BASEPATH: Record<Channel, string> = {
  updates: "/updates",
  press: "/press",
  thought: "/thought",
  archive: "/archive",
  news: "/a/news",
  "net-updates": "/updates",
  devblog: "/blog",
};

export const CHANNEL_HOST: Record<Channel, HostId> = {
  updates: "org",
  press: "org",
  thought: "org",
  archive: "org",
  news: "com",
  "net-updates": "net",
  devblog: "net",
};

/** Org post sections baked into remilia.org `deploy/`. */
export const ORG_SECTIONS: Channel[] = ["updates", "press", "thought", "archive"];

/** Com post section(s). Events are a separate document type on the same host. */
export const COM_POST_SECTIONS: Channel[] = ["news"];

/**
 * Full .com surface: news posts + events (and albums under events).
 * Events are `_type == "event"`, not a post `channel`.
 */
export const COM_SECTIONS = ["news", "events"] as const;
export type ComSection = (typeof COM_SECTIONS)[number];

/** Net post sections. */
export const NET_SECTIONS: Channel[] = ["net-updates", "devblog"];

/** Public host label for previews / Studio lists (no scheme). */
export const CHANNEL_PATH_LABEL: Record<Channel, string> = {
  updates: "remilia.org/updates",
  press: "remilia.org/press",
  thought: "remilia.org/thought",
  archive: "remilia.org/archive",
  news: "remilia.com/a/news",
  "net-updates": "remilia.net/updates",
  devblog: "remilia.net/blog",
};

/** .com events section label (document type `event`, path /a/events). */
export const EVENTS_PATH_LABEL = "remilia.com/a/events";

export const EVENTS_ORIGIN = "https://remilia.com";
export const EVENTS_BASEPATH = "/a/events";

export const indexUrl = (c: Channel): string =>
  `${CHANNEL_ORIGIN[c]}${CHANNEL_BASEPATH[c]}`;

export const canonicalFor = (c: Channel, slug: string): string =>
  `${indexUrl(c)}/${slug}`;

export const rssUrl = (c: Channel): string => `${indexUrl(c)}/rss.xml`;

export const atomUrl = (c: Channel): string => `${indexUrl(c)}/atom.xml`;

export const sitemapUrl = (c: Channel): string => `${indexUrl(c)}/sitemap.xml`;

export const eventUrl = (slug: string): string =>
  `${EVENTS_ORIGIN}${EVENTS_BASEPATH}/${slug}`;

export const eventsIndexUrl = (): string => `${EVENTS_ORIGIN}${EVENTS_BASEPATH}`;

/** Ghost cutover: legacy blog URL → new canonical (the per-slug 301 map). */
export const legacyRedirect = (c: Channel, slug: string): { from: string; to: string } => ({
  from: `https://blog.remilia.org/${slug}/`,
  to: canonicalFor(c, slug),
});

/** Retired Studio journal → News. */
export const STUDIO_TO_NEWS_REDIRECTS: { from: string; to: string }[] = [
  { from: "/a/studio", to: "/a/news" },
  { from: "/a/studio/", to: "/a/news/" },
  { from: "/a/studio/*", to: "/a/news/:splat" },
  { from: "/a/studio/events", to: "/a/events" },
  { from: "/a/studio/events/", to: "/a/events/" },
  { from: "/a/studio/events/*", to: "/a/events/:splat" },
];
