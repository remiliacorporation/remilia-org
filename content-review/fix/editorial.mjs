// Editorial fix pass: guest authors, title normalization, excerpts, slugs, channels, alts.
// Usage: node editorial.mjs [--apply] [id-filter]
import { readFileSync, writeFileSync, readdirSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const DIR = new URL("../posts/", import.meta.url).pathname;
const APPLY = process.argv.includes("--apply");
const only = process.argv.slice(2).find((a) => !a.startsWith("--"));
const token = JSON.parse(readFileSync(join(homedir(), ".config/sanity/config.json"), "utf8")).authToken;
const API = "https://8x9419lh.api.sanity.io/v2024-01-01";
const DATASET = "production";
const auth = { Authorization: `Bearer ${token}` };
const uid = () => Math.random().toString(36).slice(2, 10);
const KEY = () => `ed${uid()}`;

const posts = readdirSync(DIR).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(join(DIR, f), "utf8")));
const slugOf = (p) => (typeof p.slug === "string" ? p.slug : p.slug?.current) ?? "";
const slugs = new Set(posts.map(slugOf).filter(Boolean));

// ---------- title helpers ----------
const KEEP = new Set(["Remilia","RemiliaNET","Milady","MiladyMaker","MiladyCraft","FRUiTS","REMiLiA","NYFW","NFT","NFTs","P2P","GQ","Dazed","VISLA","Visla","4chan","2chan","Miya","MiyaNET","Bonkler","Sonora","Elena","Velez","Ethereum","Vitalik","Buterin","ERC-721","ERC-20","DeFi","Substack","Discord","Twitter","YouTube","Instagram","Obsidian","CEO","SaaS","API","FUMO","FUMO404","LA","NYC","SS2026","FW2026","WW3","AI","VR","AR","USA","UK","EU","JPEG","PNG","GIF","HTML","CSS","LLC","TV","PC","WCW","Y2K","OS","NEET","MMM","XXX","II","III","IV","VI","VII","VIII","IX","XI","XII","XIII","XIV","XV","XVI","XVII","XVIII","XIX","XX"]);
const SMALL = new Set(["a","an","and","as","at","but","by","for","in","nor","of","on","or","per","so","the","to","vs","via"]);
function titleCase(t) {
  return t.split(/(\s+)/).map((w, i) => {
    const core = w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
    if (!core) return w;
    if (KEEP.has(core)) return w;
    if (core === core.toUpperCase() && core.length <= 6 && /[A-Z]/.test(core)) return w;
    if (/^\d/.test(core)) return w;
    if (i > 0 && SMALL.has(core.toLowerCase()) && !/^[("'[]/.test(w)) return w.replace(core, core.toLowerCase());
    return w.replace(core, core[0].toUpperCase() + core.slice(1));
  }).join("").replace(/(^\s*[^\p{L}\p{N}]*)(.)/u, (m, p, c) => p + c.toUpperCase());
}
const TYPE_PREFIX = /^(Press Release|Pre-Release Announcement|Feature|Interview|Cultural Coverage|Event Coverage|Thought Leadership|News|Guide|Performance|Coverage|Review|Announcement|Opinion|Essay|Guest Post)\s*[:–—-]\s*/i;
const isAllCaps = (t) => t.length > 8 && t === t.toUpperCase() && /[A-Z]{3}/.test(t) && t !== t.toLowerCase();

// ---------- body helpers ----------
const paraText = (b) => (b._type === "block" ? (b.children ?? []).map((s) => s.text ?? "").join("") : "");
function cleanBody(blocks, opts) {
  const out = [];
  for (const b of blocks ?? []) {
    if (b._type === "block") {
      const text = paraText(b);
      if (/^\s*(\\?\s*)?guest post by\b/i.test(text)) { opts.removed.push(`byline: ${text.trim().slice(0, 50)}`); continue; }
    }
    out.push(b);
  }
  return out;
}
function firstParagraph(blocks) {
  for (const b of blocks ?? []) {
    if (b.style === "listItem" || /^h[1-6]$/.test(b.style ?? "")) continue;
    const t = paraText(b).replace(/[\[\]()\\*_`#]/g, "").trim();
    if (/\n/.test(t) || /^table of contents/i.test(t)) continue;
    if (t.length > 60 && !/^https?:\/\//.test(t) && !/guest post/i.test(t)) return t;
  }
  return null;
}
const excerpt = (blocks) => { const t = firstParagraph(blocks); return t ? (t.length > 160 ? t.slice(0, 157).replace(/\s+\S*$/, "") + "…" : t) : null; };

// ---------- guest author extraction ----------
function guestHandle(p) {
  const t = p.title ?? "";
  let m = t.match(/\[guest post:\s*@?([\w]+)_?\]/i) || t.match(/@([\w]+)_?\s*:\s*$/);
  if (m) return m[1];
  for (const b of p.body ?? []) {
    if (b._type !== "block") continue;
    const text = paraText(b);
    if (/guest post by/i.test(text)) {
      for (const d of b.markDefs ?? []) {
        const h = d.href?.match(/(?:twitter\.com|x\.com)\/(@?[\w]+)/i);
        if (h) return h[1].replace(/^@/, "").replace(/_$/, "");
      }
      const h = text.match(/@([\w]+)/);
      if (h) return h[1].replace(/_$/, "");
    }
  }
  return t.includes("[gp]") ? "UNKNOWN" : null;
}

const mutations = [], notes = [], authorDocs = new Map();
const flagged = new Set((() => { try { return JSON.parse(readFileSync(new URL("../findings.json", import.meta.url), "utf8")).filter((i) => i.kind === "title" || i.kind === "excerpt" || i.kind === "slug" || i.kind === "image-alt").map((i) => i.id + "|" + i.kind); } catch { return []; } })());

for (const p of posts) {
  if (only && !p.id.includes(only)) continue;
  const set = {}, unset = [], notes2 = [];

  // guest posts → author docs
  const handle = guestHandle(p);
  const isGuest = handle || /\[(gp|guest post)/i.test(p.title ?? "");
  if (isGuest && handle && handle !== "UNKNOWN") {
    const aid = `author-${handle.toLowerCase().replace(/[^\w]+/g, "-")}`;
    if (!authorDocs.has(aid)) {
      authorDocs.set(aid, { createOrReplace: { _id: aid, _type: "author", name: handle, slug: { _type: "slug", current: handle.toLowerCase() }, url: `https://twitter.com/${handle}` } });
    }
    const have = (p.authors ?? []).map((a) => a?.name ?? a?._ref);
    const existing = (p.authors ?? []).filter(Boolean).map((a) => (a?._type === "reference" ? a : { _type: "reference", _ref: a?._id ?? a?._ref, _key: KEY() })).filter((a) => a._ref);
    if (!have.includes(handle) && !have.includes(aid)) { set.authors = [...existing, { _type: "reference", _ref: aid, _key: KEY() }]; notes2.push(`author → @${handle}`); }
  } else if (isGuest && !handle) notes2.push("FLAG: guest post but no handle found");

  // title normalization
  let title = p.title ?? "";
  const orig = title;
  title = title.replace(/\s*\[(gp|guest post:?[^\]]*)\]\s*/gi, " ").replace(/\s{2,}/g, " ").trim();
  title = title.replace(TYPE_PREFIX, "").trim();
  if (isAllCaps(title)) title = titleCase(title.toLowerCase());
  else if (title !== orig) title = titleCase(title);
  if (title !== orig && title.length > 3) { set.title = title; notes2.push(`title → "${title.slice(0, 70)}"`); }
  else if (title !== orig) notes2.push("FLAG: title emptied by strip");

  // channel folds
  if (p.channel === "news") { set.channel = "press"; notes2.push("channel news → press"); }
  if (p.channel === "dev-updates") { set.channel = "dev-blog"; notes2.push("channel dev-updates → dev-blog"); }

  // excerpts
  if (flagged.has(p.id + "|excerpt")) {
    const ex = excerpt(p.body);
    if (ex && ex !== p.excerpt) { set.excerpt = ex; notes2.push(`excerpt → "${ex.slice(0, 60)}…"`); }
  }

  // slugs: only where suffix is import-collision, not part of title
  const slug = slugOf(p);
  const t = (set.title ?? title).toLowerCase();
  if (slug.endsWith("-2") && !t.includes("2") && !t.includes("two")) {
    const base = slug.replace(/-2$/, "");
    if (!slugs.has(base)) { set.slug = { _type: "slug", current: base }; set.previousPaths = [...(p.previousPaths ?? []).map((x) => x.current), `/${base}-2`].map((c) => ({ _type: "slug", current: c, _key: KEY() })); notes2.push(`slug ${slug} → ${base}`); }
    else notes2.push(`FLAG: slug ${slug} base taken`);
  }
  // events slug date mismatch (title+date both say different year)
  const ev = slug.match(/^(\d{2})-(\d{4})-(.*)$/);
  const td = title.match(/^(\d{2})\/(\d{4})/);
  if (ev && td && p.channel === "events" && (ev[1] !== td[1] || ev[2] !== td[2])) {
    const fixed = `${td[1]}-${td[2]}-${ev[3]}`.replace(/-2$/, "");
    if (!slugs.has(fixed)) { set.slug = { _type: "slug", current: fixed }; set.previousPaths = [...(set.previousPaths ?? p.previousPaths ?? []).map((x) => x.current ?? x), `/${slug}`].map((c) => ({ _type: "slug", current: c, _key: KEY() })); notes2.push(`slug date ${slug} → ${fixed}`); }
  }

  // image alts on converted images
  if (flagged.has(p.id + "|image-alt")) {
    let touched = false;
    const body = (p.body ?? []).map((b) => {
      if (b._type === "image" && !b.alt) { touched = true; return { ...b, alt: `${(set.title ?? title).trim()} — screenshot` }; }
      return b;
    });
    if (touched) { set.body = body; notes2.push("image alts filled"); }
  }

  // remove guest byline lines from any guest post
  if (isGuest) {
    const removed = [];
    const body = cleanBody(p.body, { removed });
    if (removed.length) { set.body = body; notes2.push(`dropped ${removed.join("; ")}`); }
  }

  // strip dangling/null author entries
  if (!set.authors && (p.authors ?? []).some((a) => a == null)) {
    const refs = (p.authors ?? []).filter(Boolean).map((a) => ({ _type: "reference", _ref: a._id ?? a._ref, _key: KEY() })).filter((a) => a._ref);
    if (refs.length !== (p.authors ?? []).length) { set.authors = refs; notes2.push("dropped dangling author ref"); }
  }

  if (Object.keys(set).length || unset.length) {
    mutations.push({ patch: { id: p.id, set, ...(unset.length ? { unset } : {}) } });
    notes.push(`- \`${p.id}\`\n  ${notes2.join("\n  ")}`);
  }
}

mutations.unshift(...authorDocs.values());
console.log(`${mutations.length} mutations (${authorDocs.size} authors)`);
writeFileSync(new URL("./editorial-report.md", import.meta.url), `# Editorial mutations\n\n${notes.join("\n")}\n`);
if (APPLY && mutations.length) {
  for (let i = 0; i < mutations.length; i += 40) {
    const res = await fetch(`${API}/data/mutate/${DATASET}`, { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ mutations: mutations.slice(i, i + 40) }) });
    if (!res.ok) { console.error(`batch ${i}: ${res.status} ${(await res.text()).slice(0, 300)}`); continue; }
    console.log(`committed ${Math.min(i + 40, mutations.length)}/${mutations.length}`);
  }
}
