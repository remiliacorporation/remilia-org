// Repair footnote conversion damage using posts.before as source of truth.
// Per post: marker order (prose scan of before-dump) + source notes (region parse)
// → each footnote def gets correct `text` + `n` (source number).
// Orphan notes (no marker) become trailing sidenote defs under a "Footnotes" heading.
// Usage: node fn-repair.mjs [--apply]
import { readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const DIR = new URL("../posts/", import.meta.url).pathname;
const BEFORE = new URL("../posts.before/", import.meta.url).pathname;
const APPLY = process.argv.includes("--apply");
const token = JSON.parse(readFileSync(join(homedir(), ".config/sanity/config.json"), "utf8")).authToken;
const API = "https://8x9419lh.api.sanity.io/v2024-01-01";
const DATASET = "production";
const auth = { Authorization: `Bearer ${token}` };
const key = () => "fn" + Math.random().toString(36).slice(2, 10);

const spanText = (b) => (b.children ?? []).map((s) => s.text ?? "").join("");
const GLYPH = { "¹": 1, "²": 2, "³": 3, "⁴": 4, "⁵": 5, "⁶": 6, "⁷": 7, "⁸": 8, "⁹": 9, "⁰": 0 };
const gn = (g) => parseInt([...g].map((c) => GLYPH[c]).join(""), 10);
const HEAD = /^\s*(footnotes|notes)\s*\.?\s*$/i;
const NOTE_START = /^\s*(?:\\?\[\s*(\d+)\s*\\?\]\s*[:\s]|(\d+)\s*\\?\]\s*[:\s]|(\d+)\s*\\\.\s+|(\d+)\.\s+)(.*)/s;

// --- recover marker order + notes from the before-dump ---
function extract(id) {
  const bef = JSON.parse(readFileSync(join(BEFORE, `${id}.json`), "utf8"));
  const body = bef.body ?? [];
  let headIdx = -1;
  for (let i = body.length - 1; i >= 0; i--) {
    const b = body[i];
    if (b._type !== "block") continue;
    const t = spanText(b).trim();
    if (HEAD.test(t) || /^footnotes\s*\n[-=]+\s*$/im.test(spanText(b))) { headIdx = i; break; }
  }
  // if no heading, notes region starts at first \[N]:-style block in tail
  if (headIdx < 0) {
    for (let i = 0; i < body.length; i++) {
      const b = body[i];
      if (b._type === "block" && NOTE_START.test(spanText(b))) { headIdx = i - 1; break; }
    }
  }
  const proseEnd = headIdx >= 0 ? headIdx : body.length;
  const markers = [];
  for (let i = 0; i < proseEnd; i++) {
    const b = body[i];
    if (b._type !== "block") continue;
    const t = spanText(b);
    for (const m of t.matchAll(/⁽([¹²³⁴⁵⁶⁷⁸⁹⁰]+)⁾?|\\\[(\d+)\\\](?!:)|([¹²³⁴⁵⁶⁷⁸⁹⁰]+)/g))
      markers.push(m[1] != null ? gn(m[1]) : m[2] != null ? +m[2] : gn(m[3]));
  }
  const region = body.slice(proseEnd + 1);
  const numbered = region.some((b) => b._type === "block" && NOTE_START.test(spanText(b)));
  const notes = new Map();
  let cur = null;
  if (numbered) {
    for (const b of region) {
      if (b._type !== "block") continue;
      const t = spanText(b);
      const parts = t.split(/(?=^\s*(?:\\?\[\s*\d+\s*\\?\]\s*:|\d+\s*\\?\]\s*:|\d+\s*\\\.\s+|\d+\.\s+))/m).filter((x) => x.trim());
      for (const part of parts) {
        const m = part.match(NOTE_START);
        if (m) { cur = +(m[1] ?? m[2] ?? m[3] ?? m[4]); notes.set(cur, (m[5] ?? "").trim()); }
        else if (cur != null) notes.set(cur, (notes.get(cur) + " " + part.trim()).trim());
      }
    }
  } else {
    let n = 0;
    for (const b of region) {
      if (b._type !== "block") continue;
      const t = spanText(b).trim();
      if (t) notes.set(++n, t);
    }
  }
  return { markers, notes };
}

