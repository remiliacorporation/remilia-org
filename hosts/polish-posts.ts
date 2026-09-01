
import { createClient } from "@sanity/client";
import { pathToFileURL } from "node:url";
import { plainFromBlocks, polishBody, smartExcerpt } from "@remilia/renderer";
import type { PTBlock } from "@remilia/renderer";
import { suggestTags, TAG_TAXONOMY } from "./tag-taxonomy";

const write = process.argv.includes("--write");
const idArg = process.argv.find((a) => a.startsWith("--id="))?.slice(5);

type Row = {
  _id: string;
  title: string;
  channel: string;
  excerpt?: string;
  origin?: string;
  outlet?: string;
  body?: PTBlock[];
  commentary?: PTBlock[];
  coverImage?: { alt?: string; asset?: { _ref?: string; _type?: string } };
  seo?: {
    metaTitle?: string;
    metaDescription?: string;
    ogImage?: { asset?: { _ref?: string } };
  };
  tags?: string[];
  migration?: { source?: string };
};

async function ensureTags(
  client: ReturnType<typeof createClient>,
): Promise<Map<string, string>> {
  const existing = await client.fetch<Array<{ _id: string; name: string }>>(
    `*[_type=="tag"]{_id, name}`,
  );
  const byName = new Map(existing.map((t) => [t.name, t._id]));
  for (const t of TAG_TAXONOMY) {
    if (byName.has(t.name)) continue;
    if (!write) {
      byName.set(t.name, `tag-${t.slug}`);
      continue;
    }
    const doc = {
      _id: `tag-${t.slug}`,
      _type: "tag",
      name: t.name,
      slug: { _type: "slug", current: t.slug },
      description: t.description,
    };
    await client.createOrReplace(doc);
    byName.set(t.name, doc._id);
    console.log(`+ tag ${t.name}`);
  }
  return byName;
}

function buildSeo(row: Row, metaDescription: string): Record<string, unknown> {
  const metaTitle = (row.seo?.metaTitle || row.title).slice(0, 70);
  const coverRef = row.coverImage?.asset?._ref;
  const ogRef = row.seo?.ogImage?.asset?._ref || coverRef;
  const seo: Record<string, unknown> = {
    metaTitle,
    metaDescription: metaDescription.slice(0, 180),
  };
  if (ogRef) {
    seo.ogImage = {
      _type: "image",
      asset: { _type: "reference", _ref: ogRef },
      alt: row.coverImage?.alt?.trim() || row.title,
    };
  }
  return seo;
}

async function main() {
  const token = process.env.SANITY_TOKEN || process.env.SANITY_AUTH_TOKEN;
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

  const tagIds = await ensureTags(client);

  const filter = idArg
    ? `_id == "${idArg}"`
    : `_type == "post"`;
  const rows = await client.fetch<Row[]>(
    `*[${filter}]{
      _id, title, channel, excerpt, origin, outlet, body, commentary,
      coverImage{alt, asset{_ref,_type}},
      seo,
      "tags": tags[]->name,
      migration
    } | order(title)`,
  );
  console.log(`${rows.length} posts${write ? "" : " (dry-run)"}`);

  let n = 0;
  for (const row of rows) {
    const title = row.title?.trim() || "Untitled";
    const isExternal = row.channel === "archive" && row.origin === "external";
    const sourceBlocks = (isExternal ? row.commentary : row.body) ?? [];
    const polished = polishBody(sourceBlocks as PTBlock[], title);
    const fromBody = plainFromBlocks(polished);
    const excerpt = smartExcerpt(row.excerpt?.trim() || fromBody || title, 300);
    const seo = buildSeo(row, smartExcerpt(excerpt, 180));
    const tagNames = suggestTags({
      title,
      channel: row.channel,
      origin: row.origin,
      outlet: row.outlet,
      excerpt,
      existing: row.tags,
      source: row.migration?.source,
    });
    const tags = tagNames
      .map((name) => tagIds.get(name))
      .filter((id): id is string => !!id)
      .map((id, i) => ({ _type: "reference" as const, _ref: id, _key: `t${i}` }));

    const coverImage =
      row.coverImage?.asset?._ref
        ? {
            ...row.coverImage,
            alt:
              row.coverImage.alt &&
              row.coverImage.alt.trim() &&
              !/^image$/i.test(row.coverImage.alt)
                ? row.coverImage.alt
                : title,
          }
        : row.coverImage;

    const patch: Record<string, unknown> = {
      excerpt,
      seo,
      tags,
    };
    if (coverImage) patch.coverImage = coverImage;
    if (isExternal) patch.commentary = polished;
    else patch.body = polished;

    const changed =
      excerpt !== row.excerpt ||
      JSON.stringify(polished) !== JSON.stringify(sourceBlocks) ||
      JSON.stringify(tagNames) !== JSON.stringify(row.tags ?? []) ||
      !row.seo?.metaDescription ||
      !row.seo?.ogImage?.asset?._ref ||
      row.seo.metaDescription !== seo.metaDescription;

    if (changed) n += 1;
    if (row._id.includes("admin-reveal") || (changed && n <= 8)) {
      console.log(
        `• ${title.slice(0, 48)} excerpt=${JSON.stringify(excerpt).slice(0, 80)}… tags=${tagNames.join(",")}`,
      );
    }

    if (write && changed) {
      await client.patch(row._id).set(patch).commit();
    }
  }
  console.log(write ? `\ndone (${n} patched)` : `\ndry-run; ${n} would change; pass --write`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

