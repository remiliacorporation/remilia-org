/**
 * Route imported posts (all currently channel=press) onto the ratified
 * section map using Ghost tags + source + title heuristics.
 *
 *   SANITY_TOKEN=… pnpm --filter @remilia/hosts exec node --import tsx migrate-channels.ts
 *   SANITY_TOKEN=… pnpm --filter @remilia/hosts exec node --import tsx migrate-channels.ts --write
 *
 * Dry-run by default. Pass --write to patch. Only mutates docs still on
 * channel "press" (or pass --all to reclassify every post).
 */
import { createClient } from "@sanity/client";
import { pathToFileURL } from "node:url";
import type { Channel } from "@remilia/seo";

const write = process.argv.includes("--write");
const all = process.argv.includes("--all");
const token = process.env.SANITY_TOKEN ?? process.env.SANITY_API_WRITE_TOKEN;

type PostRow = {
  _id: string;
  title: string;
  slug: string;
  channel: string;
  tags: (string | null)[] | null;
  source: string | null;
  hrefs: (string | null)[] | null;
};

type Plan = {
  id: string;
  title: string;
  from: string;
  to: Channel;
  reason: string;
  origin?: "first-party" | "external";
  externalUrl?: string;
  outlet?: string;
};

const SOCIAL_HOSTS = new Set([
  "twitter.com",
  "x.com",
  "www.twitter.com",
  "instagram.com",
  "www.instagram.com",
  "t.co",
]);

