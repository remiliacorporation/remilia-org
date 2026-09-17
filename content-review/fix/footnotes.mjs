// Convert glyph/escaped footnote markers + tail note sections → real `footnote` markDefs.
// Usage: node footnotes.mjs [--apply] [id-filter]
import { readFileSync, writeFileSync, readdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const DIR = new URL("../posts/", import.meta.url).pathname;
const APPLY = process.argv.includes("--apply");
const only = process.argv.slice(2).find((a) => !a.startsWith("--"));
const token = JSON.parse(readFileSync(join(homedir(), ".config/sanity/config.json"), "utf8")).authToken;
const API = "https://8x9419lh.api.sanity.io/v2024-01-01";
const DATASET = "production";
const auth = { Authorization: `Bearer ${token}` };
const key = () => "fn" + Math.random().toString(36).slice(2, 10);

const GLYPH = { "¹": 1, "²": 2, "³": 3, "⁴": 4, "⁵": 5, "⁶": 6, "⁷": 7, "⁸": 8, "⁹": 9, "⁰": 0 };
const GLYPH_RE = /[¹²³⁴⁵⁶⁷⁸⁹⁰]+/g;
const PAREN_RE = /⁽([¹²³⁴⁵⁶⁷⁸⁹⁰]+)⁾?/g;
const BRACKET_RE = /\\\[(\d+)\\\](?!:)/g;
const glyphNum = (g) => parseInt([...g].map((c) => GLYPH[c]).join(""), 10);
const spanText = (b) => (b.children ?? []).map((s) => s.text ?? "").join("");

// a block that opens a numbered note: "1. txt" | "1\. txt" | "[1]: txt" | "\[1\]: txt" | "1]: txt"
const NOTE_START = /^\s*(?:\\?\[\s*(\d+)\s*\\?\]\s*:|(\d+)\s*\\?\]\s*:|(\d+)\s*\\\.\s+|(\d+)\.\s+)(.*)/s;
const noteStart = (t) => {
  const m = t.match(NOTE_START);
  if (!m) return null;
  const n = m[1] ?? m[2] ?? m[3] ?? m[4];
  return n == null ? null : { n: parseInt(n, 10), rest: m[5] ?? "" };
};

function parseNotes(body, maxMarker) {
  // locate the notes region
  let headIdx = -1;
  for (let i = body.length - 1; i >= 0; i--) {
    const b = body[i];
    if (b._type !== "block") continue;
    const t = spanText(b).trim();
    if (/^footnotes\s*$/i.test(t) || /^footnotes\s*\n[-=]+\s*$/im.test(t)) { headIdx = i; break; }
    if (/\bfootnotes\b/i.test(t.split("\n")[0].trim()) && t.split("\n")[0].trim().length < 20) { headIdx = i; break; }
  }
  const notes = new Map();
  const consume = new Set();   // block idx removed from body
  const flag = [];
  let region = [];
  let regionStart = -1;

  if (headIdx >= 0) {
    regionStart = headIdx + 1;
    region = body.slice(regionStart);
    consume.add(headIdx);
    // heading block may itself carry notes after the setext rule
    const ht = spanText(body[headIdx]);
    const extra = ht.replace(/^[^\n]*footnotes[^\n]*\n[-=\s]*/im, "");
    if (extra.trim()) region = [{ _type: "block", children: [{ _type: "span", text: extra }] }, ...region];
  } else if (maxMarker > 0) {
    // no heading: take last N non-empty paragraph blocks as sequential notes
    const paras = [];
    for (let i = body.length - 1; i >= 0 && paras.length < maxMarker; i--) {
      const b = body[i];
      if (b._type === "block" && spanText(b).trim()) paras.unshift(i);
      else if (b._type !== "block") continue;
      else break;
    }
    if (paras.length === maxMarker) { regionStart = paras[0]; region = paras.map((i) => body[i]); for (const i of paras) consume.add(i); }
  }
  if (!region.length) return { notes, consume, flag };

  // mode: does the region contain numbered note-openers?
  const noteBlocksOf = new Map(); // num → [blockIdx]
  const numbered = region.filter((b) => b._type === "block" && noteStart(spanText(b)));
  if (numbered.length) {
    let cur = null;
    for (const b of region) {
      if (b._type !== "block") { flag.push("image/media left in note region — kept inline at tail"); continue; }
      const t = spanText(b);
      // split multiline numbered blocks: "1. txt\n\n2. txt"
      const parts = t.split(/(?=^\s*(?:\\?\[\s*\d+\s*\\?\]\s*:|\d+\s*\\?\]\s*:|\d+\s*\\\.\s+|\d+\.\s+))/m).filter((x) => x.trim());
      for (const part of parts) {
        const m = noteStart(part);
        if (m) { cur = m.n; notes.set(cur, m.rest.trim()); }
        else if (cur != null) notes.set(cur, (notes.get(cur) + " " + part.trim()).trim());
      }
      const i = body.indexOf(b);
      if (i >= regionStart) { consume.add(i); if (cur != null) noteBlocksOf.set(cur, [...(noteBlocksOf.get(cur) ?? []), i]); }
    }
  } else {
    // sequential: each non-empty block = next note
    let n = 0;
    for (const b of region) {
      const i = body.indexOf(b);
      if (b._type !== "block") { flag.push("image/media left in note region — kept inline at tail"); continue; }
      const t = spanText(b).trim();
      if (!t) { if (i >= regionStart) consume.add(i); continue; }
      notes.set(++n, t);
      noteBlocksOf.set(n, [i]);
      if (i >= regionStart) consume.add(i);
    }
  }
  return { notes, consume, flag, noteBlocksOf };
}

