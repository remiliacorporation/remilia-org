import type { CurrentUser } from "sanity";

/**
 * Section ids (field still named `channel` on post docs). Host + public path
 * are derived — see `@remilia/seo` CHANNEL_* maps. `net-updates` is the schema
 * id for remilia.net/updates so GROQ never confuses it with org `updates`.
 */
export type Channel =
  | "updates"
  | "press"
  | "thought"
  | "archive"
  | "news"
  | "events"
  | "net-updates"
  | "devblog";

export const CHANNELS: { title: string; value: Channel }[] = [
  { title: "Updates (remilia.org/updates)", value: "updates" },
  { title: "Press (remilia.org/press)", value: "press" },
  { title: "Thought (remilia.org/thought)", value: "thought" },
  { title: "Archive (remilia.org/archive)", value: "archive" },
  { title: "News (remilia.com/a/news)", value: "news" },
  { title: "Events (remilia.com/a/events)", value: "events" },
  { title: "Updates — Net (remilia.net/updates)", value: "net-updates" },
  { title: "Devblog (remilia.net/blog)", value: "devblog" },
];

export const CHANNEL_PATH_LABEL: Record<Channel, string> = {
  updates: "remilia.org/updates",
  press: "remilia.org/press",
  thought: "remilia.org/thought",
  archive: "remilia.org/archive",
  news: "remilia.com/a/news",
  events: "remilia.com/a/events",
  "net-updates": "remilia.net/updates",
  devblog: "remilia.net/blog",
};

/**
 * Section → editor emails. UI-level soft lock only (content-scoped roles are
 * Enterprise-only; API tokens bypass this). Empty list = section open to all.
 * Admins always pass. Soft-lock seats stay sane when desks filter by host.
 */
const CHANNEL_EDITORS: Record<Channel, string[]> = {
  updates: [],
  press: [],
  thought: [],
  archive: [],
  news: [],
  events: [],
  "net-updates": [],
  devblog: [],
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
