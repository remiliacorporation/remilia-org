/**
 * Route posts onto host missions.
 *
 *   .org press     — org corporate statements only (not brand product releases)
 *   .org thought   — org/product-relevant thought leadership (theory + NFTs)
 *   .org updates   — company essays/memos (Christmas, Level-2, Admin Reveal, …)
 *   .org archive   — external coverage/interviews (Firecrawl snapshot) +
 *                    secondary Substack/Paragraph that aren’t core TL
 *   .com news      — fashion / lifestyle / publishing + brand press releases
 *                    (HIKKI Punks, Atelier, FRUiTS, product launches, …)
 *   .com events    — event writeups
 *   .net           — RemiliaNET / wiki / miladychan software
 *
 *   SANITY_TOKEN=… pnpm --filter @remilia/hosts exec node --import tsx migrate-channels.ts --all
 *   SANITY_TOKEN=… pnpm --filter @remilia/hosts exec node --import tsx migrate-channels.ts --all --write
 *
 * After routing, snapshot external archive URLs:
 *   FIRECRAWL_API_KEY=… SANITY_TOKEN=… node --import tsx archive-firecrawl.ts --write
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

const SOCIAL_HOSTS = new Set([
  "twitter.com",
  "x.com",
  "www.twitter.com",
  "instagram.com",
  "www.instagram.com",
  "t.co",
]);

function outletHostHint(outlet: string | undefined): string {
  if (!outlet) return "";
  return outlet.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function pickExternalUrl(
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

export function parseOutlet(title: string): string | undefined {
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
  if (tags.has("Press") && tags.has("Feature") && !tags.has("Press Release")) return true;
  return false;
}

function isPressRelease(title: string, tags: Set<string>): boolean {
  if (tags.has("Press Release")) return true;
  if (/^Press Release:/i.test(title)) return true;
  return false;
}

/**
 * Org-only corporate statements stay on .org/press.
 * Brand / fashion / lifestyle / product launches → .com/news.
 */
function isOrgCorporatePress(title: string): boolean {
  return /\bcondemns?\b|\bstatement\b|\bunrepresentative\b/i.test(title);
}

function isBrandPressRelease(title: string, tags: Set<string>): boolean {
  if (!isPressRelease(title, tags)) return false;
  if (isOrgCorporatePress(title)) return false;
  return true;
}

function isNetSoftware(title: string, slug: string): boolean {
  if (/^RemiliaNET\b/i.test(title) || /RemiliaNET Alpha/i.test(title)) return true;
  if (/vault architecture/i.test(title)) return true;
  if (/miladychan/i.test(title) || /miladychan/i.test(slug)) return true;
  if (/remilia wiki/i.test(title) || slug === "remilia-wiki-launch") return true;
  if (/remilianet/i.test(title) && /miladycraft/i.test(title)) return true;
  return false;
}

/** Engineering / product blog surface on .net (path /blog). */
function isDevBlogSoftware(title: string, slug: string): boolean {
  if (/^RemiliaNET\b/i.test(title) || /RemiliaNET Alpha/i.test(title)) return true;
  if (/api|developer portal/i.test(title)) return true;
  if (/miladychan/i.test(title) || /miladychan/i.test(slug)) return true;
  if (/remilia wiki/i.test(title) || slug === "remilia-wiki-launch") return true;
  return false;
}

/** Company essays / memos → org updates. */
const UPDATES_SLUGS = new Set([
  "corporate-memo-remilia-2024-christmas-missive",
  "can-whats-playing-milady-make-it-to-level-2",
  "admin-reveal-i-said-i-m-just-a-vessel-bro",
  "authorship-hashes",
  "external-memo-7-12-22-where-are-the-art-critics",
]);

/**
 * Paragraph posts that are directly Remilia org/product thought leadership.
 * Everything else from Paragraph defaults to archive (secondary).
 */
const THOUGHT_PARAGRAPH_SLUGS = new Set([
  "remilia-corporation-onboarding-package",
  "the-new-lower-bound-of-network-spirituality-remilia-s-new-internet-as-reference-implementation-for-a-bottom-up-patchwork-gp",
  "network-spirituality-collected-commentaries",
  "notes-towards-a-study-of-remilia-s-art",
  "notes-on-the-new-wave-of-net-art",
  "notes-on-the-new-net-art-and-network-spirituality-guest-post-eschatalogies",
  "nft-s-and-free-information",
  "unpacking-post-authorship",
  "digital-post-identity-in-the-open-marketplace-of-ideas",
  "crypto-and-its-discontents-hello-web3-entryists",
  "reality-after-the-wired",
  "milady-as-a-total-art-gp",
  "four-notes-on-reading-remilia-collective-gp",
  "things-desired-an-egoless-online-gp",
  "what-remilia-believes-in-a-new-net-art-manifesto",
]);

const THOUGHT_GHOST_SLUGS = new Set([
  "what-remilia-believes-in-a-new-net-art-manifesto",
  "secondary-royalties",
  "the-nft-clearpill",
  "pfpnfts-we-havent-seen-profile-first-design-yet",
  "does-nft-bolster-authorship-or-supersede-it",
  "nfts-role-in-crypto-hyperfinancialization-abstract-art",
  "on-secondary",
  "nouns-wtf",
  "milady-maker",
  "bonkler-critical-notes",
  "redacted-remilio-babies-notes-on-the-design-process",
  "jadeposting",
  "a-peoples-history-of-hot-pot",
  "viral-public-license",
  "fumo-404",
]);

