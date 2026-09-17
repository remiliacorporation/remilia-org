// Restore lost footnote bodies from paragraph.com originals + convert remaining markers.
// - reality-after-the-wired: 5 markers → notes 1-5 recovered (note 6 nested in note 2,
//   appended inside note 2's text since markDefs can't nest).
// - angelicism01: real markers are \[1\]@86, \[1\]@230, \[2\]@231 → notes 1,2 from
//   paragraph; block 233's \[1]..\[42] are Twitter link references (kept, unescaped);
//   note 3 has no marker on the source either → kept as orphan text under "Footnotes".
// Usage: node fn-restore.mjs [--apply]
import { readFileSync, writeFileSync } from "fs";
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

// replace all `\[N\]` markers in a block's text with footnote-marked spans.
// Returns new block or null. notes: Map<number,string>
function convertMarkers(block, notes) {
  const full = spanText(block);
  const hits = [...full.matchAll(/\\\[(\d+)\\\]/g)];
  if (!hits.length) return null;
  const defs = [...(block.markDefs ?? [])];
  const kids = [];
  let pos = 0;
  const spanAt = (i) => {
    // walk children to find the span covering char offset i
    let p2 = 0;
    for (const s of block.children ?? []) {
      const t = s.text ?? "";
      if (i >= p2 && i < p2 + t.length) return { s, p2 };
      p2 += t.length;
    }
    return null;
  };
  // rebuild children: for each marker hit, split the owning span
  let cursor = 0;
  const out = [];
  const src = block.children ?? [];
  // flatten to (text, marks) pieces then reassemble — preserves marks on text pieces
  const pieces = [];
  for (const s of src) for (let ci = 0; ci < (s.text ?? "").length; ci++) pieces.push({ c: s.text[ci], marks: s.marks ?? [] });
  const marksFor = (i) => pieces[i]?.marks ?? [];
  for (const h of hits) {
    const n = parseInt(h[1], 10);
    const start = h.index, end = h.index + h[0].length;
    if (start > cursor) {
      // emit text cursor..start, grouped by marks
      let g = cursor;
      while (g < start) {
        let e = g + 1;
        while (e < start && JSON.stringify(marksFor(e)) === JSON.stringify(marksFor(g))) e++;
        out.push({ _key: key(), _type: "span", text: pieces.slice(g, e).map((x) => x.c).join(""), marks: marksFor(g) });
        g = e;
      }
    }
    const text = notes.get(n);
    const def = { _key: key(), _type: "footnote", text: text ?? `[note ${n} missing]` };
    defs.push(def);
    out.push({ _key: key(), _type: "span", text: "", marks: [def._key] });
    cursor = end;
  }
  if (cursor < pieces.length) {
    let g = cursor;
    while (g < pieces.length) {
      let e = g + 1;
      while (e < pieces.length && JSON.stringify(marksFor(e)) === JSON.stringify(marksFor(g))) e++;
      out.push({ _key: key(), _type: "span", text: pieces.slice(g, e).map((x) => x.c).join(""), marks: marksFor(g) });
      g = e;
    }
  }
  return { ...block, children: out, markDefs: defs };
}

const WIRED_NOTES = new Map([
  [1, "The phenomenon described (prophecized/hyperstitionalized) in Serial Experiments: Lain whereby digital reality takes prominence over ‘IRL reality’ leading to virtual events manifesting real ones; see [5]"],
  [2, "Media records—writing, photographs, video—have long held status as reliable for historical verification however we are quickly entering an age where records can be easily faked, casting doubt on our grounding of history. Orwell famously explored this in “1984” from the perspective of State manipulation, but we see it occuring as a decentralized symptom of advancing technology [6]\n\n[6] Technology has a teleology; its advancements follow natural law, each new result an inevitability, rapidly distributed & decentralized. Only counter-thesis to counter this undeterring march relies on the destruction of human consciousness itself, we can talk about that later."],
  [3, "Early publicly released GAN platforms have demonstrated ability for ML/AI to reliably and efficiently generate highly plausibly media. Deepfakes pass the “media turing test” of plausibility."],
  [4, "The consilience approach relies on a concordance of evidence to find reliable truth necessary when individual data points cannot be verified in isolation, but their validity can be made more certain by the number of confirming points. Conspiracy research, hinged on the principle that evidence is being covered up, follows this mode—“proving” a fire by identifying many points of smoke until it appears more likely to be true than not true. Note that degrees of “likely” is best truth we can receive in this mode, never certainty."],
  [5, "Belief is reality, “reality” as perceived by the individual is a personal perception of consensus perception; what is believed by the individual is expressed through them as personal reality, influence on consensus—collective belief in something makes it effectively real."],
]);