// collect footnote defs of a doc in document order → [{block, def, spanIdx}]
function defsInOrder(body) {
  const out = [];
  body.forEach((b, bi) => {
    if (b._type !== "block") return;
    const defs = b.markDefs ?? [];
    const fnKeys = new Set(defs.filter((d) => d._type === "footnote").map((d) => d._key));
    (b.children ?? []).forEach((s, si) => {
      for (const m of s.marks ?? []) if (fnKeys.has(m)) out.push({ bi, si, key: m });
    });
  });
  return out;
}

const mutations = [], report = [];

const repair = (id, fn) => {
  const p = JSON.parse(readFileSync(join(DIR, `${id}.json`), "utf8"));
  const body = (p.body ?? []).map((b) => ({ ...b, children: b.children?.map((s) => ({ ...s })), markDefs: (b.markDefs ?? []).map((d) => ({ ...d })) }));
  const r = fn(body);
  if (r) { mutations.push({ patch: { id, set: { body } } }); report.push(`- \`${id}\` — ${r}`); }
};

// generic: defs in doc order ↔ markers in doc order; fix text + set n; orphans → trailing
function genericFix(id, { dropBlocks = [], heading = true } = {}) {
  const { markers, notes } = extract(id);
  repair(id, (body) => {
    for (const i of dropBlocks.slice().sort((a, b) => b - a)) body.splice(i, 1);
    const refs = defsInOrder(body);
    const lines = [];
    refs.forEach((r, i) => {
      const n = markers[i];
      const b = body[r.bi];
      const def = (b.markDefs ?? []).find((d) => d._key === r.key);
      if (n == null) { lines.push(`  def@${r.bi}: no marker for position ${i + 1} — left`); return; }
      def.n = n;
      const txt = notes.get(n);
      if (txt == null) lines.push(`  def@${r.bi} marker ${n}: no note text — left empty`);
      else { def.text = txt; }
    });
    // orphan notes → trailing sidenote defs
    const orphan = [...notes.keys()].filter((n) => !markers.includes(n) && (notes.get(n) ?? "").trim());
    if (orphan.length) {
      if (heading) body.push({ _key: key(), _type: "block", style: "normal", markDefs: [], children: [{ _key: key(), _type: "span", text: "Footnotes" }] });
      const defs = [], kids = [];
      for (const n of orphan) {
        const def = { _key: key(), _type: "footnote", n, text: notes.get(n) };
        defs.push(def);
        kids.push({ _key: key(), _type: "span", text: "", marks: [def._key] }, { _key: key(), _type: "span", text: " " });
      }
      kids.pop();
      body.push({ _key: key(), _type: "block", style: "normal", markDefs: defs, children: kids });
    }
    lines.unshift(`markers [${markers.join(",")}] ↔ defs ${refs.length}; orphans→trailing: ${orphan.join(",") || "none"}`);
    return lines.join("\n");
  });
}

// --- per-post repairs ---

// kali: defs already map 1..17; set n + restore lost orphan notes 18–25 as trailing sidenotes
genericFix("drafts.post-press-kali-acc-basilisk-a-survival-horror-eschatology");

// shifted posts: heading was parsed as note 1 → reassign texts from real notes
genericFix("drafts.post-press-a-peoples-history-of-hot-pot");
genericFix("drafts.post-press-can-whats-playing-milady-make-it-to-level-2");
genericFix("drafts.post-press-jadeposting");
genericFix("drafts.post-press-dynasty-mindset");
genericFix("drafts.post-press-redacted-remilio-babies-notes-on-the-design-process");

// network-angels: marker 1's note is empty on source; block 28 is the converted
// note-header remnant → drop it; "Guest post by @proanatwink" byline line is not a note.
repair("drafts.post-press-notes-on-network-angels-and-god-guest-post-proanatwink", (body) => {
  const refs = defsInOrder(body);
  // first ref (prose) → n:1, empty text; second ref (block 28 remnant) → remove
  const [r1, r2] = refs;
  if (r1) { const d = body[r1.bi].markDefs.find((d) => d._key === r1.key); d.n = 1; d.text = ""; }
  if (r2) {
    const b = body[r2.bi];
    b.children = (b.children ?? []).filter((s) => !(s.marks ?? []).includes(r2.key));
    b.markDefs = (b.markDefs ?? []).filter((d) => d._key !== r2.key);
    if (!spanText(b).replace(/[.\s]/g, "")) body.splice(r2.bi, 1); // remnant was just "." → drop block
  }
  return "marker 1 → empty note (empty on source); dropped converted note-header remnant";
});