function isComNews(title: string, slug: string): boolean {
  if (/exegesis/i.test(title) || /exegesis/i.test(slug)) return true;
  if (/pre-release announcement/i.test(title) && /miya|exegesis|book|manuscript/i.test(title))
    return true;
  return false;
}

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

  // 2. .net software — RemiliaNET Alpha / wiki / miladychan → dev-blog;
  //    other product notes (vault, MiladyCraft promos) → dev-updates
  if (isDevBlogSoftware(title, slug)) {
    return { ...base, to: "dev-blog", reason: "RemiliaNET Alpha / wiki / miladychan → dev-blog" };
  }
  if (isNetSoftware(title, slug)) {
    return { ...base, to: "dev-updates", reason: "net software product note" };
  }

  // 3. First-party press releases → .com news (brand) unless corporate statement
  if (isBrandPressRelease(title, tags) || isComNews(title, slug)) {
    return { ...base, to: "news", reason: "brand / fashion / lifestyle / publishing" };
  }
  if (isPressRelease(title, tags)) {
    return { ...base, to: "press", reason: "org corporate press statement" };
  }

  // 4. External coverage / interviews → archive (+ Firecrawl later)
  if (isExternalCoverage(title, tags) || (tags.has("Press") && !tags.has("Press Release"))) {
    const outlet = parseOutlet(title);
    const externalUrl = pickExternalUrl(p.hrefs, outlet);
    return {
      ...base,
      to: "archive",
      reason: "press coverage / interview → archive",
      origin: "external",
      externalUrl,
      outlet,
    };
  }

  // 5. Org updates — Christmas, Level-2, Admin Reveal, memos
  if (UPDATES_SLUGS.has(slug) || (/corporate memo/i.test(title) && /christmas|missive/i.test(title))) {
    return { ...base, to: "updates", reason: "company essay / memo" };
  }

  // 7. Core thought leadership (theory + NFTs)
  if (THOUGHT_PARAGRAPH_SLUGS.has(slug) || THOUGHT_GHOST_SLUGS.has(slug)) {
    return { ...base, to: "thought", reason: "org/product thought leadership" };
  }
  if (source === "paragraph" && THOUGHT_PARAGRAPH_SLUGS.has(slug)) {
    return { ...base, to: "thought", reason: "org/product thought leadership" };
  }
  // Ghost theory/NFT tags that weren’t allowlisted still default thought when clearly NFT/theory
  if (tags.has("Thought") || tags.has("Note") || tags.has("Review") || tags.has("NFT")) {
    return { ...base, to: "thought", reason: "theory/NFT tag" };
  }
  if (tags.has("Project") && !isNetSoftware(title, slug)) {
    return { ...base, to: "thought", reason: "project design essay" };
  }

  // 8. Secondary Substack / Paragraph → archive (first-party)
  if (source === "substack" || source === "paragraph") {
    return {
      ...base,
      to: "archive",
      reason: `secondary ${source} → archive`,
      origin: "first-party",
    };
  }

  // 9. Guides / leftover announcements
  if (tags.has("Guide")) {
    return { ...base, to: "archive", reason: "secondary guide → archive", origin: "first-party" };
  }
  if (tags.has("Announcements")) {
    return { ...base, to: "updates", reason: "tag:Announcements" };
  }

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
    if (p.from === p.to && p.to !== "archive") continue;
    // always show archive plans (fields may still need setting)
    if (p.from === p.to && p.to === "archive") {
      console.log(
        `${p.from} = archive     ${p.reason.padEnd(48)} ${p.title.slice(0, 60)} origin=${p.origin ?? "?"}`,
      );
      continue;
    }
    if (p.from === p.to) continue;
    moves++;
    const extra =
      p.to === "archive"
        ? p.origin === "external"
          ? ` origin=external outlet=${p.outlet ?? "—"} url=${p.externalUrl ?? "MISSING"}`
          : ` origin=${p.origin ?? "first-party"}`
        : "";
    console.log(
      `${p.from} → ${p.to.padEnd(12)} ${p.reason.padEnd(48)} ${p.title.slice(0, 60)}${extra}`,
    );
  }
  console.log(`\n${moves} channel moves`);

  if (!write) {
    console.log("dry-run; pass --write (and SANITY_TOKEN) to apply");
    console.log("then: FIRECRAWL_API_KEY=… SANITY_TOKEN=… node --import tsx archive-firecrawl.ts --write");
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
      const needsChannel = p.from !== p.to;
      const needsArchiveMeta = p.to === "archive";
      if (!needsChannel && !needsArchiveMeta) continue;

      if (p.to === "archive") {
        const set: Record<string, unknown> = { channel: "archive" };
        if (p.origin) set.origin = p.origin;
        if (p.origin === "external") {
          if (p.externalUrl) set.externalUrl = p.externalUrl;
          if (p.outlet) set.outlet = p.outlet;
          tx.patch(p.id, { set });
        } else {
          tx.patch(p.id, {
            set,
            unset: ["externalUrl", "outlet", "commentary", "archiveSnapshot"],
          });
        }
      } else {
        tx.patch(p.id, {
          set: { channel: p.to },
          unset: ["origin", "externalUrl", "outlet", "commentary", "archiveSnapshot"],
        });
      }
      ops++;
      patched++;
    }
    if (ops > 0) await tx.commit();
  }
  console.log(`\npatched ${patched} docs`);
  console.log("Next: FIRECRAWL_API_KEY=… SANITY_TOKEN=… node --import tsx archive-firecrawl.ts --write");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
