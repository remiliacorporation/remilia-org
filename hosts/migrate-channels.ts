/**
 * Route posts onto host missions using Ghost tags + source + title heuristics.
 *
 * Host missions (ratified):
 *   .org  — theory + NFTs (thought), press (releases + coverage), small updates
 *   .com  — fashion / lifestyle brand / publishing (news), events
 *   .net  — software outside NFTs: RemiliaNET, wiki, miladychan (dev-updates / dev-blog)
 *
 *   SANITY_TOKEN=… pnpm --filter @remilia/hosts exec node --import tsx migrate-channels.ts --all
 *   SANITY_TOKEN=… pnpm --filter @remilia/hosts exec node --import tsx migrate-channels.ts --all --write
 *
 * Dry-run by default. Pass --write to patch. Default scope is channel=press
 * leftovers; pass --all to reclassify every post.
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
};

function tagSet(tags: (string | null)[] | null): Set<string> {
  return new Set((tags ?? []).filter((t): t is string => !!t));
}

function isExternalCoverage(title: string, tags: Set<string>): boolean {
  if (tags.has("Interview")) return true;
  if (/^(Feature|News|Interview|Cultural Coverage|Event Coverage|Thought Leadership):/i.test(title))
    return true;
  if (tags.has("Press") && tags.has("Feature") && !tags.has("Press Release")) return true;
  return false;
}

function isPressRelease(title: string, tags: Set<string>): boolean {
  if (tags.has("Press Release")) return true;
  if (/^Press Release:/i.test(title)) return true;
  return false;
}

/** .net software surfaces (not NFT theory). */
function isNetSoftware(title: string, slug: string): boolean {
  if (/^RemiliaNET\b/i.test(title) || /RemiliaNET Alpha/i.test(title)) return true;
  if (/vault architecture/i.test(title)) return true;
  if (/miladychan/i.test(title) || /miladychan/i.test(slug)) return true;
  if (/remilia wiki/i.test(title) || slug === "remilia-wiki-launch") return true;
  // Product moments hosted on RemiliaNET / MiladyCraft
  if (/remilianet/i.test(title) && /miladycraft/i.test(title)) return true;
  return false;
}

/** .com fashion / lifestyle brand / publishing. */
function isComNews(title: string, slug: string, source: string): boolean {
  // Goldenlight Substack = lifestyle / brand journal
  if (source === "substack") return true;
  // Publishing launches
  if (/exegesis/i.test(title) || /exegesis/i.test(slug)) return true;
  if (/pre-release announcement/i.test(title) && /miya|exegesis|book|manuscript/i.test(title))
    return true;
  return false;
}

const THOUGHT_ANNOUNCEMENTS = new Set([
  "what-remilia-believes-in-a-new-net-art-manifesto",
  "can-whats-playing-milady-make-it-to-level-2",
  "external-memo-7-12-22-where-are-the-art-critics",
  "authorship-hashes",
]);

export function classify(p: PostRow): Plan {
  const tags = tagSet(p.tags);
  const title = p.title ?? "";
  const slug = p.slug ?? "";
  const source = p.source ?? "";

  const base = { id: p._id, title, from: p.channel };

  // 1. Events (.com)
  if (tags.has("Events")) {
    return { ...base, to: "events", reason: "tag:Events" };
  }

  // 2. .net software — RemiliaNET, wiki, miladychan, vault
  if (isNetSoftware(title, slug)) {
    if (/api|developer portal/i.test(title)) {
      return { ...base, to: "dev-blog", reason: "RemiliaNET API / developer portal" };
    }
    return { ...base, to: "dev-updates", reason: "net software (RemiliaNET / wiki / miladychan)" };
  }

  // 3. Press — first-party releases + external coverage (Decrypt, etc.)
  if (isPressRelease(title, tags)) {
    return { ...base, to: "press", reason: "press release" };
  }
  if (isExternalCoverage(title, tags) || tags.has("Press")) {
    return { ...base, to: "press", reason: "press coverage / interview" };
  }

  // 4. .com news — fashion, lifestyle brand, publishing
  if (isComNews(title, slug, source)) {
    return { ...base, to: "news", reason: "fashion / lifestyle / publishing" };
  }

  // 5. .org thought — theory + NFTs
  if (tags.has("Thought") || tags.has("Note") || tags.has("Review") || tags.has("NFT")) {
    return {
      ...base,
      to: "thought",
      reason: `theory/NFT (${[...tags].filter((t) => ["Thought", "Note", "Review", "NFT"].includes(t)).join(",") || "tag"})`,
    };
  }
  if (tags.has("Project") || tags.has("Guide") || tags.has("Feature")) {
    return { ...base, to: "thought", reason: "theory / design essay" };
  }
  if (source === "paragraph") {
    return { ...base, to: "thought", reason: "source:paragraph (theory)" };
  }
  if (THOUGHT_ANNOUNCEMENTS.has(slug)) {
    return { ...base, to: "thought", reason: "longform / theory announcement" };
  }

  // 6. Remaining announcements → org updates
  if (tags.has("Announcements")) {
    return { ...base, to: "updates", reason: "tag:Announcements" };
  }

  // 7. Untagged ghost leftovers → thought (theory default on .org)
  if (source === "ghost") {
    return { ...base, to: "thought", reason: "untagged ghost → thought" };
  }

  return { ...base, to: "thought", reason: "fallback → thought" };
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

  let moves = 0;
  for (const p of plans) {
    if (p.from === p.to) continue;
    moves++;
    console.log(`${p.from} → ${p.to.padEnd(12)} ${p.reason.padEnd(48)} ${p.title.slice(0, 70)}`);
  }
  console.log(`\n${moves} moves (${plans.length - moves} unchanged)`);

  if (!write) {
    console.log("dry-run; pass --write (and SANITY_TOKEN) to apply");
    return;
  }
  if (!token) {
    console.error("Set SANITY_TOKEN (write) to migrate.");
    process.exit(1);
  }

  const CHUNK = 80;
  let patched = 0;
  for (let i = 0; i < plans.length; i += CHUNK) {
    const chunk = plans.slice(i, i + CHUNK);
    const tx = client.transaction();
    let ops = 0;
    for (const p of chunk) {
      if (p.from === p.to) continue;
      // Drop archive-only fields when leaving archive (coverage now lives in press).
      tx.patch(p.id, {
        set: { channel: p.to },
        unset: ["origin", "externalUrl", "outlet", "commentary"],
      });
      ops++;
      patched++;
    }
    if (ops > 0) await tx.commit();
  }
  console.log(`\npatched ${patched} docs`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
