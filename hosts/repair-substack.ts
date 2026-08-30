/**
 * Re-fetch goldenlight.substack.com posts and rewrite Sanity bodies with
 * uploaded image assets (NDJSON `_sanityAsset` never resolved on mutate).
 *
 *   SANITY_TOKEN=… pnpm --filter @remilia/hosts exec node --import tsx repair-substack.ts
 *   SANITY_TOKEN=… pnpm --filter @remilia/hosts exec node --import tsx repair-substack.ts --write
 */
import { createClient } from "@sanity/client";
import { markdownToPost } from "@remilia/renderer";
import { ghostHtmlToMarkdown } from "./ghost-import";
import { enrichSubstackBody, substackExcerpt, unwrapSubstackImg } from "./substack-import";

const write = process.argv.includes("--write");
const token = process.env.SANITY_TOKEN || process.env.SANITY_AUTH_TOKEN;
if (!token) {
  console.error("Set SANITY_TOKEN");
  process.exit(1);
}

const ORIGIN = "https://goldenlight.substack.com";
const CHANNEL = "archive" as const;

const client = createClient({
  projectId: "8x9419lh",
  dataset: "production",
  apiVersion: "2025-03-20",
  token,
  useCdn: false,
  perspective: "raw",
});

type PTBlock = Record<string, unknown> & { _type?: string; _key?: string };

const assetCache = new Map<string, string>();

async function uploadImage(url: string): Promise<string | null> {
  // Prefer Substack CDN fetch URLs — raw bucketeer S3 returns 403.
  const clean = /substackcdn\.com\/image\/fetch\//.test(url) ? url : unwrapSubstackImg(url);
  if (assetCache.has(clean)) return assetCache.get(clean)!;
  try {
    const res = await fetch(clean, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; remilia-substack-repair/1.0)" },
      redirect: "follow",
    });
    if (!res.ok) {
      console.warn(`  img ${res.status} ${clean.slice(0, 80)}`);
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const ctype = res.headers.get("content-type") || "image/jpeg";
    const ext = ctype.includes("png") ? "png" : ctype.includes("webp") ? "webp" : "jpg";
    const asset = await client.assets.upload("image", buf, {
      filename: `substack-${assetCache.size}.${ext}`,
      contentType: ctype.split(";")[0],
    });
    assetCache.set(clean, asset._id);
    return asset._id;
  } catch (e) {
    console.warn(`  img fail ${clean.slice(0, 60)}: ${(e as Error).message}`);
    return null;
  }
}

async function resolveImages(body: PTBlock[], title: string): Promise<PTBlock[]> {
  const out: PTBlock[] = [];
  for (let i = 0; i < body.length; i++) {
    const b = body[i];
    if (b._type !== "image") {
      out.push({ ...b, _key: b._key ?? `b${i}` });
      continue;
    }
    const url =
      typeof b._sanityAsset === "string"
        ? b._sanityAsset.replace(/^image@/, "")
        : typeof (b.asset as { url?: string } | undefined)?.url === "string"
          ? (b.asset as { url: string }).url
          : undefined;
    if (!url) {
      // already a ref?
      if (b.asset && typeof b.asset === "object" && "_ref" in (b.asset as object)) {
        out.push({ ...b, _key: b._key ?? `b${i}` });
        continue;
      }
      continue;
    }
    const ref = await uploadImage(url);
    if (!ref) continue;
    out.push({
      _type: "image",
      _key: b._key ?? `b${i}`,
      asset: { _type: "reference", _ref: ref },
      alt: (typeof b.alt === "string" && b.alt.trim()) || title,
      caption: b.caption,
    });
  }
  return out;
}

type SanityRow = { _id: string; title: string; slug: string };

async function main() {
  const rows = await client.fetch<SanityRow[]>(
    `*[_type=="post" && migration.source=="substack"]{_id, title, "slug": slug.current} | order(title)`,
  );
  console.log(`${rows.length} substack posts${write ? "" : " (dry-run)"}`);

  for (const row of rows) {
    process.stdout.write(`• ${row.slug} … `);
    const res = await fetch(`${ORIGIN}/api/v1/posts/${row.slug}`);
    if (!res.ok) {
      console.log(`API ${res.status}`);
      continue;
    }
    const p = (await res.json()) as {
      title: string;
      subtitle?: string;
      description?: string;
      body_html?: string;
      cover_image?: string;
      post_date?: string;
      canonical_url?: string;
    };
    // Keep substackcdn fetch URLs (S3 originals 403).
    const html = p.body_html ?? "";
    const md = ghostHtmlToMarkdown(html);
    const { body: rawBody } = markdownToPost(md, CHANNEL);
    const hoisted = (rawBody as PTBlock[]).map((b, i) => {
      if (b._type !== "image") return { ...b, _key: `b${i}` };
      const url = (b.asset as { url?: string } | undefined)?.url;
      if (!url) return { ...b, _key: `b${i}` };
      return {
        _type: "image",
        _key: `b${i}`,
        _sanityAsset: `image@${url}`,
        alt: (typeof b.alt === "string" && b.alt.trim()) || p.title,
        caption: b.caption,
      };
    });
    const resolved = await resolveImages(hoisted, p.title);
    const body = enrichSubstackBody(resolved, {
      title: p.title,
      subtitle: p.subtitle,
      description: p.description,
    }) as PTBlock[];
    const textLen = body
      .filter((b) => b._type === "block")
      .map((b) =>
        ((b.children as Array<{ text?: string }> | undefined) ?? []).map((c) => c.text ?? "").join(""),
      )
      .join(" ")
      .trim().length;
    const imgs = body.filter((b) => b._type === "image").length;
    console.log(`text≈${textLen} imgs=${imgs} sub=${(p.subtitle || p.description || "").slice(0, 40)}`);

    if (!write) continue;

    const excerpt = substackExcerpt(p, body, md);

    const patch: Record<string, unknown> = {
      title: p.title,
      body,
      excerpt,
      origin: "first-party",
    };
    if (p.post_date) patch.publishedAt = p.post_date;
    if (p.cover_image) {
      const coverRef = await uploadImage(p.cover_image);
      if (coverRef) {
        patch.coverImage = {
          _type: "image",
          asset: { _type: "reference", _ref: coverRef },
          alt: p.title,
        };
      }
    }
    await client.patch(row._id).set(patch).commit();
  }

  console.log(write ? "\ndone" : "\ndry-run; pass --write to patch");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
