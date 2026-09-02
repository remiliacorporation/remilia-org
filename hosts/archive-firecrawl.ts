/**
 * Firecrawl external archive URLs into `archiveSnapshot` (markdown).
 *
 *   FIRECRAWL_API_KEY=… SANITY_TOKEN=… pnpm --filter @remilia/hosts exec node --import tsx archive-firecrawl.ts
 *   FIRECRAWL_API_KEY=… SANITY_TOKEN=… pnpm --filter @remilia/hosts exec node --import tsx archive-firecrawl.ts --write
 *   … --force          re-scrape even when snapshot exists
 *   … --bad-only       only snapshots that look like nav chrome / wrong page / mojibake
 *
 * Only targets archive posts with origin=external and an externalUrl.
 */
import { createClient } from "@sanity/client";
import { pathToFileURL } from "node:url";

const write = process.argv.includes("--write");
const force = process.argv.includes("--force");
const badOnly = process.argv.includes("--bad-only");
const token = process.env.SANITY_TOKEN ?? process.env.SANITY_API_WRITE_TOKEN ?? process.env.SANITY_AUTH_TOKEN;
const firecrawlKey = process.env.FIRECRAWL_API_KEY;

type Row = {
  _id: string;
  title: string;
  externalUrl?: string;
  outlet?: string;
  archiveSnapshot?: string;
};

/** Drop tracking junk that sometimes lands Firecrawl on the wrong page. */
export function cleanExternalUrl(raw: string): string {
  try {
    const u = new URL(raw);
    for (const key of [...u.searchParams.keys()]) {
      if (/^(ref|utm_|fbclid|gclid|mc_|si$)/i.test(key) || key.toLowerCase().startsWith("utm_")) {
        u.searchParams.delete(key);
      }
    }
    // Yahoo / spectator sometimes need a bare article path
    u.hash = "";
    return u.toString();
  } catch {
    return raw;
  }
}

function looksBad(snap: string | undefined, title: string): boolean {
  if (!snap?.trim()) return true;
  const head = snap.slice(0, 1200);
  if (/â¬|ï¸|Ã©|â€/i.test(head)) return true;
  if (/Left Arrow|Option Sliders|Skip to content/i.test(head) && snap.length < 12000) return true;
  // Wrong-page heuristic: title keywords absent from snapshot
  const key = title
    .replace(/^(Feature|News|Interview|Cultural Coverage|Event Coverage|Thought Leadership):\s*/i, "")
    .replace(/\s*\(\d{4}\)\s*$/, "")
    .split(/[-–—|:]/)[0]
    ?.trim();
  if (key && key.length > 12) {
    const needle = key.slice(0, 24).toLowerCase();
    if (!snap.toLowerCase().includes(needle) && !snap.toLowerCase().includes("milady") && !snap.toLowerCase().includes("remilia")) {
      return true;
    }
  }
  // Palladium wrong-page: Homer's Odyssey chrome
  if (/Homer.?s Odyssey|Chinese companies.? AI strategy/i.test(head)) return true;
  return false;
}

async function scrapeMarkdown(url: string): Promise<string> {
  const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${firecrawlKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url,
      formats: ["markdown"],
      onlyMainContent: true,
      waitFor: 2000,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Firecrawl ${res.status} for ${url}: ${text.slice(0, 400)}`);
  }
  const json = (await res.json()) as {
    success?: boolean;
    data?: { markdown?: string };
    markdown?: string;
  };
  const md = json.data?.markdown ?? json.markdown;
  if (!md?.trim()) throw new Error(`Firecrawl returned empty markdown for ${url}`);
  return md.trim();
}

async function main() {
  if (!firecrawlKey) {
    console.error("Set FIRECRAWL_API_KEY.");
    process.exit(1);
  }

  const client = createClient({
    projectId: "8x9419lh",
    dataset: "production",
    apiVersion: "2025-03-20",
    token: token || undefined,
    useCdn: false,
    perspective: "raw",
  });

  const rows = await client.fetch<Row[]>(
    `*[_type == "post" && channel == "archive" && origin == "external" && defined(externalUrl)]{
      _id, title, externalUrl, outlet, archiveSnapshot
    } | order(title)`,
  );

  const targets = rows.filter((r) => {
    if (badOnly) return looksBad(r.archiveSnapshot, r.title);
    return force || !r.archiveSnapshot?.trim();
  });
  console.log(
    `${rows.length} external archive posts; ${targets.length} to scrape` +
      `${force ? " (--force)" : ""}${badOnly ? " (--bad-only)" : ""}`,
  );

  for (const r of targets) {
    if (!r.externalUrl) continue;
    const url = cleanExternalUrl(r.externalUrl);
    process.stdout.write(`• ${r.title.slice(0, 55)} ← ${url.slice(0, 65)} … `);
    try {
      const md = await scrapeMarkdown(url);
      const stillBad = looksBad(md, r.title);
      console.log(`${md.length} chars${stillBad ? " (still looks off)" : ""}`);
      if (!write) continue;
      if (!token) {
        console.error("Set SANITY_TOKEN to write snapshots.");
        process.exit(1);
      }
      await client.patch(r._id).set({ archiveSnapshot: md }).commit();
    } catch (err) {
      console.log("FAIL");
      console.error(`  ${(err as Error).message}`);
    }
  }

  if (!write) console.log("\ndry-run; pass --write to store archiveSnapshot on each doc");
  else console.log("\ndone");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
