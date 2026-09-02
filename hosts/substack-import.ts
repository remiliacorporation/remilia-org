
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { markdownToPost, slugify } from "@remilia/renderer";
import { ghostHtmlToMarkdown } from "./ghost-import";

const ORIGIN = "https://goldenlight.substack.com";
const CHANNEL = "archive" as const;
const AUTHOR = "Charlotte Fang";

function normTitle(s: string): string {
  return s.toLowerCase().replace(/\[gp\]/g, "").replace(/[^a-z0-9]+/g, "");
}

function postId(slug: string): string {
  const id = `post-${CHANNEL}-${slug}`;
  return id.length <= 128 ? id : `post-${CHANNEL}-${createHash("sha1").update(slug).digest("hex")}`;
}

export function unwrapSubstackImg(url: string): string {
  const m = url.match(/substackcdn\.com\/image\/fetch\/[^/]+\/(https?.+)$/);
  return m ? decodeURIComponent(m[1]) : url;
}

type PTLike = {
  _type?: string;
  _key?: string;
  asset?: { url?: string };
  alt?: string;
  caption?: string;
  children?: Array<{ text?: string }>;
};

function hoistImages(body: PTLike[], title: string) {
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

function blockText(b: PTLike): string {
  return (b.children ?? []).map((c) => c.text ?? "").join("");
}

export function promoteImageCaptions(body: PTLike[], title: string): PTLike[] {
  return body.map((b) => {
    if (b._type !== "image") return b;
    const alt = (b.alt ?? "").trim();
    const caption = (b.caption ?? "").trim();
    if (caption) return b;
    if (alt && !/^image$/i.test(alt) && alt.toLowerCase() !== title.toLowerCase()) {
      return { ...b, caption: alt };
    }
    return b;
  });
}

export function prependSubtitle(body: PTLike[], subtitle?: string): PTLike[] {
  const sub = (subtitle ?? "").trim();
  if (!sub) return body;
  const already = body.some((b) => b._type === "block" && blockText(b).includes(sub));
  if (already) return body;
  return [
    {
      _type: "block",
      _key: "subtitle",
      style: "normal",
      markDefs: [],
      children: [{ _type: "span", _key: "subtitle0", text: sub, marks: [] }],
    },
    ...body,
  ];
}

export function enrichSubstackBody(
  body: PTLike[],
  opts: { title: string; subtitle?: string; description?: string },
): PTLike[] {
  const withCaps = promoteImageCaptions(body, opts.title);
  return prependSubtitle(withCaps, opts.subtitle || opts.description);
}

export function substackExcerpt(
  p: { title: string; subtitle?: string; description?: string },
  body: PTLike[],
  mdFallback = "",
): string {
  const fromDesc = (p.description || p.subtitle || "").trim();
  if (fromDesc) return fromDesc.slice(0, 300);
  const fromBody = body
    .flatMap((b) => {
      if (b._type === "block") return [blockText(b)];
      if (b._type === "image") return [b.caption, b.alt].filter(Boolean) as string[];
      return [];
    })
    .map((s) => s.trim())
    .find((s) => s && !/^image$/i.test(s) && !/^https?:\/\
  if (fromBody) return fromBody.slice(0, 300);
  const fromMd = mdFallback.replace(/[#*_>`\[\]]/g, " ").replace(/\s+/g, " ").trim();
  return (fromMd || p.title).slice(0, 300);
}

async function existing(paths: string[]): Promise<{ slugs: Set<string>; titles: Set<string> }> {
  const slugs = new Set<string>();
  const titles = new Set<string>();
  for (const path of paths) {
    let raw = "";
    try {
      raw = await readFile(path, "utf8");
    } catch {
      continue;
    }
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      const d = JSON.parse(line) as { _type?: string; slug?: { current?: string }; title?: string };
      if (d._type !== "post") continue;
      if (d.slug?.current) slugs.add(d.slug.current);
      if (d.title) titles.add(normTitle(d.title));
    }
  }
  return { slugs, titles };
}

type ArchiveRow = { slug: string; title?: string };
type FullPost = {
  id?: number;
  slug: string;
  title: string;
  subtitle?: string;
  description?: string;
  cover_image?: string;
  body_html?: string;
  post_date?: string;
  canonical_url?: string;
};

async function main() {
  const args = process.argv.slice(2);
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const outFile = args.find((a, i) => args[i - 1] === "--out") ?? join(root, "substack-posts.ndjson");
  const { slugs, titles } = await existing([join(root, "ghost-posts.ndjson"), join(root, "paragraph-posts.ndjson")]);

  const archiveRes = await fetch(`${ORIGIN}/api/v1/archive?sort=new&limit=50`);
  if (!archiveRes.ok) throw new Error(`archive ${archiveRes.status}`);
  const archive = (await archiveRes.json()) as ArchiveRow[];

  const docs: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  const add = (doc: Record<string, unknown> & { _id: string }) => {
    if (seen.has(doc._id)) return;
    seen.add(doc._id);
    docs.push(doc);
  };
  add({
    _id: `author-${slugify(AUTHOR)}`,
    _type: "author",
    name: AUTHOR,
    slug: { _type: "slug", current: slugify(AUTHOR) },
  });

  let skipped = 0;
  for (const row of archive) {
    if (slugs.has(row.slug) || titles.has(normTitle(row.title ?? ""))) {
      skipped += 1;
      continue;
    }
    const res = await fetch(`${ORIGIN}/api/v1/posts/${row.slug}`);
    if (!res.ok) {
      console.warn("skip", row.slug, res.status);
      continue;
    }
    const p = (await res.json()) as FullPost;
    const html = p.body_html ?? "";
    const md = ghostHtmlToMarkdown(html);
    const { body: rawBody } = markdownToPost(md, CHANNEL);
    const body = enrichSubstackBody(hoistImages(rawBody, p.title), {
      title: p.title,
      subtitle: p.subtitle,
      description: p.description,
    });
    const excerpt = substackExcerpt(p, body, md);
    add({
      _id: postId(p.slug),
      _type: "post",
      channel: CHANNEL,
      origin: "first-party",
      title: p.title,
      slug: { _type: "slug", current: p.slug },
      publishedAt: p.post_date ?? "2021-06-01T00:00:00.000Z",
      excerpt,
      body,
      authors: [{ _type: "reference", _ref: `author-${slugify(AUTHOR)}`, _key: "a0" }],
      coverImage: p.cover_image
        ? { _type: "image", _sanityAsset: `image@${unwrapSubstackImg(p.cover_image)}`, alt: p.title }
        : undefined,
      migration: {
        source: "substack",
        ghostId: p.id != null ? String(p.id) : undefined,
        legacyUrl: p.canonical_url ?? `${ORIGIN}/p/${p.slug}`,
      },
    });
    process.stdout.write(".");
  }

  await writeFile(outFile, docs.map((d) => JSON.stringify(d)).join("\n") + "\n");
  const posts = docs.filter((d) => d._type === "post").length;
  console.log(`\nwrote ${docs.length} docs (${posts} new posts, ${skipped} already imported) to ${outFile}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}

