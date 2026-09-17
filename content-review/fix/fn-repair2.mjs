// Round 4b — image-bodied notes + markdown-image residue.
// - "Empty" notes whose bodies were images: bind the image to the footnote def
//   (def.image), remove the now-stranded tail image blocks.
// - Mangded `![alt](url)` markdown still inline (angelicism 247): upload the
//   external image to Sanity, emit a real image block, drop the dup caption.
// - `!`/`")"` residue blocks around converted images; bare youtube-embed URLs.
// Usage: node fn-repair2.mjs [--apply]
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

async function upload(url) {
  const res = await fetch(url, { redirect: "follow", headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`GET ${url.slice(0, 90)} → ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const mime = res.headers.get("content-type")?.split(";")[0] ?? "image/jpeg";
  const up = await fetch(`${API}/assets/images/${DATASET}?filename=${encodeURIComponent("papyrus-" + Math.random().toString(36).slice(2, 8) + ".jpg")}`, {
    method: "POST", headers: { ...auth, "Content-Type": mime }, body: buf,
  });
  const j = await up.json();
  if (!up.ok) throw new Error(`upload → ${up.status}`);
  return j.document._id;
}

// find the footnote def with n===n in a doc body
function defN(body, n) {
  for (const b of body) for (const d of b.markDefs ?? [])
    if (d._type === "footnote" && d.n === n) return d;
  return null;
}

const load = (id) => JSON.parse(readFileSync(join(DIR, `${id}.json`), "utf8"));
const mutations = [], report = [];

// upload the papyrus image first (needed for angelicism block)
const PAPYRUS = "https://storage.googleapis.com/papyrus_images/c3f004cb1ea2391d1d4d2d87b6f564f5101f6ae761bd666c84bb0319bdcb55b3.jpg";
let papyrusRef = null;
if (APPLY) papyrusRef = await upload(PAPYRUS);
else papyrusRef = "<pending-upload>";

// --- cancelled-will: notes 1,6,10 are image-bodied ---
{
  const p = load("drafts.post-press-the-cancelled-will-inherit-the-earth");
  const body = p.body.map((b) => ({ ...b, markDefs: (b.markDefs ?? []).map((d) => ({ ...d })) }));
  const [i1, i6, i10] = [body[22], body[23], body[24]]; // tail images
  for (const [n, img] of [[1, i1], [6, i6], [10, i10]]) {
    const d = defN(body, n);
    if (d && img?._type === "image") { d.image = { asset: { _ref: img.asset._ref }, alt: img.alt, caption: img.caption }; }
  }
  body.splice(22, 3); // drop stranded note-body images
  mutations.push({ patch: { id: p.id, set: { body } } });
  report.push("- cancelled-will: notes 1,6,10 → image-bodied defs; 3 stranded images bound + removed");
}

// --- viral-public-license: note 3 = closing illustration ---
{
  const p = load("drafts.post-press-viral-public-license");
  const body = p.body.map((b) => ({ ...b, markDefs: (b.markDefs ?? []).map((d) => ({ ...d })) }));
  const img = body[8];
  const d = defN(body, 3);
  if (d && img?._type === "image") { d.image = { asset: { _ref: img.asset._ref }, alt: img.alt }; body.splice(8, 1); }
  mutations.push({ patch: { id: p.id, set: { body } } });
  report.push("- viral-public-license: note 3 → image-bodied def; stranded illustration bound + removed");
}

// --- network-angels: note 1 = image; also drop "Guest post by" byline remnant ---
{
  const p = load("drafts.post-press-notes-on-network-angels-and-god-guest-post-proanatwink");
  const body = p.body.map((b) => ({ ...b, markDefs: (b.markDefs ?? []).map((d) => ({ ...d })) }));
  const img = body[28];
  const d = defN(body, 1);
  if (d && img?._type === "image") { d.image = { asset: { _ref: img.asset._ref }, alt: img.alt }; body.splice(28, 1); }
  const gi = body.findIndex((b) => b._type === "block" && /guest post by/i.test(spanText(b)));
  if (gi >= 0) body.splice(gi, 1);
  mutations.push({ patch: { id: p.id, set: { body } } });
  report.push("- network-angels: note 1 → image-bodied def; image + leftover byline removed");
}

// --- dynasty: note 7 = the last tail image → append def n:7 to trailing block ---
{
  const p = load("drafts.post-press-dynasty-mindset");
  const body = p.body.map((b) => ({ ...b, markDefs: (b.markDefs ?? []).map((d) => ({ ...d })) }));
  const img = body[67]; // last "Illustration for Dynasty Mindset" — note 7's body
  const trail = body[69]; // trailing sidenote block (Footnotes heading is 68)
  if (img?._type === "image" && trail?._type === "block") {
    const def = { _key: key(), _type: "footnote", n: 7, text: "", image: { asset: { _ref: img.asset._ref }, alt: img.alt } };
    trail.markDefs.push(def);
    trail.children.push({ _key: key(), _type: "span", text: " " }, { _key: key(), _type: "span", text: "", marks: [def._key] });
    body.splice(67, 1);
  }
  mutations.push({ patch: { id: p.id, set: { body } } });
  report.push("- dynasty-mindset: note 7 → image-bodied trailing sidenote; stranded illustration bound");
}

// --- angelicism: unconverted ![alt](papyrus) at 247 + dup caption 248 ---
{
  const p = load("drafts.post-press-angelicism01-collected-commentaries-on-milady");
  const body = p.body.slice();
  const b247 = body[247];
  if (spanText(b247).startsWith("![")) {
    const m = spanText(b247).match(/^!\[([\s\S]*)\]\(([^)]+)\)$/);
    const alt = (m?.[1] ?? "").trim();
    body[247] = { _key: b247._key, _type: "image", asset: { _ref: papyrusRef }, alt, caption: alt };
    if (spanText(body[248] ?? {}).trim() === alt) body.splice(248, 1); // dup caption paragraph
  }
  mutations.push({ patch: { id: p.id, set: { body } } });
  report.push("- angelicism01: ![…](papyrus_images/…) uploaded to Sanity → image block w/ caption; dup caption paragraph dropped");
}

// --- jadeposting: "!" / ")" residue around images 30,33 + fix their alts ---
{
  const p = load("drafts.post-press-jadeposting");
  const body = p.body.map((b) => ({ ...b }));
  for (const i of [30, 33]) {
    const img = body[i];
    if (img?._type === "image" && img.alt) img.alt = img.alt.replace(/\\"/g, '"').replace(/\s*$/, "") + (/\)$/.test(img.alt) ? "" : ")");
  }
  for (const i of [34, 32, 31, 29]) {
    const t = spanText(body[i] ?? {}).trim();
    if (/^[!"\)\(]+$/.test(t)) body.splice(i, 1);
  }
  // bare youtube embed URL @41 → make it a link
  const yb = body.findIndex((b) => b._type === "block" && /youtube-nocookie\.com\/embed/.test(spanText(b)));
  if (yb >= 0) {
    const b = body[yb];
    const href = spanText(b).trim();
    const k = key();
    body[yb] = { ...b, markDefs: [{ _key: k, _type: "link", href }], children: [{ _key: key(), _type: "span", text: href, marks: [k] }] };
  }
  mutations.push({ patch: { id: p.id, set: { body } } });
  report.push("- jadeposting: !/) residue dropped, image alts repaired, bare youtube embed → link");
}

// --- redacted-remilio + what-remilia-believes: stray "!" blocks ---
for (const id of ["drafts.post-press-redacted-remilio-babies-notes-on-the-design-process", "drafts.post-press-what-remilia-believes-in-a-new-net-art-manifesto"]) {
  const p = load(id);
  const body = p.body.filter((b) => !(b._type === "block" && /^!$/.test(spanText(b).trim())));
  mutations.push({ patch: { id, set: { body } } });
  report.push(`- ${id.replace("drafts.post-press-", "")}: stray "!" image-markdown residue dropped`);
}

// --- neogyaru: bare youtube embed URL → link ---
{
  const p = load("drafts.post-press-neogyaru");
  const body = p.body.map((b) => ({ ...b }));
  const yb = body.findIndex((b) => b._type === "block" && /youtube-nocookie\.com\/embed/.test(spanText(b)));
  if (yb >= 0) {
    const b = body[yb];
    const href = spanText(b).trim();
    const k = key();
    body[yb] = { ...b, markDefs: [{ _key: k, _type: "link", href }], children: [{ _key: key(), _type: "span", text: href, marks: [k] }] };
  }
  mutations.push({ patch: { id: p.id, set: { body } } });
  report.push("- neogyaru: bare youtube embed URL → link");
}

console.log(report.join("\n"));
writeFileSync(new URL("./fn-repair2-report.md", import.meta.url), `# Image-note repair\n\n${report.join("\n")}\n`);
if (APPLY && mutations.length) {
  const res = await fetch(`${API}/data/mutate/${DATASET}`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ mutations }),
  });
  console.log(res.ok ? `\ncommitted ${mutations.length}` : `${res.status} ${(await res.text()).slice(0, 300)}`);
}
