import { createClient } from "@sanity/client";
import { pathToFileURL } from "node:url";
import { classify, type Plan } from "./migrate-classify";
export { classify, parseOutlet, pickExternalUrl } from "./migrate-classify";
const write = process.argv.includes("--write");
const all = process.argv.includes("--all");
const token = process.env.SANITY_TOKEN ?? process.env.SANITY_API_WRITE_TOKEN;
type PostRow = Parameters<typeof classify>[0];
function logPlan(p: Plan): void {
  if (p.from === p.to && p.to !== "archive") return;
  if (p.from === p.to && p.to === "archive") {
    console.log(
      `${p.from} = archive     ${p.reason.padEnd(48)} ${p.title.slice(0, 60)} origin=${p.origin ?? "?"}`,
    );
    return;
  }
  const extra =
    p.to === "archive"
      ? p.origin === "external"
        ? ` origin=external outlet=${p.outlet ?? "—"} url=${p.externalUrl ?? "MISSING"}`
        : ` origin=${p.origin ?? "first-party"}`
      : "";
  console.log(
    `${p.from} → ${p.to.padEnd(12)} ${p.reason.padEnd(48)} ${p.title.slice(0, 60)}${extra}`,
  );
}
function patchPlan(
  tx: ReturnType<ReturnType<typeof createClient>["transaction"]>,
  p: Plan,
): boolean {
  const needsChannel = p.from !== p.to;
  const needsArchiveMeta = p.to === "archive";
  if (!needsChannel && !needsArchiveMeta) return false;
  if (p.to === "archive") {
    const set: Record<string, unknown> = { channel: "archive" };
    if (p.origin) set.origin = p.origin;
    if (p.origin === "external") {
      if (p.externalUrl) set.externalUrl = p.externalUrl;
      if (p.outlet) set.outlet = p.outlet;
      tx.patch(p.id, { set });
    } else {
      tx.patch(p.id, {
        set,
        unset: ["externalUrl", "outlet", "commentary", "archiveSnapshot"],
      });
    }
  } else {
    tx.patch(p.id, {
      set: { channel: p.to },
      unset: [
        "origin",
        "externalUrl",
        "outlet",
        "commentary",
        "archiveSnapshot",
      ],
    });
  }
  return true;
}
async function main() {
  const client = createClient({
    projectId: "8x9419lh",
    dataset: "production",
    apiVersion: "2026-02-01",
    token: token || undefined,
    useCdn: false,
  });
  const filter = all
    ? `*[_type == "post"]`
    : `*[_type == "post" && channel == "press"]`;
  const rows = await client.fetch<PostRow[]>(`${filter}{
      _id, title, "slug": slug.current, channel,
      "tags": tags[]->name,
      "source": migration.source,
      "hrefs": body[].markDefs[].href
    } | order(publishedAt desc)`);
  const plans = rows.map(classify);
  const byChannel = new Map<string, number>();
  for (const p of plans) byChannel.set(p.to, (byChannel.get(p.to) ?? 0) + 1);
  console.log(
    `classified ${plans.length} posts${all ? " (--all)" : " (channel=press only)"}`,
  );
  console.log(
    "by section:",
    [...byChannel.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k}=${v}`)
      .join("  "),
  );
  console.log("");
  let moves = 0;
  for (const p of plans) {
    if (p.from !== p.to) moves++;
    logPlan(p);
  }
  console.log(`\n${moves} channel moves`);
  if (!write) {
    console.log("dry-run; pass --write (and SANITY_TOKEN) to apply");
    console.log(
      "then: FIRECRAWL_API_KEY=… SANITY_TOKEN=… node --import tsx archive-firecrawl.ts --write",
    );
    return;
  }
  if (!token) {
    console.error("Set SANITY_TOKEN (write) to migrate.");
    process.exit(1);
  }
  let patched = 0;
  for (let i = 0; i < plans.length; i += 80) {
    const tx = client.transaction();
    let ops = 0;
    for (const p of plans.slice(i, i + 80)) {
      if (patchPlan(tx, p)) ops++;
    }
    if (ops > 0) {
      await tx.commit();
      patched += ops;
    }
  }
  console.log(`\npatched ${patched} docs`);
  console.log(
    "Next: FIRECRAWL_API_KEY=… SANITY_TOKEN=… node --import tsx archive-firecrawl.ts --write",
  );
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
