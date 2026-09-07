import type { CurrentUser } from "sanity";

export type Channel =
  | "updates"
  | "press"
  | "thought"
  | "archive"
  | "news"
  | "events"
  | "dev-updates"
  | "dev-blog";

export const CHANNELS: { title: string; value: Channel }[] = [
  { title: "Updates (remilia.org/updates)", value: "updates" },
  { title: "Press (remilia.org/press)", value: "press" },
  { title: "Thought (remilia.org/thought)", value: "thought" },
  { title: "Archive (remilia.org/archive)", value: "archive" },
  { title: "News (remilia.com/a/news)", value: "news" },
  { title: "Events (remilia.com/a/events)", value: "events" },
  { title: "Dev updates (remilia.net/updates)", value: "dev-updates" },
  { title: "Dev blog (remilia.net/blog)", value: "dev-blog" },
];

export const CHANNEL_PATH_LABEL: Record<Channel, string> = {
  updates: "remilia.org/updates",
  press: "remilia.org/press",
  thought: "remilia.org/thought",
  archive: "remilia.org/archive",
  news: "remilia.com/a/news",
  events: "remilia.com/a/events",
  "dev-updates": "remilia.net/updates",
  "dev-blog": "remilia.net/blog",
};

const CHANNEL_EDITORS: Record<Channel, string[]> = {
  updates: [],
  press: [],
  thought: [],
  archive: [],
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
