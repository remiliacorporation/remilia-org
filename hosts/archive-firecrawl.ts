/**
 * Firecrawl external archive URLs into `archiveSnapshot` (markdown).
 *
 *   FIRECRAWL_API_KEY=… SANITY_TOKEN=… pnpm --filter @remilia/hosts exec node --import tsx archive-firecrawl.ts
 *   FIRECRAWL_API_KEY=… SANITY_TOKEN=… pnpm --filter @remilia/hosts exec node --import tsx archive-firecrawl.ts --write
 *
 * Only targets archive posts with origin=external and an externalUrl.
 * Skips docs that already have archiveSnapshot unless --force.
 */
import { createClient } from "@sanity/client";
import { pathToFileURL } from "node:url";

const write = process.argv.includes("--write");
const force = process.argv.includes("--force");
const token = process.env.SANITY_TOKEN ?? process.env.SANITY_API_WRITE_TOKEN;
const firecrawlKey = process.env.FIRECRAWL_API_KEY;

type Row = {
  _id: string;
  title: string;
  externalUrl?: string;
  outlet?: string;
  archiveSnapshot?: string;
};

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
    apiVersion: "2026-02-01",
    token: token || undefined,
    useCdn: false,
  });

  const rows = await client.fetch<Row[]>(
    `*[_type == "post" && channel == "archive" && origin == "external" && defined(externalUrl)]{
      _id, title, externalUrl, outlet, archiveSnapshot
    } | order(title)`,
  );

  const targets = rows.filter((r) => force || !r.archiveSnapshot?.trim());
  console.log(
    `${rows.length} external archive posts; ${targets.length} to scrape${force ? " (--force)" : ""}`,
  );

  for (const r of targets) {
    if (!r.externalUrl) continue;
    process.stdout.write(`• ${r.title.slice(0, 60)} ← ${r.externalUrl.slice(0, 70)} … `);
    try {
      const md = await scrapeMarkdown(r.externalUrl);
      console.log(`${md.length} chars`);
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
