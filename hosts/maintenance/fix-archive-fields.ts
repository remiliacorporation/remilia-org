import { createClient } from "@sanity/client";

const write = process.argv.includes("--write");
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

type Row = {
  _id: string;
  title?: string;
  body?: unknown[];
  commentary?: unknown[];
  archiveSnapshot?: string;
};

async function main() {
  const rows = await client.fetch<Row[]>(
    `*[_type=="post" && channel=="archive" && origin=="external"]{
      _id, title, body, commentary, archiveSnapshot
    } | order(title)`,
  );

  let move = 0;
  let skip = 0;
  for (const r of rows) {
    const hasBody = Array.isArray(r.body) && r.body.length > 0;
    const hasCommentary =
      Array.isArray(r.commentary) && r.commentary.length > 0;
    if (!hasBody) {
      console.log(`skip (no body)  ${r.title?.slice(0, 60)}`);
      skip++;
      continue;
    }
    if (hasCommentary) {
      console.log(`skip (commentary set)  ${r.title?.slice(0, 60)}`);
      skip++;
      continue;
    }
    console.log(
      `move body→commentary  ${r.title?.slice(0, 55)}  body=${r.body!.length} snap=${r.archiveSnapshot?.length ?? 0}`,
    );
    move++;
    if (!write) continue;
    await client
      .patch(r._id)
      .set({ commentary: r.body })
      .unset(["body"])
      .commit();
  }

  console.log(
    `\n${move} to move, ${skip} skipped${write ? "" : " (dry-run — pass --write)"}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
