/**
 * Clean Firecrawl archive snapshots: strip nav chrome / mojibake headers,
 * optionally re-scrape with cleaner options.
 *
 *   FIRECRAWL_API_KEY=… SANITY_TOKEN=… pnpm --filter @remilia/hosts exec node --import tsx clean-archive-snapshots.ts --write
 *   … --rescrape   also re-fetch via Firecrawl before cleaning
 */
import { createClient } from "@sanity/client";
import { pathToFileURL } from "node:url";
import { cleanExternalUrl } from "./archive-firecrawl";

const write = process.argv.includes("--write");
const rescrape = process.argv.includes("--rescrape");

/** Drop leading Firecrawl/nav junk common on Dazed and similar. */
export function cleanSnapshotMarkdown(md: string): string {
  let lines = md.replace(/^\uFEFF/, "").split(/\r?\n/);
  while (lines.length) {
    const t = lines[0].trim();
    if (!t) {
      lines.shift();
      continue;
    }
    if (/â¬|ï¸|Ã©|â€|â­|âœ|âƒ|Left Arrow|Option Sliders|MailExit|Asterisk/i.test(t)) {
      lines.shift();
      continue;
    }
    if (/^\[Skip to content\]/i.test(t) && lines.length > 2) {
      lines.shift();
      continue;
    }
    break;
  }
  const out: string[] = [];
  let blanks = 0;
  for (const line of lines) {
    if (!line.trim()) {
      blanks++;
      if (blanks <= 2) out.push(line);
      continue;
    }
    blanks = 0;
    out.push(line);
  }
  return out.join("\n").trim();
}

/** Strip Decrypt (and similar) market-widget preamble; keep from first real H1. */
export function stripMarketChrome(md: string): string {
  const lines = md.split(/\r?\n/);
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (/^#\s+/.test(t) && !/coin prices|price/i.test(t)) {
      start = i;
      break;
    }
  }
  if (start < 0) {
    let i = 0;
    while (i < lines.length) {
      const t = lines[i].trim();
      if (
        !t ||
        t === "## Coin Prices" ||
        /^### \[[A-Z]{2,5}\]/.test(t) ||
        /^\$[\d,]+/.test(t) ||
        /^\d+\.\d+%$/.test(t) ||
        t.startsWith("|") ||
        /^\[?(BTC|ETH|SOL|USDT)/i.test(t)
      ) {
        i++;
        continue;
      }
      break;
    }
    start = i;
  }
  return cleanSnapshotMarkdown(lines.slice(Math.max(0, start)).join("\n"));
}

function needsClean(md: string | undefined): boolean {
  if (!md?.trim()) return true;
  const head = md.slice(0, 800);
  return /â¬|ï¸|Left Arrow|Option Sliders|MailExit/i.test(head);
}

async function scrape(url: string, firecrawlKey: string): Promise<string> {
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
      waitFor: 2500,
      excludeTags: ["nav", "header", "footer", "aside", "script", "style", "noscript"],
    }),
  });
  if (!res.ok) throw new Error(`Firecrawl ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const j = (await res.json()) as { data?: { markdown?: string }; markdown?: string };
  const md = j.data?.markdown ?? j.markdown;
  if (!md?.trim()) throw new Error("empty markdown");
  return md.trim();
}

async function main() {
  const token = process.env.SANITY_TOKEN || process.env.SANITY_AUTH_TOKEN;
  const firecrawlKey = process.env.FIRECRAWL_API_KEY;
  if (!token) {
    console.error("Set SANITY_TOKEN");
    process.exit(1);
  }

  const client = createClient({
    projectId: "8x9419lh",
    dataset: "production",
    apiVersion: "2025-03-20",
    token,
    useCdn: false,
    perspective: "raw",
  });

  const rows = await client.fetch<
    Array<{ _id: string; title: string; externalUrl?: string; archiveSnapshot?: string }>
  >(
    `*[_type=="post" && channel=="archive" && origin=="external"]{_id, title, externalUrl, archiveSnapshot} | order(title)`,
  );

  const targets = rows.filter((r) => needsClean(r.archiveSnapshot));
  console.log(`${rows.length} external; ${targets.length} need clean${write ? "" : " (dry-run)"}`);

  for (const r of targets) {
    let md = r.archiveSnapshot ?? "";
    if (rescrape && r.externalUrl && firecrawlKey) {
      const url = cleanExternalUrl(r.externalUrl);
      process.stdout.write(`• rescrape ${r.title.slice(0, 50)} … `);
      try {
        md = await scrape(url, firecrawlKey);
        console.log(`${md.length} chars`);
      } catch (e) {
        console.log(`FAIL ${(e as Error).message}`);
        continue;
      }
    } else {
      console.log(`• clean ${r.title.slice(0, 55)}`);
    }
    const cleaned = cleanSnapshotMarkdown(md);
    const delta = (md?.length ?? 0) - cleaned.length;
    console.log(
      `  → ${cleaned.length} chars (stripped ~${delta}), head: ${cleaned.slice(0, 80).replace(/\n/g, " | ")}`,
    );
    if (write) {
      await client
        .patch(r._id)
        .set({
          archiveSnapshot: cleaned,
          ...(r.externalUrl ? { externalUrl: cleanExternalUrl(r.externalUrl) } : {}),
        })
        .commit();
    }
  }
  console.log(write ? "\ndone" : "\ndry-run; pass --write");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
