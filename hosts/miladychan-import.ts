/**
 * blog.miladychan.org (Ghost behind Cloudflare) → Sanity NDJSON via Firecrawl.
 * Channel: `dev-blog`.
 *
 *   FIRECRAWL_API_KEY=… pnpm --filter @remilia/hosts exec node --import tsx miladychan-import.ts
 *   FIRECRAWL_API_KEY=… pnpm --filter @remilia/hosts exec node --import tsx miladychan-import.ts --out miladychan-posts.ndjson
 *
 * Then import (Editor token as Sanity session):
 *   echo "$SANITY_TOKEN" | npx sanity login --with-token
 *   npx sanity dataset import miladychan-posts.ndjson production --replace
 *
 * Or with --write: login + dataset import in one shot (needs SANITY_TOKEN).
 */
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { markdownToPost, slugify } from "@remilia/renderer";

const ORIGIN = "https://blog.miladychan.org";
const CHANNEL = "dev-blog" as const;
const AUTHOR = "Remilia Jackson";
const write = process.argv.includes("--write");
const outFlag = process.argv.find((_, i, a) => a[i - 1] === "--out");
const outFile = outFlag ?? "miladychan-posts.ndjson";
const token = process.env.SANITY_TOKEN ?? process.env.SANITY_API_WRITE_TOKEN;
const firecrawlKey = process.env.FIRECRAWL_API_KEY;

type Scraped = {
  slug: string;
  url: string;
  title: string;
  publishedAt: string;
  excerpt: string;
  markdown: string;
  coverImage?: string;
};

async function firecrawlMap(url: string): Promise<string[]> {
  const res = await fetch("https://api.firecrawl.dev/v1/map", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${firecrawlKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url, includeSubdomains: false, limit: 200 }),
  });
  if (!res.ok) throw new Error(`Firecrawl map ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const json = (await res.json()) as { links?: (string | { url?: string })[] };
  return (json.links ?? [])
    .map((x) => (typeof x === "string" ? x : x.url ?? ""))
    .filter(Boolean);
}

async function firecrawlScrape(url: string) {
  const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${firecrawlKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
  });
  if (!res.ok) throw new Error(`Firecrawl scrape ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const json = (await res.json()) as {
    data?: { markdown?: string; metadata?: Record<string, string> };
  };
  const data = json.data ?? {};
  const meta = data.metadata ?? {};
  let title = meta.title || meta.ogTitle || url;
  title = title.replace(/\s*[|–—-]\s*MiladyChan.*$/i, "").trim();
  return {
    markdown: (data.markdown ?? "").trim(),
    title,
    description: meta.description || meta.ogDescription || "",
    publishedAt: meta.publishedTime || meta["article:published_time"],
    ogImage: meta.ogImage,
  };
}

function postId(slug: string): string {
  const id = `post-${CHANNEL}-miladychan-${slug}`;
  return id.length <= 128
    ? id
    : `post-${CHANNEL}-miladychan-${createHash("sha1").update(slug).digest("hex")}`;
}

function hoistImages(
  body: { _type?: string; asset?: { url?: string }; alt?: string; caption?: string }[],
  title: string,
) {
  return body.map((b, i) => {
    if (b._type !== "image") return { ...b, _key: `b${i}` };
    const url = b.asset?.url;
    if (!url) return { ...b, _key: `b${i}` };
    return {
      _type: "image",
      _key: `b${i}`,
      _sanityAsset: `image@${url}`,
      alt: b.alt?.trim() || title,
      caption: b.caption,
    };
  });
}

function isPostUrl(u: string): boolean {
  try {
    const { hostname, pathname } = new URL(u);
    if (!hostname.endsWith("blog.miladychan.org")) return false;
    const parts = pathname.replace(/\/$/, "").split("/").filter(Boolean);
    if (parts.length !== 1) return false;
    const p = parts[0]!;
    if (p.includes(".")) return false; // sitemaps, assets
    if (["about", "tag", "author", "page", "archive", "rss", "feed"].includes(p)) return false;
    return true;
  } catch {
    return false;
  }
}

async function scrapeAll(): Promise<Scraped[]> {
  if (!firecrawlKey) {
    console.error("Set FIRECRAWL_API_KEY.");
    process.exit(1);
  }
  const mapped = await firecrawlMap(ORIGIN);
  const postUrls = [...new Set(mapped.filter(isPostUrl))];
  for (const s of ["v01", "v02", "v03", "v04"]) {
    const u = `${ORIGIN}/${s}`;
    if (!postUrls.includes(u)) postUrls.push(u);
  }
  console.log(`scraping ${postUrls.length} miladychan posts…`);
  const out: Scraped[] = [];
  for (const url of postUrls) {
    const slug = new URL(url).pathname.replace(/\//g, "") || "index";
    process.stdout.write(`• ${slug} `);
    const s = await firecrawlScrape(url);
    if (!s.markdown) {
      console.log("EMPTY — skip");
      continue;
    }
    const excerpt = (
      s.description ||
      s.markdown.replace(/[#*_>`\[\]]/g, " ").replace(/\s+/g, " ").trim() ||
      s.title
    ).slice(0, 300);
    console.log(`${s.markdown.length} chars`);
    out.push({
      slug,
      url,
      title: s.title,
      publishedAt: s.publishedAt ?? "2024-07-01T00:00:00.000Z",
      excerpt,
      markdown: s.markdown,
      coverImage: s.ogImage,
    });
  }
  return out;
}

async function main() {
  const scraped = await scrapeAll();
  const docs: Record<string, unknown>[] = [];
  const add = (d: Record<string, unknown>) => docs.push(d);

  add({
    _id: `author-${slugify(AUTHOR)}`,
    _type: "author",
    name: AUTHOR,
    slug: { _type: "slug", current: slugify(AUTHOR) },
  });

  for (const p of scraped) {
    const { body } = markdownToPost(p.markdown, CHANNEL);
    add({
      _id: postId(p.slug),
      _type: "post",
      channel: CHANNEL,
      title: p.title,
      slug: { _type: "slug", current: p.slug },
      publishedAt: p.publishedAt,
      excerpt: p.excerpt,
      body: hoistImages(body, p.title),
      authors: [{ _type: "reference", _ref: `author-${slugify(AUTHOR)}`, _key: "a0" }],
      coverImage: p.coverImage
        ? { _type: "image", _sanityAsset: `image@${p.coverImage}`, alt: p.title }
        : undefined,
      migration: {
        source: "miladychan",
        legacyUrl: p.url.endsWith("/") ? p.url : `${p.url}/`,
      },
    });
  }

  await writeFile(outFile, docs.map((d) => JSON.stringify(d)).join("\n") + "\n");
  console.log(`wrote ${docs.length} docs (${scraped.length} posts) → ${outFile}`);

  if (!write) {
    console.log("dry-run; pass --write (+ SANITY_TOKEN) to dataset-import");
    return;
  }
  if (!token) {
    console.error("Set SANITY_TOKEN to write.");
    process.exit(1);
  }

  const login = spawnSync("npx", ["sanity", "login", "--with-token"], {
    input: token,
    encoding: "utf8",
    cwd: "/workspace",
  });
  if (login.status !== 0) {
    console.error("sanity login failed:", login.stderr || login.stdout);
    process.exit(1);
  }

  const imp = spawnSync(
    "npx",
    ["sanity", "dataset", "import", outFile, "production", "--replace"],
    { encoding: "utf8", cwd: "/workspace" },
  );
  console.log(imp.stdout);
  if (imp.status !== 0) {
    console.error(imp.stderr);
    process.exit(imp.status ?? 1);
  }
  console.log("imported to production");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
