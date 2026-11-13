/**
 * What the bake derives from a post's own fields, free of the bake's Node
 * imports, so the Studio's page editor derives the same from the same code.
 */
import type { PTBlock } from "./pt";

/**
 * The posts a section publishes. Production omits future posts; draft
 * previews pass `$includeFuture` so editors can review scheduled content.
 */
export const PUBLISHED_POSTS = `*[_type == "post" && channel == $channel && defined(publishedAt) && ($includeFuture || publishedAt <= now())]`;

export function postPlain(blocks: PTBlock[]): string {
  return blocks
    .flatMap((b) =>
      "children" in b && Array.isArray(b.children) ? b.children : [],
    )
    .map((s) =>
      s && typeof s === "object" && "text" in s ? String(s.text) : "",
    )
    .join("");
}

/**
 * Whole minutes at 200 words per minute, the figure most reading-time
 * estimates use. Returns undefined under a minute, where a label would say
 * less than the words it occupies.
 */
export function readingMinutes(plain: string): number | undefined {
  const words = plain.trim().split(/\s+/).filter(Boolean).length;
  if (words < 200) return undefined;
  return Math.round(words / 200);
}

/**
 * The outlet external coverage is credited to: its `outlet` field, or the
 * original's host name. Undefined for first-party posts.
 */
export function outletOf(p: {
  origin?: string;
  outlet?: string;
  externalUrl?: string;
}): string | undefined {
  if (p.origin !== "external") return undefined;
  const named = p.outlet?.trim();
  if (named) return named;
  try {
    return p.externalUrl
      ? new URL(p.externalUrl).hostname.replace(/^www\./, "")
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The name a post is bylined with. Coverage written elsewhere names its
 * outlet, never the author document it was filed under, who did not write
 * it.
 */
export function bylineOf(p: {
  origin?: string;
  outlet?: string;
  externalUrl?: string;
  authors?: { name: string }[];
}): string | undefined {
  if (p.origin === "external") return outletOf(p);
  return p.authors?.map((a) => a.name).join(", ") || undefined;
}

/** A post page's document title: the post's title, then its byline. */
export function postTitle(p: Parameters<typeof bylineOf>[0] & { title: string }): string {
  const by = bylineOf(p);
  return by ? `${p.title} — ${by}` : p.title;
}

/** The UTC calendar month a timestamp falls in, as `YYYY-MM`. */
export function monthKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
