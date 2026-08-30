/**
 * THE single source of truth for where each section lives. Render apps,
 * the 301 map, and the conformance checker all import from here — a URL
 * scheme change is one edit, not three app audits.
 *
 * Editors pick a section id; host + public path are derived. Schema id
 * `devupdates` avoids colliding with org `updates` in GROQ; both publish
 * at `/updates` on their own host.
 *
 * .com events are blog-style posts (describe + gallery), same shape as
 * Ghost blog.remilia.org writeups — not a separate “shows” surface.
 */
export type Channel =
  | "updates"
  | "press"
  | "thought"
  | "archive"
  | "news"
  | "events"
  | "devupdates"
  | "devblog";

export type HostId = "org" | "com" | "net";

export const CHANNELS: Channel[] = [
  "updates",
  "press",
  "thought",
  "archive",
  "news",
  "events",
  "devupdates",
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
  events: "https://remilia.com",
  "devupdates": "https://www.remilia.net",
  devblog: "https://www.remilia.net",
};

export const CHANNEL_BASEPATH: Record<Channel, string> = {
  updates: "/updates",
  press: "/press",
  thought: "/thought",
  archive: "/archive",
  news: "/a/news",
  events: "/a/events",
  "devupdates": "/updates",
  devblog: "/blog",
};

export const CHANNEL_HOST: Record<Channel, HostId> = {
  updates: "org",
  press: "org",
  thought: "org",
  archive: "org",
  news: "com",
  events: "com",
  "devupdates": "net",
  devblog: "net",
};

/** Org post sections baked into remilia.org `deploy/`. */
export const ORG_SECTIONS: Channel[] = ["updates", "press", "thought", "archive"];

/** Com post sections — news + events (events = describe + gallery). */
export const COM_POST_SECTIONS: Channel[] = ["news", "events"];

export const COM_SECTIONS = ["news", "events"] as const;
export type ComSection = (typeof COM_SECTIONS)[number];

/** Net post sections. */
export const NET_SECTIONS: Channel[] = ["devupdates", "devblog"];

/** Public host label for previews / Studio lists (no scheme). */
export const CHANNEL_PATH_LABEL: Record<Channel, string> = {
  updates: "remilia.org/updates",
  press: "remilia.org/press",
  thought: "remilia.org/thought",
  archive: "remilia.org/archive",
  news: "remilia.com/a/news",
  events: "remilia.com/a/events",
  "devupdates": "remilia.net/updates",
  devblog: "remilia.net/blog",
};

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

/** Event post URL — events are posts at /a/events/<slug>. */
export const eventUrl = (slug: string): string => canonicalFor("events", slug);

export const eventsIndexUrl = (): string => indexUrl("events");

/** Ghost cutover: legacy blog URL → new canonical (the per-slug 301 map). */
export const legacyRedirect = (c: Channel, slug: string): { from: string; to: string } => ({
  from: `https://blog.remilia.org/${slug}/`,
  to: canonicalFor(c, slug),
});

/** Retired Studio journal → News; nested studio events → Events posts. */
export const STUDIO_TO_NEWS_REDIRECTS: { from: string; to: string }[] = [
  { from: "/a/studio", to: "/a/news" },
  { from: "/a/studio/", to: "/a/news/" },
  { from: "/a/studio/*", to: "/a/news/:splat" },
  { from: "/a/studio/events", to: "/a/events" },
  { from: "/a/studio/events/", to: "/a/events/" },
  { from: "/a/studio/events/*", to: "/a/events/:splat" },
];