function tagSet(tags: (string | null)[] | null): Set<string> {
  return new Set((tags ?? []).filter((t): t is string => !!t));
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isRemiliaHost(url: string): boolean {
  const h = hostOf(url);
  return (
    h === "remilia.org" ||
    h.endsWith(".remilia.org") ||
    h === "remilia.com" ||
    h.endsWith(".remilia.com") ||
    h === "remilia.net" ||
    h.endsWith(".remilia.net") ||
    h === "www.remilia.net"
  );
}

function outletHostHint(outlet: string | undefined): string {
  if (!outlet) return "";
  return outlet.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Prefer outlet-matching / article URLs over wire homepages / social. */
function pickExternalUrl(
  hrefs: (string | null)[] | null,
  outlet?: string,
): string | undefined {
  const urls = (hrefs ?? []).filter(
    (h): h is string => !!h && h.startsWith("http") && !isRemiliaHost(h),
  );
  if (!urls.length) return undefined;
  const hint = outletHostHint(outlet);
  const scored = urls.map((u) => {
    const host = hostOf(u);
    const hostKey = host.replace(/[^a-z0-9]/g, "");
    let score = 0;
    try {
      const path = new URL(u).pathname.replace(/\/$/, "");
      if (path.split("/").filter(Boolean).length >= 2) score += 3;
      else if (path && path !== "/") score += 1;
    } catch {
      /* ignore */
    }
    if (hint && hint.length >= 4) {
      // "Palladium Magazine" → palladiummag; "The Spectator US" → spectator
      const stem = hint.slice(0, Math.min(10, hint.length));
      if (hostKey.includes(stem.slice(0, 6)) || stem.includes(hostKey.slice(0, 6))) score += 8;
    }
    if (SOCIAL_HOSTS.has(host)) score -= 5;
    if (
      host.includes("businesswire") ||
      host.includes("globenewswire") ||
      host.includes("issuewire") ||
      host.includes("politico") ||
      host.includes("youtube") ||
      host.includes("reddit") ||
      host.includes("wikipedia")
    )
      score -= 2;
    return { u, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.u;
}

function parseOutlet(title: string): string | undefined {
  const patterns: RegExp[] = [
    /^(?:Feature|News|Interview):\s*(.+?)\s+[-–—]\s+/i,
    /^Cultural Coverage:\s*(.+?)\s+(?:Explores|Features)/i,
    /^Event Coverage:\s*(.+?)\s+Reports/i,
    /^Thought Leadership:\s*(.+?)\s+Features/i,
  ];
  for (const re of patterns) {
    const m = title.match(re);
    if (m?.[1]) return m[1].trim();
  }
  return undefined;
}

function isExternalCoverage(title: string, tags: Set<string>): boolean {
  if (tags.has("Interview")) return true;
  if (/^(Feature|News|Interview|Cultural Coverage|Event Coverage|Thought Leadership):/i.test(title))
    return true;
  // Press + Feature without Press Release = usually external cite
  if (tags.has("Press") && tags.has("Feature") && !tags.has("Press Release")) return true;
  return false;
}

function isPressRelease(title: string, tags: Set<string>): boolean {
  if (tags.has("Press Release")) return true;
  if (/^Press Release:/i.test(title)) return true;
  return false;
}

const THOUGHT_ANNOUNCEMENTS = new Set([
  "what-remilia-believes-in-a-new-net-art-manifesto",
  "can-whats-playing-milady-make-it-to-level-2",
  "external-memo-7-12-22-where-are-the-art-critics",
]);

export function classify(p: PostRow): Plan {
  const tags = tagSet(p.tags);
  const title = p.title ?? "";
  const slug = p.slug ?? "";
  const source = p.source ?? "";

  const base = { id: p._id, title, from: p.channel };

  // 1. Events
  if (tags.has("Events")) {
    return { ...base, to: "events", reason: "tag:Events" };
  }

  // 2. Announcements → updates (a few essays → thought). Before RemiliaNET
  // title matching so "… on RemiliaNET" event promos stay org updates.
  if (tags.has("Announcements")) {
    if (THOUGHT_ANNOUNCEMENTS.has(slug)) {
      return { ...base, to: "thought", reason: "announcement that is longform/position" };
    }
    return { ...base, to: "updates", reason: "tag:Announcements" };
  }

  // 3. RemiliaNET product / eng (title must lead with RemiliaNET / Alpha)
  if (/^RemiliaNET\b/i.test(title) || /RemiliaNET Alpha/i.test(title)) {
    if (/api|developer portal/i.test(title)) {
      return { ...base, to: "devblog", reason: "RemiliaNET API / developer portal" };
    }
    return { ...base, to: "dev-updates", reason: "RemiliaNET product update" };
  }
  if (/vault architecture/i.test(title)) {
    return { ...base, to: "dev-updates", reason: "network architecture note" };
  }

  // 4. First-party press releases
  if (isPressRelease(title, tags)) {
    return { ...base, to: "press", reason: "press release" };
  }

  // 5. External coverage → archive
  if (isExternalCoverage(title, tags)) {
    const outlet = parseOutlet(title);
    const externalUrl = pickExternalUrl(p.hrefs, outlet);
    return {
      ...base,
      to: "archive",
      reason: "external coverage / interview",
      origin: "external",
      externalUrl,
      outlet,
    };
  }

  // 6. Explicit thought / note / review / guide
  if (tags.has("Thought") || tags.has("Note") || tags.has("Review") || tags.has("Guide")) {
    return { ...base, to: "thought", reason: `tag:${[...tags].filter((t) => ["Thought", "Note", "Review", "Guide"].includes(t)).join(",")}` };
  }

  // 7. Remaining Project / NFT essays
  if (tags.has("Project") || tags.has("NFT")) {
    return { ...base, to: "thought", reason: tags.has("Project") ? "tag:Project essay" : "tag:NFT essay" };
  }

  // 8. Feature alone (e.g. RemiliaNET API already handled) → thought
  if (tags.has("Feature")) {
    return { ...base, to: "thought", reason: "tag:Feature first-party" };
  }

  // 9. Imported essays
  if (source === "paragraph" || source === "substack") {
    return { ...base, to: "thought", reason: `source:${source}` };
  }

  // 10. Untagged ghost leftovers
  if (source === "ghost") {
    return { ...base, to: "thought", reason: "untagged ghost → thought" };
  }

  return { ...base, to: "press", reason: "fallback (unchanged)" };
}

async function main() {
  const client = createClient({
    projectId: "8x9419lh",
    dataset: "production",
    apiVersion: "2026-02-01",
    token: token || undefined,
    useCdn: false,
  });

  const filter = all
    ? `*[_type == "post"]`
    : `*[_type == "post" && channel == "press"]`;

  const rows = await client.fetch<PostRow[]>(
    `${filter}{
      _id, title, "slug": slug.current, channel,
      "tags": tags[]->name,
      "source": migration.source,
      "hrefs": body[].markDefs[].href
    } | order(publishedAt desc)`,
  );

  const plans = rows.map(classify);
  const byChannel = new Map<string, number>();
  for (const p of plans) byChannel.set(p.to, (byChannel.get(p.to) ?? 0) + 1);

  console.log(`classified ${plans.length} posts${all ? " (--all)" : " (channel=press only)"}`);
  console.log(
    "by section:",
    [...byChannel.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k}=${v}`)
      .join("  "),
  );
  console.log("");

  for (const p of plans) {
    if (p.from === p.to && p.to !== "archive") continue;
    const extra =
      p.to === "archive"
        ? ` origin=${p.origin ?? "?"} outlet=${p.outlet ?? "?"} url=${p.externalUrl ?? "MISSING"}`
        : "";
    console.log(`${p.from} → ${p.to.padEnd(12)} ${p.reason.padEnd(42)} ${p.title.slice(0, 70)}${extra}`);
  }

  const archiveMissing = plans.filter(
    (p) => p.to === "archive" && p.origin === "external" && (!p.externalUrl || !p.outlet),
  );
  if (archiveMissing.length) {
    console.log(`\nwarning: ${archiveMissing.length} archive rows missing outlet and/or externalUrl`);
    for (const p of archiveMissing) {
      console.log(`  ${p.id} outlet=${p.outlet ?? "?"} url=${p.externalUrl ?? "?"}`);
    }
  }

  if (!write) {
    console.log("\ndry-run; pass --write (and SANITY_TOKEN) to apply");
    return;
  }
  if (!token) {
    console.error("Set SANITY_TOKEN (write) to migrate.");
    process.exit(1);
  }

  // Sanity transactions max out; batch in chunks.
  const CHUNK = 80;
  let patched = 0;
  for (let i = 0; i < plans.length; i += CHUNK) {
    const chunk = plans.slice(i, i + CHUNK);
    const tx = client.transaction();
    for (const p of chunk) {
      if (p.from === p.to && p.to !== "archive") continue;
      const set: Record<string, unknown> = { channel: p.to };
      if (p.to === "archive") {
        if (p.origin) set.origin = p.origin;
        if (p.externalUrl) set.externalUrl = p.externalUrl;
        if (p.outlet) set.outlet = p.outlet;
      } else {
        tx.patch(p.id, {
          set,
          unset: ["origin", "externalUrl", "outlet", "commentary"],
        });
        patched++;
        continue;
      }
      tx.patch(p.id, { set });
      patched++;
    }
    await tx.commit();
  }
  console.log(`\npatched ${patched} docs`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
