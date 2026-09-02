
import { createClient } from "@sanity/client";
import { createHash } from "node:crypto";

const token = process.env.SANITY_TOKEN || process.env.SANITY_AUTH_TOKEN;
if (!token) {
  console.error("Set SANITY_TOKEN");
  process.exit(1);
}
const write = process.argv.includes("--write");
const time = process.argv.find((a) => a.startsWith("--time="))?.slice(7) ?? "2026-08-30T18:55:00.000Z";

const client = createClient({
  projectId: "8x9419lh",
  dataset: "production",
  apiVersion: "2025-03-20",
  token,
  useCdn: false,
});

function shortId(prefix: string, slug: string): string {

  const base = `${prefix}-${slug}`.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  if (base.length <= 120) return base;
  const hash = createHash("sha1").update(base).digest("hex").slice(0, 10);
  return `${base.slice(0, 108)}-${hash}`;
}

async function historyDoc(id: string, at: string) {
  const u = `https://8x9419lh.api.sanity.io/v2021-06-07/data/history/production/documents/${encodeURIComponent(id)}?time=${encodeURIComponent(at)}`;
  const r = await fetch(u, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  const j = (await r.json()) as { documents?: Array<Record<string, unknown>> };
  return j.documents?.[0] ?? null;
}

async function ghostPostUrls(): Promise<string[]> {
  const out: string[] = [];
  for (const path of ["/sitemap-posts.xml", "/sitemap-pages.xml"]) {
    const res = await fetch(`https://blog.remilia.org${path}`);
    if (!res.ok) continue;
    const xml = await res.text();
    for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) out.push(m[1]);
  }
  return [
    ...new Set(
      out.filter(
        (u) =>
          u.startsWith("https://blog.remilia.org/") &&
          !u.includes("/sitemap") &&
          !u.includes("/author/") &&
          !u.includes("/tag/") &&
          !u.includes("/page/") &&
          u !== "https://blog.remilia.org/",
      ),
    ),
  ];
}

function slugFromUrl(u: string): string | null {
  try {
    const parts = new URL(u).pathname.replace(/\/$/, "").split("/").filter(Boolean);
    return parts.at(-1) ?? null;
  } catch {
    return null;
  }
}

async function main() {
  const existing = await client.fetch<
    Array<{ _id: string; slug?: string; legacy?: string; title?: string }>
  >(`*[_type=="post"]{_id, "slug": slug.current, "legacy": migration.legacyUrl, title}`);
  console.log(`existing posts: ${existing.length}`);

  const existingIds = new Set(existing.map((e) => e._id.replace(/^drafts\./, "")));
  const existingSlugs = new Set(existing.map((e) => e.slug).filter(Boolean) as string[]);
  const existingLegacy = new Set(existing.map((e) => e.legacy).filter(Boolean) as string[]);

  const ghostUrls = await ghostPostUrls();
  console.log(`ghost sitemap urls: ${ghostUrls.length}`);

  const missingUrls = ghostUrls.filter((u) => {
    const slug = slugFromUrl(u);
    if (!slug) return false;
    if (existingSlugs.has(slug)) return false;
    if (existingLegacy.has(u) || existingLegacy.has(`${u}/`)) return false;
    return true;
  });
  console.log(`missing vs ghost (by slug/legacy): ${missingUrls.length}`);

  const channels = [
    "press",
    "news",
    "events",
    "dev-blog",
    "thought",
    "updates",
    "archive",
    "devblog",
    "studio",
    "dev-updates",
  ];
  const candidates = new Set<string>();
  for (const u of missingUrls) {
    const slug = slugFromUrl(u);
    if (!slug) continue;
    for (const ch of channels) {
      candidates.add(`post-${ch}-${slug}`);
      candidates.add(`post-press-${slug}`);
    }
  }

  for (const slug of ["v01", "v02", "v03", "v04"]) {
    candidates.add(`post-dev-blog-miladychan-${slug}`);
    candidates.add(`post-devblog-miladychan-${slug}`);
  }

  console.log(`history candidates: ${candidates.size} @ ${time}`);
  const recovered: Record<string, unknown>[] = [];
  let i = 0;
  for (const id of candidates) {
    i++;
    if (existingIds.has(id)) continue;
    const doc = await historyDoc(id, time);
    if (doc && doc._type === "post") {
      recovered.push(doc);
      console.log(`  found ${doc._id} — ${String(doc.title ?? "").slice(0, 50)}`);
    }
    if (i % 100 === 0) console.log(`  …checked ${i}/${candidates.size}`);
  }

  const byId = new Map(recovered.map((d) => [String(d._id), d]));
  console.log(`unique recovered from history: ${byId.size}`);

  if (!write) {
    console.log("dry-run — pass --write to restore as drafts");
    return;
  }

  let n = 0;
  for (const doc of byId.values()) {
    const rawId = String(doc._id);
    const { _rev, ...rest } = doc as Record<string, unknown> & { _rev?: string };
    let publishedId = rawId;
    if (`drafts.${publishedId}`.length > 128) {
      const slug =
        typeof (doc as { slug?: { current?: string } }).slug?.current === "string"
          ? (doc as { slug: { current: string } }).slug.current
          : publishedId.slice(-40);
      const channel = String((doc as { channel?: string }).channel ?? "press");
      publishedId = shortId(`post-${channel}`, slug);
      console.log(`  shorten id ${rawId.length}→${publishedId} (${publishedId.length})`);
    }
    const draftId = `drafts.${publishedId}`;
    await client.createOrReplace({ ...rest, _id: draftId });
    n++;
  }
  console.log(`restored ${n} posts as drafts`);

  const counts = await client.fetch(`{
    "published": count(*[_type=="post" && !(_id in path("drafts.**"))]),
    "drafts": count(*[_type=="post" && _id in path("drafts.**")])
  }`);
  console.log(counts);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

