/**
 * One-shot: rewrite post.channel "studio" → "news" in a Sanity dataset.
 *
 *   SANITY_TOKEN=… pnpm --filter @remilia/hosts exec node --import tsx migrate-studio-to-news.ts
 *
 * Dry-run by default; pass --write to mutate.
 */
import { createClient } from "@sanity/client";

const write = process.argv.includes("--write");
const token = process.env.SANITY_TOKEN ?? process.env.SANITY_API_WRITE_TOKEN;
if (!token) {
  console.error("Set SANITY_TOKEN (write) to migrate.");
  process.exit(1);
}

const client = createClient({
  projectId: "8x9419lh",
  dataset: "production",
  apiVersion: "2026-02-01",
  token,
  useCdn: false,
});

const ids = await client.fetch<string[]>(
  `*[_type == "post" && channel == "studio"]._id`,
);
console.log(`found ${ids.length} studio posts`);
if (!write) {
  console.log("dry-run; pass --write to patch channel → news");
  process.exit(0);
}

const tx = client.transaction();
for (const id of ids) tx.patch(id, { set: { channel: "news" } });
await tx.commit();
console.log(`patched ${ids.length} docs to channel:news`);
