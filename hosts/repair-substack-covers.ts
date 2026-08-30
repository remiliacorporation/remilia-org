/**
 * Re-fetch Substack cover images (+ repair image-only bodies missing text).
 *
 *   SANITY_TOKEN=… pnpm --filter @remilia/hosts exec node --import tsx repair-substack-covers.ts --write
 */
import { createClient } from "@sanity/client";
import { markdownToPost } from "@remilia/renderer";
import { ghostHtmlToMarkdown } from "./ghost-import";

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

const assetCache = new Map<string, string>();

function toFetchableCover(url: string): string {
  // Unwrap nested CDN → S3 (path may be percent-encoded), then re-wrap.
  const m =
    url.match(/substackcdn\.com\/image\/fetch\/[^/]+\/(.+)$/) ||
    url.match(/cdn\.substack\.com\/image\/fetch\/[^/]+\/(.+)$/);
  let s3 = m ? m[1] : url;
  try {
    s3 = decodeURIComponent(s3);
  } catch {
    /* keep */
  }
  if (!/^https?:\/\//i.test(s3)) return url;
  return `https://substackcdn.com/image/fetch/$s_!aa1e!,w_1456,c_limit,f_auto,q_auto:good,fl_progressive:steep/${encodeURIComponent(s3)}`;
}

async function uploadImage(url: string): Promise<string | null> {
  const clean = toFetchableCover(url);
  if (assetCache.has(clean)) return assetCache.get(clean)!;
  try {
    const res = await fetch(clean, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; remilia-substack-covers/1.0)" },
      redirect: "follow",
    });
    if (!res.ok) {
      console.warn(`  img ${res.status} ${clean.slice(0, 90)}`);
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const ctype = res.headers.get("content-type") || "image/jpeg";
    const ext = ctype.includes("png") ? "png" : ctype.includes("webp") ? "webp" : "jpg";
    const asset = await client.assets.upload("image", buf, {
      filename: `substack-cover-${assetCache.size}.${ext}`,
      contentType: ctype.split(";")[0],
    });
    assetCache.set(clean, asset._id);
    return asset._id;
  } catch (e) {
    console.warn(`  img fail: ${(e as Error).message}`);
    return null;
  }
}

type Row = {
  _id: string;
  title: string;
  slug: string;
  hasCover: boolean;
  textLen: number | null;
  imgCount: number;
};

async function main() {
  const rows = await client.fetch<Row[]>(
    `*[_type=="post" && migration.source=="substack"]{
      _id, title, "slug": slug.current,
      "hasCover": defined(coverImage.asset._ref),
      "textLen": length(pt::text(body)),
      "imgCount": count(body[_type=="image"])
    } | order(title)`,
  );

  const targets = rows.filter((r) => !r.hasCover || !r.textLen);
  console.log(`${rows.length} substack; ${targets.length} need cover and/or text${write ? "" : " (dry-run)"}`);

  for (const row of targets) {
    process.stdout.write(`• ${row.slug} (cover=${row.hasCover} text=${row.textLen ?? 0}) … `);
    const res = await fetch(`${ORIGIN}/api/v1/posts/${row.slug}`);
    if (!res.ok) {
      console.log(`API ${res.status}`);
      continue;
    }
    const p = (await res.json()) as {
      title: string;
      body_html?: string;
      cover_image?: string;
      description?: string;
      subtitle?: string;
    };

    const patch: Record<string, unknown> = {};

    if (!row.hasCover && p.cover_image) {
      const ref = await uploadImage(p.cover_image);
      if (ref) {
        patch.coverImage = {
          _type: "image",
          asset: { _type: "reference", _ref: ref },
          alt: p.title,
        };
      }
    }

    if (!row.textLen && p.body_html) {
      const md = ghostHtmlToMarkdown(p.body_html);
      const { body: rawBody } = markdownToPost(md, CHANNEL);
      type PT = Record<string, unknown> & { _type?: string; asset?: { url?: string }; alt?: string; caption?: string };
      const blocks: PT[] = [];
      for (let i = 0; i < (rawBody as PT[]).length; i++) {
        const b = (rawBody as PT[])[i];
        if (b._type !== "image") {
          blocks.push({ ...b, _key: `b${i}` });
          continue;
        }
        const url = b.asset?.url;
        if (!url) continue;
        const ref = await uploadImage(url);
        if (!ref) continue;
        blocks.push({
          _type: "image",
          _key: `b${i}`,
          asset: { _type: "reference", _ref: ref },
          alt: b.alt?.trim() || p.title,
          caption: b.caption,
        });
      }
      if (blocks.length) patch.body = blocks;
      const excerpt = (p.description || p.subtitle || md.replace(/[#*_>`\[\]]/g, " ").replace(/\s+/g, " ").trim() || p.title).slice(0, 300);
      patch.excerpt = excerpt;
    }

    console.log(`patch keys=${Object.keys(patch).join(",") || "none"}`);
    if (write && Object.keys(patch).length) {
      await client.patch(row._id).set(patch).commit();
    }
  }

  console.log(write ? "\ndone" : "\ndry-run; pass --write");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