const ANGEL_NOTES = new Map([
  [1, "A really expensive hyperlink with an absurd carbon footprint, etc."],
  [2, "I call this nonpedantic rendition of overness ubilapse."],
]);
const ANGEL_ORPHAN3 = "[3] A more detailed description is found here: ‘Milady Maker is a collection of 10,000 generative pfpNFT’s in a neochibi aesthetic with randomized cosmetics inspired by 00’s Tokyo street fashion. Under the vision of digital artist Milady Sonora, Milady’s are designed to be fashion-minded and genuinely good social media avatars, and an invitation into their personal aesthetic world.’";

const mutations = [], report = [];

// --- reality-after-the-wired
{
  const p = JSON.parse(readFileSync(join(DIR, "drafts.post-press-reality-after-the-wired.json"), "utf8"));
  const body = (p.body ?? []).map((b) => ({ ...b }));
  const b1 = body[1];
  const nb = convertMarkers(b1, WIRED_NOTES);
  if (nb) { body[1] = nb; report.push("- reality-after-the-wired: 5 markers → footnotes 1–5 (note 6 nested inside note 2 text)"); }
  mutations.push({ patch: { id: p.id, set: { body } } });
}

// --- angelicism01
{
  const p = JSON.parse(readFileSync(join(DIR, "drafts.post-press-angelicism01-collected-commentaries-on-milady.json"), "utf8"));
  const body = (p.body ?? []).map((b) => ({ ...b, children: b.children?.map((s) => ({ ...s })) }));
  // real footnote markers at blocks 86 (\[1\]), 230 (\[1\]), 231 (\[2\])
  for (const i of [86, 230, 231]) {
    const nb = convertMarkers(body[i], ANGEL_NOTES);
    if (nb) body[i] = nb;
  }
  // block 233: unescape the \[N] link-list text and fold ] into the linked spans
  const b233 = body[233];
  if (b233?._type === "block") {
    const kids = [];
    for (const s of b233.children ?? []) {
      const t = s.text ?? "";
      if (t.startsWith("\\]") && kids.length) {
        // connector span "\], \" / "\]. " — fold ] into previous linked span, strip escapes
        kids[kids.length - 1].text += "]";
        const rest = t.slice(2).replace(/\\/g, "");
        if (rest) kids.push({ _key: key(), _type: "span", text: rest });
      } else {
        s.text = t.replace(/\\/g, "");
        kids.push(s);
      }
    }
    body[233] = { ...b233, children: kids };
  }
  // keep "Footnotes" heading; append orphan note 3 as plain text beneath it
  const last = body[body.length - 1];
  if (last?._type === "block" && /^footnotes/i.test(spanText(last).trim())) {
    body.push({ _key: key(), _type: "block", style: "normal", markDefs: [], children: [{ _key: key(), _type: "span", text: ANGEL_ORPHAN3 }] });
  }
  report.push("- angelicism01: markers 1,1,2 → footnotes; link-list [1]–[42] unescaped (links preserved); orphan note 3 kept as text under Footnotes");
  mutations.push({ patch: { id: p.id, set: { body } } });
}

console.log(`${mutations.length} posts patched`);
writeFileSync(new URL("./fn-restore-report.md", import.meta.url), `# Footnote restore (from paragraph.com originals)\n\n${report.join("\n")}\n`);
if (APPLY && mutations.length) {
  const res = await fetch(`${API}/data/mutate/${DATASET}`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ mutations }),
  });
  console.log(res.ok ? `committed ${mutations.length}/${mutations.length}` : `${res.status} ${(await res.text()).slice(0, 300)}`);
}
