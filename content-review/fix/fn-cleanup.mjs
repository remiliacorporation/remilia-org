// Footnote conversion cleanup:
//  1. strip orphan ⁽ ⁾ chars left when ⁽N⁾ markers split across span boundaries
//  2. drop terminal "Footnotes" heading blocks left dangling after note conversion
//  3. nouns-wtf: repair mangled def-1, convert unescaped [2] marker, drop note tail
//  4. viral-public-license: convert unescaped [1]/[2] markers, drop note tail
// Usage: node fn-cleanup.mjs [--apply]
import { readFileSync, writeFileSync, readdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const DIR = new URL("../posts/", import.meta.url).pathname;
const APPLY = process.argv.includes("--apply");
const token = JSON.parse(readFileSync(join(homedir(), ".config/sanity/config.json"), "utf8")).authToken;
const API = "https://8x9419lh.api.sanity.io/v2024-01-01";
const DATASET = "production";
const auth = { Authorization: `Bearer ${token}` };
const key = () => "fn" + Math.random().toString(36).slice(2, 10);

const spanText = (b) => (b.children ?? []).map((s) => s.text ?? "").join("");
const hasDefs = (p) => (p.body ?? []).some((b) => (b.markDefs ?? []).some((d) => d._type === "footnote"));
const HEAD_RE = /^footnotes\.?\s*$/i;

// insert a footnote mark span at (blockIdx, charIdx) replacing `len` chars of marker text
function insertMark(block, charIdx, len, noteText) {
  const def = { _key: key(), _type: "footnote", text: noteText };
  const kids = [];
  let pos = 0;
  for (const s of block.children ?? []) {
    const t = s.text ?? "";
    const end = pos + t.length;
    if (end <= charIdx || pos >= charIdx + len) { kids.push(s); pos = end; continue; }
    const before = t.slice(0, Math.max(0, charIdx - pos));
    const after = t.slice(Math.max(0, charIdx + len - pos));
    if (before) kids.push({ ...s, _key: key(), text: before });
    kids.push({ _key: key(), _type: "span", text: "", marks: [def._key] });
    if (after) kids.push({ ...s, _key: key(), text: after });
    pos = end;
  }
  return { ...block, children: kids, markDefs: [...(block.markDefs ?? []), def] };
}

const posts = readdirSync(DIR).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(join(DIR, f), "utf8")));
const mutations = [], report = [];

for (const p of posts) {
  const body = (p.body ?? []).map((b) => ({ ...b, children: b.children?.map((s) => ({ ...s })) }));
  const changes = [];

  // (1) orphan paren strip — only in posts that carry footnote defs
  if (hasDefs(p)) {
    for (const b of body) {
      if (b._type !== "block") continue;
      for (const s of b.children ?? []) {
        if (/[⁽⁾]/.test(s.text ?? "")) { s.text = s.text.replace(/[⁽⁾]/g, ""); changes.push("paren-strip"); }
      }
    }
  }

  // (2) terminal "Footnotes" heading with nothing after it
  const last = body[body.length - 1];
  if (hasDefs(p) && last?._type === "block" && HEAD_RE.test(spanText(last).trim())) {
    body.pop();
    changes.push("dropped trailing Footnotes heading");
  }

  // (3) nouns-wtf
  if (p.id === "drafts.post-press-nouns-wtf") {
    const note1 = spanText(body[31]).replace(/^\s*1\]:\s*/, "").trim();
    const note2 = spanText(body[32]).replace(/^\s*\[2\]:\s*/, "").trim();
    // repair mangled def (text "1")
    outer: for (const b of body) {
      for (const d of b.markDefs ?? []) {
        if (d._type === "footnote" && d.text === "1") { d.text = note1; changes.push("def-1 repaired"); break outer; }
      }
    }
    // convert [2] marker in block 28
    const b28 = body[28];
    const t28 = spanText(b28);
    const mi = t28.indexOf("[2]");
    if (mi >= 0) { body[28] = insertMark(b28, mi, 3, note2); changes.push("[2]→footnote"); }
    body.splice(30, 3); // heading + two note paragraphs
    changes.push("note tail removed");
  }

  // (4) viral-public-license
  if (p.id === "drafts.post-press-viral-public-license") {
    const note1 = spanText(body[9]).replace(/^\s*1\]\.\s*/, "").trim();
    const note2 = spanText(body[10]).replace(/^\s*\[2\]\s*/, "").trim();
    const t5 = spanText(body[5]);
    const m1 = t5.indexOf("[1]");
    if (m1 >= 0) { body[5] = insertMark(body[5], m1, 3, note1); changes.push("[1]→footnote"); }
    const t7 = spanText(body[7]);
    const m2 = t7.indexOf("[2]");
    if (m2 >= 0) { body[7] = insertMark(body[7], m2, 3, note2); changes.push("[2]→footnote"); }
    const t7b = spanText(body[7]);
    const m3 = t7b.indexOf("[3]");
    if (m3 >= 0) { body[7] = insertMark(body[7], m3, 3, ""); changes.push("[3]→footnote (empty — note text absent on original source too)"); }
    body.splice(8, 4); // "Footnotes." + notes 1,2 + orphan "[3]"
    changes.push("note tail removed (image kept as content)");
  }

  if (!changes.length) continue;
  report.push(`- \`${p.id}\` — ${[...new Set(changes)].join(", ")}`);
  mutations.push({ patch: { id: p.id, set: { body } } });
}

console.log(`${mutations.length} posts patched`);
writeFileSync(new URL("./fn-cleanup-report.md", import.meta.url), `# Footnote cleanup\n\n${report.join("\n")}\n`);
if (APPLY && mutations.length) {
  const res = await fetch(`${API}/data/mutate/${DATASET}`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ mutations }),
  });
  console.log(res.ok ? `committed ${mutations.length}/${mutations.length}` : `${res.status} ${(await res.text()).slice(0, 300)}`);
}
