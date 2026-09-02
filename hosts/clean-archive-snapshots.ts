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
const all = process.argv.includes("--all");

/** True if a line is outlet chrome (nav, skip links, embeds), not article body. */
function isChromeLine(t: string): boolean {
  if (!t) return false;
  if (/â¬|ï¸|Ã©|â€|â­|âœ|âƒ|Left Arrow|Option Sliders|MailExit|Asterisk/i.test(t)) return true;
  if (/^\[Skip to (main )?content\]/i.test(t)) return true;
  if (/^Skip to (main )?content$/i.test(t)) return true;
  if (/^Save Story/i.test(t) || /^Save this story/i.test(t)) return true;
  if (/^(US|UK) EDITION$/i.test(t)) return true;
  if (/^(UK|US) EDITION(US|UK) EDITION$/i.test(t)) return true;
  if (/^content frame$/i.test(t)) return true;
  if (/^\*\*An error has occurred\*\*$/i.test(t)) return true;
  if (/^\[SUBSCRIBE\]/i.test(t)) return true;
  if (/^\[Digital Assets\]/i.test(t)) return true;
  if (/^\[Forbes Digital Assets\]/i.test(t)) return true;
  if (/^-\s+\[(News|Crypto Prices|NFT Prices|Learn)\]/i.test(t)) return true;
  if (/^-?\s*More$/i.test(t)) return true;
  if (/^-?\s*Text settings$/i.test(t) || /^-?\s*Text size$/i.test(t)) return true;
  if (/^issue\s+\[/i.test(t) && /spectator\.com\/magazine/i.test(t)) return true;
  if (/^\*\s*\*\s*\*$/.test(t)) return true;
  if (/^-?\s*(Small|Medium|Large|Compact|Normal|Spacious|Slow|Fast)$/i.test(t)) return true;
  if (/^-?\s*Line Spacing$/i.test(t) || /^-?\s*Audio settings$/i.test(t)) return true;
  if (/^-?\s*Playback speed$/i.test(t)) return true;
  if (/^-?\s*\[Comments\]/i.test(t)) return true;
  if (/^-?\s*Share$/i.test(t) || /^## Share$/i.test(t)) return true;
  if (/^Copy link/i.test(t)) return true;
  if (/waveform-placeholder/i.test(t)) return true;
  if (/^\d{2}:\d{2}\d{2}:\d{2}$/.test(t)) return true;
  if (/has narrated this article for you to listen/i.test(t)) return true;
  if (/^Manage preferences/i.test(t) || /^Essential cookies only/i.test(t)) return true;
  if (/^Accept all$/i.test(t) || /^StripeM-Inner$/i.test(t)) return true;
  if (/process personal data on the basis of legitimate interest/i.test(t)) return true;
  if (/Manage Cookies link at the bottom/i.test(t)) return true;
  if (/^You can (object to such processing|change your preferences)/i.test(t)) return true;
  if (/^Instagram$/i.test(t)) return true;
  if (/^\[_?Instagram_?\]/i.test(t)) return true;
  if (/^\[Visit Instagram\]/i.test(t)) return true;
  if (/link to this photo or video may be broken/i.test(t)) return true;
  if (/^Create an account/i.test(t)) return true;
  if (/^\[Add on Google\]/i.test(t)) return true;
  if (/preferred source to see more of our stories/i.test(t)) return true;
  if (/This story was featured in The Must Read/i.test(t)) return true;
  if (/^\[Sign up here to get it in your inbox/i.test(t)) return true;
  if (/^Follow this author/i.test(t)) return true;
  if (/^Read Next$/i.test(t)) return true;
  if (/^Sign up for|^Subscribe to /i.test(t)) return true;
  if (/^Accept (all )?cookies/i.test(t)) return true;
  if (/^\[Read the latest issue of Dazed/i.test(t)) return true;
  return false;
}

/** Drop leading Firecrawl/nav junk and mid-doc outlet chrome. */
export function cleanSnapshotMarkdown(md: string): string {
  let lines = md.replace(/^\uFEFF/, "").split(/\r?\n/);

  // Leading junk / skip links / mojibake
  while (lines.length) {
    const t = lines[0].trim();
    if (!t || isChromeLine(t)) {
      lines.shift();
      continue;
    }
    break;
  }

  // Forbes / similar: drop nav until first real H1
  const h1 = lines.findIndex((l) => /^#\s+\S/.test(l.trim()));
  if (h1 > 0) {
    const before = lines.slice(0, h1);
    if (before.every((l) => !l.trim() || isChromeLine(l.trim()) || /^-\s+\[/.test(l.trim()))) {
      lines = lines.slice(h1);
    }
  }

  // Spectator / Condé-style: jump to first H2/H3 headline when leading is chrome/UI
  const hx = lines.findIndex((l) => /^#{2,3}\s+\S/.test(l.trim()));
  if (hx > 0) {
    const before = lines.slice(0, hx);
    const chromeHeavy =
      before.filter((l) => l.trim()).length > 0 &&
      before.every(
        (l) =>
          !l.trim() ||
          isChromeLine(l.trim()) ||
          /^!\[/.test(l.trim()) ||
          /^Alexander Raubo$/i.test(l.trim()) ||
          l.trim().length < 40,
      );
    if (chromeHeavy) lines = lines.slice(hx);
  }

  const out: string[] = [];
  let blanks = 0;
  for (const line of lines) {
    const t = line.trim();
    if (!t) {
      blanks++;
      if (blanks <= 2) out.push(line);
      continue;
    }
    if (isChromeLine(t)) {
      blanks = 0;
      continue;
    }
    blanks = 0;
    out.push(line);
  }

  // Drop trailing cookie / preference chrome once it starts
  let joined = out.join("\n").trim();
  const cookieAt = joined.search(
    /\n(?:Manage preferences|Essential cookies only|You can object to such processing|process personal data on the basis of legitimate interest)/i,
  );
  if (cookieAt > 200) joined = joined.slice(0, cookieAt).trim();
  return joined;
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
  if (/\[Skip to |Save Story|US EDITION|Digital Assets\]|Visit Instagram|Create an account/i.test(md)) {
    return true;
  }
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

function finalizeSnapshot(md: string, url?: string): string {
  let cleaned = md;
  if (url && /decrypt\.co/i.test(url)) cleaned = stripMarketChrome(cleaned);
  else cleaned = cleanSnapshotMarkdown(cleaned);
  return cleaned;
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

  const targets = all ? rows : rows.filter((r) => needsClean(r.archiveSnapshot));
  console.log(`${rows.length} external; ${targets.length} to clean${write ? "" : " (dry-run)"}`);

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
    const cleaned = finalizeSnapshot(md, r.externalUrl);
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