function markInline(b, notes, warns) {
  let changed = false;
  const defs = [...(b.markDefs ?? [])];
  const kids = [];
  for (const s of b.children ?? []) {
    const t = s.text ?? "";
    const hits = [];
    for (const [re, dec] of [
      [PAREN_RE, (x) => glyphNum(x[1])],
      [BRACKET_RE, (x) => parseInt(x[1], 10)],
      [GLYPH_RE, (x) => glyphNum(x[0])],
    ]) {
      re.lastIndex = 0;
      let mm;
      while ((mm = re.exec(t))) hits.push({ i: mm.index, len: mm[0].length, n: dec(mm) });
    }
    hits.sort((a, z) => a.i - z.i);
    if (!hits.length) { kids.push(s); continue; }
    changed = true;
    let last = 0;
    for (const h of hits) {
      if (h.i > last) kids.push({ ...s, _key: key(), text: t.slice(last, h.i) });
      const text = notes.get(h.n);
      if (text == null) warns.push(`marker ${h.n} has no note`);
      const def = { _key: key(), _type: "footnote", text: text ?? `[note ${h.n} missing]` };
      defs.push(def);
      kids.push({ _key: key(), _type: "span", text: "", marks: [...(s.marks ?? []), def._key] });
      last = h.i + h.len;
    }
    if (last < t.length) kids.push({ ...s, _key: key(), text: t.slice(last) });
  }
  return changed ? { children: kids, markDefs: defs } : null;
}

const posts = readdirSync(DIR).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(join(DIR, f), "utf8")));
const mutations = [], report = [];
for (const p of posts) {
  if (only && !p.id.includes(only)) continue;
  const body = p.body ?? [];
  const markerNums = new Set();
  for (const b of body) {
    if (b._type !== "block") continue;
    const t = spanText(b);
    for (const m of t.matchAll(GLYPH_RE)) markerNums.add(glyphNum(m[0]));
    for (const m of t.matchAll(PAREN_RE)) markerNums.add(glyphNum(m[1]));
    for (const m of t.matchAll(BRACKET_RE)) markerNums.add(parseInt(m[1], 10));
  }
  if (!markerNums.size) continue;

  const { notes, consume, flag, noteBlocksOf } = parseNotes(body, Math.max(...markerNums));
  const warns = [...flag];
  // orphan notes (no inline marker) — keep their blocks in the body
  for (const n of notes.keys()) if (!markerNums.has(n)) for (const i of noteBlocksOf?.get(n) ?? []) consume.delete(i);
  let changed = false;
  const newBody = [];
  for (let i = 0; i < body.length; i++) {
    const b = body[i];
    if (consume.has(i)) continue;
    if (b._type !== "block") { newBody.push(b); continue; }
    const r = markInline(b, notes, warns);
    if (r) { changed = true; newBody.push({ ...b, children: r.children, markDefs: r.markDefs }); }
    else newBody.push(b);
  }
  while (newBody.length && newBody[newBody.length - 1]._type === "block" && !spanText(newBody[newBody.length - 1]).trim()) newBody.pop();

  const missing = [...markerNums].filter((n) => !notes.has(n));
  const orphan = [...notes.keys()].filter((n) => !markerNums.has(n));
  if (!changed) { report.push(`- \`${p.id}\` — no inline markers converted`); continue; }
  if (notes.size === 0 || missing.length >= markerNums.size * 0.9) {
    report.push(`- \`${p.id}\` — **FLAGGED, not converted**: ${markerNums.size} markers but note text lost on import (notes parsed: ${[...notes.keys()].join(",") || "none"}) — restore from source in Studio`);
    continue;
  }
  report.push(`- \`${p.id}\`\n  markers→footnotes: ${[...markerNums].sort((a, b) => a - b).join(",")}\n  notes parsed: ${[...notes.keys()].sort((a, b) => a - b).join(",") || "none"}${missing.length ? `\n  MISSING note text for markers: ${missing.join(",")}` : ""}${orphan.length ? `\n  ORPHAN notes (no marker): ${orphan.join(",")}` : ""}${warns.length ? `\n  ${warns.join("; ")}` : ""}`);
  mutations.push({ patch: { id: p.id, set: { body: newBody } } });
}
console.log(`${mutations.length} posts patched`);
writeFileSync(new URL("./footnotes-report.md", import.meta.url), `# Footnote conversion\n\n${report.join("\n")}\n`);
if (APPLY && mutations.length) {
  for (let i = 0; i < mutations.length; i += 40) {
    const res = await fetch(`${API}/data/mutate/${DATASET}`, { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ mutations: mutations.slice(i, i + 40) }) });
    console.log(res.ok ? `committed ${Math.min(i + 40, mutations.length)}/${mutations.length}` : `batch ${i}: ${res.status} ${(await res.text()).slice(0, 300)}`);
  }
}
