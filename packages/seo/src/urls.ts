export type Channel =
  | "updates"
  | "press"
  | "thought"
  | "archive"
  | "news"
  | "events"
  | "dev-updates"
  | "dev-blog"
  | "blog"
  | "com-blog"
  | "net-blog";

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
  "com-blog",
  "net-blog",
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
  "dev-updates": "https://blog.remilia.net",
  "dev-blog": "https://blog.remilia.net",
  blog: "https://remilia.org",
  "com-blog": "https://remilia.com",
  "net-blog": "https://blog.remilia.net",
};

export const CHANNEL_BASEPATH: Record<Channel, string> = {
  updates: "/blog/updates",
  press: "/blog/press",
  thought: "/blog/thought",
  archive: "/blog/archive",
  news: "/a/blog/news",
  events: "/a/blog/events",
  "dev-updates": "/updates",
  "dev-blog": "/dev-blog",
  blog: "/blog",
  "com-blog": "/a/blog",
  // blog.remilia.net is all blog: its pooled index is the site root.
  "net-blog": "",
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
  "com-blog": "com",
  "net-blog": "net",
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

/** Each host's pooled index: one listing over all of its sections. */
export const HOST_AGGREGATE: Record<HostId, Channel> = {
  org: "blog",
  com: "com-blog",
  net: "net-blog",
};

export const isAggregate = (c: Channel): boolean =>
  HOST_AGGREGATE[CHANNEL_HOST[c]] === c;

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
  news: "remilia.com/a/blog/news",
  events: "remilia.com/a/blog/events",
  "dev-updates": "blog.remilia.net/updates",
  "dev-blog": "blog.remilia.net/dev-blog",
  blog: "remilia.org/blog",
  "com-blog": "remilia.com/a/blog",
  "net-blog": "blog.remilia.net",
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
  "com-blog": "Blog",
  "net-blog": "Blog",
};

export const EVENTS_PATH_LABEL = CHANNEL_PATH_LABEL.events;

export const EVENTS_ORIGIN = CHANNEL_ORIGIN.events;
export const EVENTS_BASEPATH = CHANNEL_BASEPATH.events;

/** The path a link to a listing uses: its base path, or "/" at a site root. */
export const indexPath = (c: Channel): string => CHANNEL_BASEPATH[c] || "/";

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
  { from: "/a/studio", to: "/a/blog/news" },
  { from: "/a/studio/", to: "/a/blog/news/" },
  { from: "/a/studio/*", to: "/a/blog/news/:splat" },
  { from: "/a/studio/events", to: "/a/blog/events" },
  { from: "/a/studio/events/", to: "/a/blog/events/" },
  { from: "/a/studio/events/*", to: "/a/blog/events/:splat" },
];
