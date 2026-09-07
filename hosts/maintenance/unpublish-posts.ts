import { createClient, type SanityClient } from "@sanity/client";
import { createHash } from "node:crypto";

const write = process.argv.includes("--write");
const token = process.env.SANITY_TOKEN || process.env.SANITY_AUTH_TOKEN;
if (!token) {
  console.error("Set SANITY_TOKEN or SANITY_AUTH_TOKEN");
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

function shortenId(id: string, channel: string, slug: string): string {
  const base = `post-${channel}-${slug}`
    .replace(/[^a-z0-9-]+/gi, "-")
    .toLowerCase();
  if (`drafts.${base}`.length <= 128) return base;
  const hash = createHash("sha1").update(id).digest("hex").slice(0, 10);
  return `${base.slice(0, 100)}-${hash}`;
}

async function unpublishOne(c: SanityClient, id: string) {
  const draftId = `drafts.${id}`;
  if (draftId.length > 128) {
    const doc = await c.getDocument(id);
    if (!doc) return { id, ok: false, reason: "missing" };
    const channel = String(doc.channel ?? "press");
    const slug =
      typeof doc.slug === "object" && doc.slug && "current" in doc.slug
        ? String((doc.slug as { current: string }).current)
        : id.slice(-40);
    const newId = shortenId(id, channel, slug);
    const { _rev, _id, ...rest } = doc as Record<string, unknown> & {
      _type: string;
      _rev?: string;
      _id: string;
    };
    await c.createOrReplace({ ...rest, _id: newId });
    await c.delete(id);
    await c.action({
      actionType: "sanity.action.document.unpublish",
      publishedId: newId,
      draftId: `drafts.${newId}`,
    });
    return { id, ok: true, renamed: newId };
  }

  await c.action({
    actionType: "sanity.action.document.unpublish",
    publishedId: id,
    draftId,
  });
  return { id, ok: true };
}

async function main() {
  const junk = await client.fetch<string[]>(
    `*[_type=="post" && _id in path("drafts.**") && (!defined(title) || title == null)]._id`,
  );
  if (junk.length) {
    console.log(`junk drafts: ${junk.length}`, junk);
    if (write) {
      for (const id of junk) await client.delete(id);
    }
  }

  const published = await client.fetch<
    Array<{
      _id: string;
      title?: string;
      channel?: string;
      publishedAt?: string;
    }>
  >(
    `*[_type == "post" && !(_id in path("drafts.**"))]{_id,title,channel,publishedAt} | order(publishedAt desc)`,
  );
  const drafts = await client.fetch<number>(
    `count(*[_type=="post" && _id in path("drafts.**")])`,
  );

  console.log(
    `${published.length} published, ${drafts} drafts` +
      `${write ? "" : " (dry-run — pass --write)"}`,
  );
  const missingDates = published.filter((p) => !p.publishedAt);
  if (missingDates.length) {
    console.warn(`WARNING published missing dates: ${missingDates.length}`);
  }

  if (!write) {
    for (const p of published.slice(0, 5)) {
      console.log(
        `  would unpublish ${(p.publishedAt ?? "?").slice(0, 10)}\t${p.channel}\t${p.title?.slice(0, 50)}`,
      );
    }
    return;
  }

  let ok = 0;
  let fail = 0;
  for (const p of published) {
    try {
      const res = await unpublishOne(client, p._id);
      ok++;
      if (res.renamed)
        console.log(`  renamed+unpublished ${p._id} → ${res.renamed}`);
      else if (ok % 10 === 0) console.log(`  … ${ok}/${published.length}`);
    } catch (e) {
      fail++;
      console.error(`  FAIL ${p._id}:`, (e as Error).message);
    }
  }

  const after = await client.fetch(`{
    "published": count(*[_type=="post" && !(_id in path("drafts.**"))]),
    "drafts": count(*[_type=="post" && _id in path("drafts.**")]),
    "missingDates": count(*[_type=="post" && !defined(publishedAt)])
  }`);
  console.log(`done ok=${ok} fail=${fail}`, after);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
