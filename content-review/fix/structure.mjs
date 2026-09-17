// structure.mjs — repair imported block structure: setext headings,
// flattened numbered/roman lists, rule lines.
// Usage: node content-review/fix/structure.mjs [--apply] [--only <substr>]
import { readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

const APPLY = process.argv.includes("--apply");
const onlyIdx = process.argv.indexOf("--only");
const ONLY = onlyIdx > -1 ? process.argv[onlyIdx + 1] : null;
const PROJECT = "8x9419lh", DATASET = "production";
const cfg = JSON.parse(readFileSync(`${process.env.HOME}/.config/sanity/config.json`, "utf8"));
const API = `https://${PROJECT}.api.sanity.io/v2024-01-01`;
const auth = { Authorization: `Bearer ${cfg.authToken}` };
const key = () => randomBytes(4).toString("hex");

// raw perspective keeps the real _id — drafts.* docs are what we patch
const res = await fetch(`${API}/data/query/${DATASET}?perspective=raw&query=` +
  encodeURIComponent('*[_type=="post" && defined(body)]{_id, "s": slug.current, body}'),
  { headers: auth });
const posts = ((await res.json()).result ?? [])
  .filter((p) => p._id.startsWith("drafts."))
  .filter((p) => !ONLY || p._id.includes(ONLY) || (p.s ?? "").includes(ONLY));

const RULE = "[-–—=_*]{3,}";
const setextRe = new RegExp(`^([^\\n]*\\S[^\\n]*)\\n+${RULE}\\s*$`);
const ruleOnlyRe = new RegExp(`^${RULE}\\s*$`);
const numStart = /^[ \t]*(\d+)\.[ \t]+/;
const romanStart = /^[ \t]*\(([ivxlcdm]+)\)[ \t]*/i;

const text = (b) => (b.children ?? []).map((s) => s.text ?? "").join("");
const span = (text, marks = []) => ({ _key: key(), _type: "span", text, marks });
const item = (children, markDefs, listItem) => ({
  _key: key(), _type: "block", style: "normal", listItem, level: 1, markDefs, children,
});
const h2 = (title, markDefs = []) => ({
  _key: key(), _type: "block", style: "h2", markDefs, children: [span(title)],
});
const divider = () => ({ _key: key(), _type: "divider" });
const unescapeMd = (t) => t.replace(/\\([.[\]*_`#\\-])/g, "$1");

// one block whose text is "1. …\n2. …" → list items; footnote marks ride along
function splitNumbered(b) {
  const items = []; // each: {children, nums}
  let cur = null;
  for (const s of b.children ?? []) {
    const pieces = (s.text ?? "").split(/(?:\n[ \t]*)+(?=\d+\.[ \t])/);
    for (const [pi, piece] of pieces.entries()) {
      const m = piece.match(numStart);
      if (m) {
        cur = { children: [span(piece.slice(m[0].length), s.marks ?? [])], nums: [+m[1]] };
        items.push(cur);
      } else if (pi === 0) {
        if (piece.trim()) return null; // real text before the first number
        // whitespace/empty span — a footnote mark may still ride on it
        if (cur && (s.marks ?? []).length) cur.children.push(span(piece, s.marks));
      } else if (cur && (piece || (s.marks ?? []).length)) {
        cur.children.push(span(piece, s.marks ?? []));
      }
    }
  }
  if (items.length < 2) return null;
  const seq = items.every((it, i) => it.nums[0] === i + 1);
  const defs = (b.markDefs ?? []);
  return items.map((it) => {
    const used = new Set(it.children.flatMap((s) => s.marks ?? []));
    return item(
      seq ? it.children : it.children.map((c, i) => (i === 0 ? { ...c, text: `${it.nums[0]}. ${c.text}` } : c)),
      defs.filter((d) => used.has(d._key)),
      seq ? "number" : "bullet",
    );
  });
}

function transformBody(body, notes) {
  const out = [];
  const isNum = (b) => b._type === "block" && !b.listItem && (b.style ?? "normal") === "normal" && numStart.test(text(b));
  const isRoman = (b) => b._type === "block" && !b.listItem && (b.style ?? "normal") === "normal" && romanStart.test(text(b));

  for (let i = 0; i < body.length; i++) {
    const b = body[i];
    if (b._type !== "block" || b.listItem) { out.push(b); continue; }
    const t = text(b);

    // "Title\n----" / "Title\n====" → h2 + divider
    const sx = t.match(setextRe);
    if (sx) {
      const title = unescapeMd(sx[1].trim());
      if (title.length <= 120) {
        out.push(h2(title, b.markDefs ?? []), divider());
        notes.push(`setext → h2+hr: "${title.slice(0, 50)}"`);
        continue;
      }
      notes.push(`FLAG: setext title too long (${title.length}) — left as-is`);
    }
    // a lone rule line → divider
    if (ruleOnlyRe.test(t.trim())) {
      out.push(divider());
      notes.push("rule line → divider");
      continue;
    }
    // bare "Footnotes" paragraph heading the note list → h2
    if (/^\s*Footnotes\s*$/i.test(t) && (b.style ?? "normal") === "normal") {
      out.push(h2("Footnotes", b.markDefs ?? []));
      notes.push(`"Footnotes" para → h2`);
      continue;
    }
    // a run of separate "(i) (ii) …" roman blocks → bullet list, literals kept
    if (isRoman(b)) {
      const run = [];
      while (i < body.length && isRoman(body[i])) { run.push(body[i]); i++; }
      i--;
      for (const rb of run) out.push(item(rb.children ?? [], rb.markDefs ?? [], "bullet"));
      notes.push(`${run.length} roman paras → bullet list`);
      continue;
    }
    // numbered structure: a run of "N." paras, or one block with
    // "N. …\nN. …" inside it → list items (ol when 1..n sequential,
    // bullets keeping the literal number when the source jumped)
    if (isNum(b)) {
      const run = [];
      while (i < body.length && isNum(body[i])) { run.push(body[i]); i++; }
      i--;
      const nums = run.map((rb) => +text(rb).match(numStart)[1]);
      const seq = nums.every((n, j) => n === j + 1);
      for (const rb of run) {
        const sp = splitNumbered(rb);
        if (sp) { out.push(...sp); continue; }
        let children = rb.children ?? [];
        if (seq) {
          children = children.map((c, ci) =>
            ci === 0 ? { ...c, text: c.text.replace(/^\s*\d+\.\s+/, "") } : c);
        }
        out.push(item(children, rb.markDefs ?? [], seq ? "number" : "bullet"));
      }
      notes.push(`${run.length} numbered paras → ${seq ? "ol" : "bullets"}`);
      continue;
    }
    out.push(b);
  }
  return out;
}

const mutations = [];
const report = [];
for (const p of posts) {
  const notes = [];
  const newBody = transformBody(p.body ?? [], notes);
  if (JSON.stringify(newBody) === JSON.stringify(p.body ?? [])) continue;
  mutations.push({ patch: { id: p._id, set: { body: newBody } } });
  report.push({ id: p._id, s: p.s, notes });
}

writeFileSync("content-review/fix/structure-report.json", JSON.stringify(report, null, 2));
console.log(`${report.length} posts changed; ${mutations.length} mutations`);
for (const r of report) console.log(`\n${r.s}`), r.notes.forEach((n) => console.log(`  ${n}`));

if (APPLY && mutations.length) {
  for (let i = 0; i < mutations.length; i += 40) {
    const r = await fetch(`${API}/data/mutate/${DATASET}`, {
      method: "POST", headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ mutations: mutations.slice(i, i + 40) }),
    });
    if (!r.ok) { console.error(`batch ${i}: ${r.status} ${(await r.text()).slice(0, 300)}`); continue; }
    console.log(`committed ${Math.min(i + 40, mutations.length)}/${mutations.length}`);
  }
}
