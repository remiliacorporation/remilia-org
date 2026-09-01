
import { createClient } from "@sanity/client";
import { pathToFileURL } from "node:url";
import { enrichSubstackBody, substackExcerpt } from "./substack-import";

const write = process.argv.includes("--write");
const ORIGIN = "https://goldenlight.substack.com";

type PT = Record<string, unknown> & {
  _type?: string;
  alt?: string;
  caption?: string;
  children?: Array<{ text?: string }>;
};

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

  const rows = await client.fetch<
    Array<{ _id: string; title: string; slug: string; body?: PT[]; excerpt?: string }>
  >(
    `*[_type=="post" && migration.source=="substack"]{_id, title, "slug": slug.current, body, excerpt} | order(title)`,
  );
  console.log(`${rows.length} substack posts${write ? "" : " (dry-run)"}`);

  for (const row of rows) {
    const res = await fetch(`${ORIGIN}/api/v1/posts/${row.slug}`, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; remilia-substack-enrich/1.0)" },
    });
    if (!res.ok) {
      console.log(`• ${row.slug} API ${res.status}`);
      continue;
    }
    const p = (await res.json()) as {
      title: string;
      subtitle?: string;
      description?: string;
    };
    const before = row.body ?? [];
    const body = enrichSubstackBody(before, {
      title: p.title || row.title,
      subtitle: p.subtitle,
      description: p.description,
    }) as PT[];
    const excerpt = substackExcerpt(
      { title: p.title || row.title, subtitle: p.subtitle, description: p.description },
      body,
    );
    const textBefore = before
      .filter((b) => b._type === "block")
      .map((b) => (b.children ?? []).map((c) => c.text ?? "").join(""))
      .join("")
      .trim().length;
    const textAfter = body
      .filter((b) => b._type === "block")
      .map((b) => (b.children ?? []).map((c) => c.text ?? "").join(""))
      .join("")
      .trim().length;
    const capsBefore = before.filter((b) => b._type === "image" && b.caption).length;
    const capsAfter = body.filter((b) => b._type === "image" && b.caption).length;
    const changed = textAfter !== textBefore || capsAfter !== capsBefore || excerpt !== row.excerpt;
    console.log(
      `• ${row.slug} text ${textBefore}→${textAfter} caps ${capsBefore}→${capsAfter}${changed ? "" : " (noop)"}`,
    );
    if (write && changed) {
      await client.patch(row._id).set({ body, excerpt }).commit();
    }
  }
  console.log(write ? "\ndone" : "\ndry-run; pass --write");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

