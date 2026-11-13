// Moves every post's footnotes from the old shape (a mark on an empty span,
// which the Studio's editor deletes on the first keystroke in the paragraph)
// to the stored shape (an inline object), and removes stored note numbers
// where the count gives the same numbers. See
// packages/renderer/src/footnotes.ts.
//
// Run from hosts/:
//   pnpm migrate:footnotes                    dry run: prints the plan, writes nothing
//   pnpm migrate:footnotes --write            applies it
// Options:
//   --id <document id>   only this document (repeatable; give the draft id for a draft)
//   --renumber           also remove stored numbers that differ from the reading
//                        order (a number used twice, a first note numbered 2).
//                        This changes the numbers those posts show.
//   --backup <file>      where --write saves every document before changing it
//                        (default ./footnote-backup-<date>.ndjson)
//
// Safety:
// - A dry run needs no token and then sees published documents only. --write
//   needs SANITY_TOKEN or SANITY_AUTH_TOKEN, and with it drafts are migrated
//   too.
// - Before any write, each changed body is rendered before and after; a
//   difference in the HTML or the Markdown stops the run (without --renumber).
// - --write first saves every document it will change, whole, to the backup
//   file; if that fails, nothing is written.
// - Each document is patched only if it still has the revision that was
//   read (`ifRevisionId`), so an edit made meanwhile is never overwritten.
import { createClient } from "@sanity/client";
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  hasOldFootnotes,
  migrateFootnotes,
  portableTextToHtml,
  portableTextToMarkdown,
  type NoteMigration,
  type PTBlock,
} from "@remilia/renderer";

const FIELDS = ["body", "commentary"] as const;

export interface NoteDoc {
  _id: string;
  _rev: string;
  _type: string;
  body?: PTBlock[];
  commentary?: PTBlock[];
}

export interface DocPlan {
  id: string;
  rev: string;
  /** The fields to set, by name. */
  set: Record<string, PTBlock[]>;
  lines: string[];
}

const render = (blocks: PTBlock[]): string =>
  `${portableTextToHtml(blocks, { imageUrl: (i) => i.asset?._ref })}\n${portableTextToMarkdown(blocks)}`;

/**
 * What the migration would do to one document; undefined when it holds no
 * note to move and no number to remove. Throws if a body would render
 * differently afterward (unless `renumber` asked for that).
 */
export function planDoc(
  doc: NoteDoc,
  opts: { renumber?: boolean } = {},
): DocPlan | undefined {
  const set: Record<string, PTBlock[]> = {};
  const lines: string[] = [];
  for (const field of FIELDS) {
    const before = doc[field];
    if (!Array.isArray(before) || !before.length) continue;
    const m: NoteMigration<PTBlock> = migrateFootnotes(before, opts);
    if (!m.moved && !m.unpinned) {
      if (m.pinned)
        lines.push(
          `${field}: ${m.notes} notes keep stored numbers ${m.pinned.join(",")} (pass --renumber to number them in reading order)`,
        );
      continue;
    }
    const same = render(m.blocks) === render(before);
    if (!same && !(opts.renumber && m.pinned))
      throw new Error(
        `${doc._id} ${field}: the page would change. Nothing was written.`,
      );
    if (hasOldFootnotes(m.blocks))
      throw new Error(`${doc._id} ${field}: an old-format note is left.`);
    set[field] = m.blocks;
    lines.push(
      `${field}: ${m.notes} notes, ${m.moved} moved, ${m.unpinned} stored numbers removed` +
        (m.pinned
          ? opts.renumber
            ? `, renumbered from ${m.pinned.join(",")} (the page changes)`
            : `, stored numbers ${m.pinned.join(",")} kept`
          : "") +
        (same ? ", page unchanged" : ""),
    );
  }
  return Object.keys(set).length || lines.length
    ? { id: doc._id, rev: doc._rev, set, lines }
    : undefined;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const ids: string[] = [];
  let backup = `footnote-backup-${new Date().toISOString().slice(0, 10)}.ndjson`;
  let write = false;
  let renumber = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--write") write = true;
    else if (a === "--renumber") renumber = true;
    else if (a === "--id" && args[i + 1]) ids.push(args[++i]);
    else if (a === "--backup" && args[i + 1]) backup = args[++i];
    else throw new Error(`unknown option ${a}`);
  }
  const token = process.env.SANITY_TOKEN ?? process.env.SANITY_AUTH_TOKEN;
  if (write && !token)
    throw new Error("--write needs SANITY_TOKEN or SANITY_AUTH_TOKEN");
  const client = createClient({
    projectId: "8x9419lh",
    dataset: "production",
    apiVersion: "2026-02-01",
    useCdn: false,
    token,
    perspective: "raw",
  });
  if (!token)
    console.log("NOTE no token: published documents only, drafts are not visible");

  const docs = await client.fetch<NoteDoc[]>(
    `*[_type in ["post", "event"] && (count($ids) == 0 || _id in $ids)]{ _id, _rev, _type, body, commentary } | order(_id)`,
    { ids },
  );
  const plans: DocPlan[] = [];
  for (const doc of docs) {
    const plan = planDoc(doc, { renumber });
    if (!plan) continue;
    plans.push(plan);
    for (const line of plan.lines) console.log(`PLAN ${plan.id} ${line}`);
  }
  const changing = plans.filter((p) => Object.keys(p.set).length);
  console.log(
    `${docs.length} documents read, ${changing.length} to change${write ? "" : " (dry run, nothing written)"}`,
  );
  if (!write || !changing.length) return;

  const whole = await client.fetch<Record<string, unknown>[]>(
    `*[_id in $ids]`,
    { ids: changing.map((p) => p.id) },
  );
  for (const p of changing) {
    const doc = whole.find((d) => d._id === p.id);
    if (!doc || doc._rev !== p.rev)
      throw new Error(`${p.id} changed while planning. Nothing was written.`);
  }
  writeFileSync(backup, whole.map((d) => JSON.stringify(d)).join("\n") + "\n", {
    flag: "wx",
  });
  console.log(`backup: ${whole.length} documents saved to ${backup}`);

  for (const p of changing) {
    await client.patch(p.id).ifRevisionId(p.rev).set(p.set).commit();
    console.log(`WROTE ${p.id}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
