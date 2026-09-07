import { readdir, readFile, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { markdownToPost, slugFromPath, slugify } from "@remilia/renderer";
import { type Channel, isChannel } from "@remilia/seo";

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (extname(e.name).toLowerCase() === ".md") out.push(p);
  }
  return out;
}

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith("--"));
if (!dir) {
  console.error(
    "usage: md-import.ts <vaultDir> [--channel press] [--out posts.ndjson]",
  );
  process.exit(2);
}
const chFlag = args.find((a, i) => args[i - 1] === "--channel");
const fallback: Channel = chFlag && isChannel(chFlag) ? chFlag : "press";
const outFile = args.find((a, i) => args[i - 1] === "--out") ?? "posts.ndjson";

const docs: Record<string, unknown>[] = [];
const seen = new Set<string>();
const add = (doc: Record<string, unknown> & { _id: string }) => {
  if (seen.has(doc._id)) return;
  seen.add(doc._id);
  docs.push(doc);
};

for (const file of await walk(dir)) {
  const src = await readFile(file, "utf8");
  const { meta, body } = markdownToPost(src, fallback);
  const channel = meta.channel ?? fallback;
  const slug = meta.slug || slugFromPath(file);
  const title = meta.title || slug;
  const publishedAt = meta.publishedAt ?? "2026-01-01T00:00:00.000Z";
  const excerpt = meta.excerpt ?? title;
  if (meta.author) {
    const id = `author-${slugify(meta.author)}`;
    add({
      _id: id,
      _type: "author",
      name: meta.author,
      slug: { _type: "slug", current: slugify(meta.author) },
    });
  }
  for (const name of meta.tags ?? []) {
    const id = `tag-${slugify(name)}`;
    add({
      _id: id,
      _type: "tag",
      name,
      slug: { _type: "slug", current: slugify(name) },
    });
  }
  add({
    _id: `post-${channel}-${slug}`,
    _type: "post",
    channel,
    title,
    slug: { _type: "slug", current: slug },
    publishedAt,
    excerpt,
    markdown: src,
    body,
    authors: meta.author
      ? [
          {
            _type: "reference",
            _ref: `author-${slugify(meta.author)}`,
            _key: "a0",
          },
        ]
      : undefined,
    tags: (meta.tags ?? []).map((name, i) => ({
      _type: "reference",
      _ref: `tag-${slugify(name)}`,
      _key: `t${i}`,
    })),
    migration: { source: "obsidian" },
  });
}

await writeFile(outFile, docs.map((d) => JSON.stringify(d)).join("\n") + "\n");
console.log(`wrote ${docs.length} docs to ${outFile}`);
console.log(
  "import: npx sanity dataset import",
  outFile,
  "<dataset> --replace",
);
