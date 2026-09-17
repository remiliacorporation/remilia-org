// Re-dump all posts (drafts + published) into content-review/posts/*.json + .txt
import { writeFileSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const token = JSON.parse(readFileSync(join(homedir(), ".config/sanity/config.json"), "utf8")).authToken;
const API = "https://8x9419lh.api.sanity.io/v2024-01-01";

const DIR = new URL("../posts/", import.meta.url).pathname;
const QUERY = `*[_type == "post"]{
  "id": _id,
  title,
  "slug": coalesce(slug.current, slug),
  channel,
  excerpt,
  externalUrl,
  outlet,
  origin,
  featured,
  publishedAt,
  "updatedAt": _updatedAt,
  "coverRef": cover.asset._ref,
  "coverAlt": cover.alt,
  "authors": authors[]->{ "id": _id, name },
  "tags": tags[]->{ "id": _id, name },
  migration,
  aliases,
  archiveSnapshot,
  commentary,
  "nAlbums": count(albums),
  seo,
  body
}`;

const spanText = (b) => (b.children ?? []).map((s) => s.text ?? "").join("");
const toTxt = (p) => {
  const lines = [`# ${p.title}`, `id: ${p.id}`, `channel: ${p.channel}  slug: ${p.slug}`, ""];
  for (const b of p.body ?? []) {
    if (b._type === "block") {
      lines.push((b.children ?? []).map((s) => (s.marks?.length ? `[${s.marks.join(",")}]${s.text}` : s.text)).join(""));
    } else {
      lines.push(`<${b._type}${b.asset?._ref ? " " + b.asset._ref : ""}${b.alt ? ` alt="${b.alt}"` : ""}>`);
    }
  }
  return lines.join("\n");
};

const res = await fetch(`${API}/data/query/production?${new URLSearchParams({ query: QUERY, perspective: "raw" })}`, {
  headers: { Authorization: `Bearer ${token}` },
});
const data = await res.json();
if (!res.ok) throw new Error(JSON.stringify(data).slice(0, 500));
const posts = data.result;

rmSync(DIR, { recursive: true, force: true });
mkdirSync(DIR, { recursive: true });
for (const p of posts) {
  writeFileSync(join(DIR, `${p.id}.json`), JSON.stringify(p, null, 2));
  writeFileSync(join(DIR, `${p.id}.txt`), toTxt(p));
}
const fnPosts = posts.filter((p) => (p.body ?? []).some((b) => (b.markDefs ?? []).some((d) => d._type === "footnote")));
console.log(`${posts.length} posts dumped; ${fnPosts.length} with footnote defs`);
