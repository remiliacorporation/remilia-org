export type Channel =
  | "updates"
  | "press"
  | "thought"
  | "archive"
  | "news"
  | "events"
  | "dev-updates"
  | "dev-blog"
  | "blog";

export type HostId = "org" | "com" | "net";

export const CHANNELS: Channel[] = [
  "updates",
  "press",
  "thought",
  "archive",
  "news",
  "events",
  "dev-updates",
  "dev-blog",
  "blog",
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
  "dev-updates": "https://www.remilia.net",
  "dev-blog": "https://www.remilia.net",
  blog: "https://remilia.org",
};

export const CHANNEL_BASEPATH: Record<Channel, string> = {
  updates: "/blog/updates",
  press: "/blog/press",
  thought: "/blog/thought",
  archive: "/blog/archive",
  news: "/a/news",
  events: "/a/events",
  "dev-updates": "/updates",
  "dev-blog": "/blog",
  blog: "/blog",
};

export const CHANNEL_HOST: Record<Channel, HostId> = {
  updates: "org",
  press: "org",
  thought: "org",
  archive: "org",
  news: "com",
  events: "com",
  "dev-updates": "net",
  "dev-blog": "net",
  blog: "org",
};

export const ORG_SECTIONS: Channel[] = [
  "updates",
  "press",
  "thought",
  "archive",
];

export const COM_POST_SECTIONS: Channel[] = ["news", "events"];

export const COM_SECTIONS = ["news", "events"] as const;
export type ComSection = (typeof COM_SECTIONS)[number];

export const NET_SECTIONS: Channel[] = ["dev-updates", "dev-blog"];

/** The post sections each host serves — the blog's categories. */
export const HOST_SECTIONS: Record<HostId, Channel[]> = {
  org: ORG_SECTIONS,
  com: [...COM_SECTIONS],
  net: NET_SECTIONS,
};

export const CHANNEL_PATH_LABEL: Record<Channel, string> = {
  updates: "remilia.org/blog/updates",
  press: "remilia.org/blog/press",
  thought: "remilia.org/blog/thought",
  archive: "remilia.org/blog/archive",
  news: "remilia.com/a/news",
  events: "remilia.com/a/events",
  "dev-updates": "remilia.net/updates",
  "dev-blog": "remilia.net/blog",
  blog: "remilia.org/blog",
};

/** Short display name — the index card and byline category. */
export const CHANNEL_LABEL: Record<Channel, string> = {
  updates: "Updates",
  press: "Press",
  thought: "Thought",
  archive: "Archive",
  news: "News",
  events: "Events",
  "dev-updates": "Updates",
  "dev-blog": "Dev blog",
  blog: "Blog",
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

export const eventUrl = (slug: string): string => canonicalFor("events", slug);

export const eventsIndexUrl = (): string => indexUrl("events");

export const legacyRedirect = (
  c: Channel,
  slug: string,
): { from: string; to: string } => ({
  from: `https://blog.remilia.org/${slug}/`,
  to: canonicalFor(c, slug),
});

export const STUDIO_TO_NEWS_REDIRECTS: { from: string; to: string }[] = [
  { from: "/a/studio", to: "/a/news" },
  { from: "/a/studio/", to: "/a/news/" },
  { from: "/a/studio/*", to: "/a/news/:splat" },
  { from: "/a/studio/events", to: "/a/events" },
  { from: "/a/studio/events/", to: "/a/events/" },
  { from: "/a/studio/events/*", to: "/a/events/:splat" },
];