// reality: set n 1..5; strip the [6] text embedded in note 2 → real trailing def n:6
const REALITY_NOTE2 = "Media records—writing, photographs, video—have long held status as reliable for historical verification however we are quickly entering an age where records can be easily faked, casting doubt on our grounding of history. Orwell famously explored this in “1984” from the perspective of State manipulation, but we see it occuring as a decentralized symptom of advancing technology [6]";
const REALITY_NOTE6 = "Technology has a teleology; its advancements follow natural law, each new result an inevitability, rapidly distributed & decentralized. Only counter-thesis to counter this undeterring march relies on the destruction of human consciousness itself, we can talk about that later.";
repair("drafts.post-press-reality-after-the-wired", (body) => {
  const refs = defsInOrder(body);
  refs.forEach((r, i) => {
    const d = body[r.bi].markDefs.find((d) => d._key === r.key);
    d.n = i + 1;
    if (d.n === 2) d.text = REALITY_NOTE2;
  });
  const def = { _key: key(), _type: "footnote", n: 6, text: REALITY_NOTE6 };
  body.push({ _key: key(), _type: "block", style: "normal", markDefs: [def], children: [{ _key: key(), _type: "span", text: "", marks: [def._key] }] });
  return "n:1–5 set; note 6 un-nested → trailing sidenote (linked from [6] inside note 2)";
});

// angelicism: set n 1,1,2; replace plain-text [3] paragraph with a real trailing def
repair("drafts.post-press-angelicism01-collected-commentaries-on-milady", (body) => {
  const refs = defsInOrder(body);
  const ns = [1, 1, 2];
  refs.forEach((r, i) => { const d = body[r.bi].markDefs.find((d) => d._key === r.key); d.n = ns[i]; });
  // last two blocks: "Footnotes" heading + "[3] …" text → convert the text to a def
  const note3 = "A more detailed description is found here: ‘Milady Maker is a collection of 10,000 generative pfpNFT’s in a neochibi aesthetic with randomized cosmetics inspired by 00’s Tokyo street fashion. Under the vision of digital artist Milady Sonora, Milady’s are designed to be fashion-minded and genuinely good social media avatars, and an invitation into their personal aesthetic world.’";
  const last = body[body.length - 1];
  if (spanText(last).startsWith("[3]")) {
    const def = { _key: key(), _type: "footnote", n: 3, text: note3 };
    body[body.length - 1] = { _key: last._key, _type: "block", style: "normal", markDefs: [def], children: [{ _key: key(), _type: "span", text: "", marks: [def._key] }] };
  }
  return "n:1,1,2 set; orphan note 3 → trailing sidenote under Footnotes heading";
});

// viral + cancelled-will + nouns: set n only (texts already correct)
for (const [id, ns] of [
  ["drafts.post-press-viral-public-license", [1, 2, 3]],
  ["drafts.post-press-the-cancelled-will-inherit-the-earth", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]],
  ["drafts.post-press-nouns-wtf", [1, 2]],
]) {
  repair(id, (body) => {
    const refs = defsInOrder(body);
    refs.forEach((r, i) => { if (ns[i] != null) body[r.bi].markDefs.find((d) => d._key === r.key).n = ns[i]; });
    return `n set: ${ns.join(",")}`;
  });
}

console.log(`${mutations.length} posts to patch\n`);
console.log(report.join("\n"));
writeFileSync(new URL("./fn-repair-report.md", import.meta.url), `# Footnote repair\n\n${report.join("\n")}\n`);
if (APPLY && mutations.length) {
  const res = await fetch(`${API}/data/mutate/${DATASET}`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ mutations }),
  });
  console.log(res.ok ? `\ncommitted ${mutations.length}/${mutations.length}` : `${res.status} ${(await res.text()).slice(0, 300)}`);
}
