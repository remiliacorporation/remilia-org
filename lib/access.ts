import type { CurrentUser } from "sanity";

export type Channel =
  | "updates"
  | "press"
  | "thought"
  | "archive"
  | "devblog"
  | "news"
  | "events"
  | "dev-updates"
  | "dev-blog";

export const CHANNELS: { title: string; value: Channel }[] = [
  { title: "Updates (remilia.org/blog/updates)", value: "updates" },
  { title: "Press (remilia.org/blog/press)", value: "press" },
  { title: "Thought (remilia.org/blog/thought)", value: "thought" },
  { title: "Archive (remilia.org/blog/archive)", value: "archive" },
  { title: "Devblog (remilia.org/blog/devblog)", value: "devblog" },
  { title: "News (remilia.com/a/blog/news)", value: "news" },
  { title: "Events (remilia.com/a/blog/events)", value: "events" },
  { title: "Dev updates (retired, now Devblog)", value: "dev-updates" },
  { title: "Dev blog (retired, now Devblog)", value: "dev-blog" },
];

/**
 * blog.remilia.net's sections. Their posts moved to Devblog and the net site
 * only redirects, so a post filed here would show nowhere: the Section field
 * does not offer them.
 */
export const RETIRED_CHANNELS: Channel[] = ["dev-updates", "dev-blog"];

/** The sections a post can be filed under. */
export const SECTION_OPTIONS = CHANNELS.filter(
  (c) => !RETIRED_CHANNELS.includes(c.value),
);

export const CHANNEL_PATH_LABEL: Record<Channel, string> = {
  updates: "remilia.org/blog/updates",
  press: "remilia.org/blog/press",
  thought: "remilia.org/blog/thought",
  archive: "remilia.org/blog/archive",
  devblog: "remilia.org/blog/devblog",
  news: "remilia.com/a/blog/news",
  events: "remilia.com/a/blog/events",
  "dev-updates": "blog.remilia.net/updates",
  "dev-blog": "blog.remilia.net/dev-blog",
};

const CHANNEL_EDITORS: Record<Channel, string[]> = {
  updates: [],
  press: [],
  thought: [],
  archive: [],
  devblog: [],
  news: [],
  events: [],
  "dev-updates": [],
  "dev-blog": [],
};

export function canEditChannel(
  user: Omit<CurrentUser, "role"> | null,
  channel: Channel | undefined,
): boolean {
  if (!user || !channel) return true;
  if (user.roles?.some((r) => r.name === "administrator")) return true;
  const allowed = CHANNEL_EDITORS[channel];
  if (!allowed || allowed.length === 0) return true;
  return allowed.includes(user.email ?? "");
}
