import type { CurrentUser } from "sanity";

export type Channel = "press" | "studio" | "devblog";

export const CHANNELS: { title: string; value: Channel }[] = [
  { title: "Press (remilia.org/press)", value: "press" },
  { title: "Studio (remilia.com/a/studio)", value: "studio" },
  { title: "Devblog (remilia.net/blog)", value: "devblog" },
];

/**
 * Channel → editor emails. UI-level soft lock only (content-scoped roles are
 * Enterprise-only; API tokens bypass this). Empty list = channel open to all.
 * Admins always pass.
 */
const CHANNEL_EDITORS: Record<Channel, string[]> = {
  press: [],
  studio: [],
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
