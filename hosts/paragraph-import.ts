
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { markdownToPost, slugify } from "@remilia/renderer";
import { type Channel } from "@remilia/seo";

const API = "https://public.api.paragraph.com/api/v1";
const PUB = "qLVmgBiICnwomlcyxnaf";
const HANDLE = "charlemagnefang";
const CHANNEL: Channel = "thought";

function normTitle(s: string): string {
  return s.toLowerCase().replace(/\[gp\]/g, "").replace(/[^a-z0-9]+/g, "");
}

function postId(slug: string): string {
  const id = `post-${CHANNEL}-${slug}`;
  return id.length <= 128 ? id : `post-${CHANNEL}-${createHash("sha1").update(slug).digest("hex")}`;
}

function publishedAt(raw: unknown): string {
  const n = typeof raw === "number" ? raw : typeof raw === "string" && /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (Number.isFinite(n)) return new Date(n > 1e12 ? n : n * 1000).toISOString();
  if (typeof raw === "string" && raw) return raw;
  return "2021-01-01T00:00:00.000Z";
}

function hoistImages(body: { _type?: string; asset?: { url?: string }; alt?: string; caption?: string }[], title: string) {
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

async function existingFromGhost(path: string): Promise<{ slugs: Set<string>; titles: Set<string> }> {
  const slugs = new Set<string>();
  const titles = new Set<string>();
  let raw = "";
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return { slugs, titles };
  }
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    const d = JSON.parse(line) as { _type?: string; slug?: { current?: string }; title?: string };
    if (d._type !== "post") continue;
    if (d.slug?.current) slugs.add(d.slug.current);
    if (d.title) titles.add(normTitle(d.title));
  }
  return { slugs, titles };
}

function alreadyHave(slug: string, title: string, slugs: Set<string>, titles: Set<string>): boolean {
  if (slugs.has(slug) || titles.has(normTitle(title))) return true;
  for (const g of slugs) {
    const a = slug.length >= g.length ? slug : g;
    const b = slug.length >= g.length ? g : slug;
    if (b.length >= 24 && a.includes(b)) return true;
  }
  return false;
}

type ParaPost = {
  id: string;
  title: string;
  slug: string;
  markdown?: string;
  imageUrl?: string;
  publishedAt?: string | number;
  authors?: { name?: string }[];
  categories?: string[];
};

async function fetchPosts(): Promise<ParaPost[]> {
  const items: ParaPost[] = [];
  let cursor: string | undefined;
  do {
    const q = new URLSearchParams({ limit: "50", includeContent: "true" });
    if (cursor) q.set("cursor", cursor);
    const res = await fetch(`${API}/publications/${PUB}/posts?${q}`);
    if (!res.ok) throw new Error(`paragraph ${res.status}`);
    const json = (await res.json()) as { items: ParaPost[]; pagination?: { hasMore?: boolean; cursor?: string } };
    items.push(...json.items);
    cursor = json.pagination?.hasMore ? json.pagination.cursor : undefined;
  } while (cursor);
  return items;
}

async function main() {
  const args = process.argv.slice(2);
  const outFile = args.find((a, i) => args[i - 1] === "--out") ?? "paragraph-posts.ndjson";
  const ghostFile = args.find((a, i) => args[i - 1] === "--ghost") ?? "ghost-posts.ndjson";
  const { slugs, titles } = await existingFromGhost(ghostFile);

  const docs: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  const add = (doc: Record<string, unknown> & { _id: string }) => {
    if (seen.has(doc._id)) return;
    seen.add(doc._id);
    docs.push(doc);
  };

  let skipped = 0;
  for (const p of await fetchPosts()) {
    if (alreadyHave(p.slug, p.title, slugs, titles)) {
      skipped += 1;
      continue;
    }
    const md = p.markdown?.trim() || p.title;
    const { body } = markdownToPost(md, CHANNEL);
    const author = p.authors?.[0]?.name ?? "Charlotte Fang";
    add({
      _id: `author-${slugify(author)}`,
      _type: "author",
      name: author,
      slug: { _type: "slug", current: slugify(author) },
    });
    for (const name of p.categories ?? []) {
      add({
        _id: `tag-${slugify(name)}`,
        _type: "tag",
        name,
        slug: { _type: "slug", current: slugify(name) },
      });
    }
    add({
      _id: postId(p.slug),
      _type: "post",
      channel: CHANNEL,
      title: p.title,
      slug: { _type: "slug", current: p.slug },
      publishedAt: publishedAt(p.publishedAt),
      excerpt: (md.replace(/^#.*\n/, "").replace(/[#*_>`\[\]]/g, " ").replace(/\s+/g, " ").trim() || p.title).slice(0, 300),
      body: hoistImages(body, p.title),
      authors: [{ _type: "reference", _ref: `author-${slugify(author)}`, _key: "a0" }],
      tags: (p.categories ?? []).map((name, i) => ({
        _type: "reference",
        _ref: `tag-${slugify(name)}`,
        _key: `t${i}`,
      })),
      coverImage: p.imageUrl
        ? { _type: "image", _sanityAsset: `image@${p.imageUrl}`, alt: p.title }
        : undefined,
      migration: {
        source: "paragraph",
        ghostId: p.id,
        legacyUrl: `https:
      },
    });
    process.stdout.write(".");
  }

  await writeFile(outFile, docs.map((d) => JSON.stringify(d)).join("\n") + "\n");
  const posts = docs.filter((d) => d._type === "post").length;
  console.log(`\nwrote ${docs.length} docs (${posts} new posts, ${skipped} already on Ghost) to ${outFile}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}

