// apply.mjs — mechanical corrections for imported posts.
// Usage: node content-review/fix/apply.mjs [--apply] [--only <substr>]
// Reads content-review/posts/*.json, produces mutations; --apply commits them
// via the Sanity mutate API. Assets are downloaded + uploaded first.
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

const APPLY = process.argv.includes("--apply");
const onlyIdx = process.argv.indexOf("--only");
const ONLY = onlyIdx > -1 ? process.argv[onlyIdx + 1] : null;
const DIR = "content-review/posts";
const PROJECT = "8x9419lh", DATASET = "production";
const cfg = JSON.parse(readFileSync(`${process.env.HOME}/.config/sanity/config.json`, "utf8"));
const API = `https://${PROJECT}.api.sanity.io/v2024-01-01`;
const auth = { Authorization: `Bearer ${cfg.authToken}` };
const key = () => randomBytes(4).toString("hex");

const posts = readdirSync(DIR).filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(join(DIR, f), "utf8")))
  .filter((p) => !ONLY || p.id.includes(ONLY));

const TRACKING = /^(ref|s|t|utm_\w+|fbclid|gclid|mc_cid|mc_eid)$/i;
const legacyIdx = new Map();
for (const p of posts) {
  const l = p.migration?.legacyUrl;
  if (l) { const seg = l.replace(/\/+$/, "").split("/").pop(); if (seg) legacyIdx.set(seg, p); }
}

// ---------- url cleanup ----------
const cleanHref = (h) => {
  if (h == null) return h;
  let out = h.trim();
  if (out.startsWith("http://https//")) out = "https://" + out.slice("http://https//".length);
  if (/^https?:\/\/\s+https?:\/\//i.test(out)) out = out.replace(/^https?:\/\/\s+/i, "");
  // href with markdown title junk:  url "title"
  if (/^https?:\S+\s+"/.test(out)) out = out.split(/\s+"/)[0];
  if (!/^(https?:|mailto:|tel:|\/|#)/i.test(out) && /^[\w-]+(\.[\w-]+)+/.test(out)) out = "https://" + out;
  out = out.replace(/&&/g, "&");
  try {
    const u = new URL(out.startsWith("/") ? `https://remilia.org${out}` : out);
    for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
    // internal Ghost links → canonical /blog path when resolvable
    if (u.hostname === "blog.remilia.org") {
      const seg = u.pathname.replace(/\/+$/, "").split("/").pop();
      const target = seg ? legacyIdx.get(seg) : null;
      out = target ? `/blog/${target.channel}/${target.slug}` : "/blog";
    } else if (u.hostname.endsWith("remilia.org") && /^\/(updates|press|thought|archive|events|news)\//.test(u.pathname)) {
      out = `/blog${u.pathname.replace(/\/+$/, "")}`;
    } else {
      out = u.hostname === "remilia.org" ? u.pathname + u.search : u.toString();
    }
  } catch { /* keep cleaned string */ }
  return out;
};

// ---------- assets ----------
const assetMapPath = "content-review/fix/assets-map.json";
const assetMap = existsSync(assetMapPath) ? JSON.parse(readFileSync(assetMapPath, "utf8")) : {};
const dropsPath = "content-review/fix/drops.json";
const DROP_URLS = new Set(existsSync(dropsPath) ? JSON.parse(readFileSync(dropsPath, "utf8")) : []);
const pendingAssets = new Map(); // url -> "image"|"file"
const wantAsset = (url, kind) => {
  if (/cdn\.sanity\.io/.test(url)) return;
  if (!assetMap[url]) pendingAssets.set(url, kind);
};

const collectUrls = (p) => {
  for (const b of p.body ?? []) {
    if (b._type !== "block") continue;
    for (const s of b.children ?? []) {
      for (const m of s.text.matchAll(/!\[[^\]]*\]\((https?:[^)\s]+)\)/g)) {
        if (/youtube\.com|youtu\.be|vimeo\.com|twitter\.com|x\.com/i.test(m[1])) continue;
        if (/\.(mp4|webm|mov)(\?|$)/i.test(m[1])) wantAsset(m[1], "file");
        else wantAsset(m[1], "image");
      }
      // markless runs may hide ![]() split by underscore-emphasis
      {
        let run = "";
        const scan = () => { for (const m of run.matchAll(/!\[[^\]]*\]\((https?:[^)\s]+)\)/g)) { if (!/youtube\.com|youtu\.be|vimeo\.com|twitter\.com|x\.com/i.test(m[1])) wantAsset(m[1], /\.(mp4|webm|mov)(\?|$)/i.test(m[1]) ? "file" : "image"); } run = ""; };
        for (const s2 of b.children ?? []) { if (!(s2.marks ?? []).length) run += s2.text ?? ""; else scan(); }
        scan();
      }
      const joined = (b.children ?? []).map((s2) => s2.text ?? "").join("");
      if (/^\s*https?:\/\/\S+\s*$/.test(joined) && /storage\.ghost\.io.*\.(mp4|webm|mov)/i.test(joined)) wantAsset(joined.trim(), "file");
    }
    for (const d of b.markDefs ?? []) {
      if (d._type === "link" && d.href && /images\.mirror-media\.xyz/.test(d.href)) wantAsset(d.href.split(/\s+"/)[0], "image");
    }
  }
  for (const m of (p.archiveSnapshot ?? "").matchAll(/!\[[^\]]*\]\((https?:[^)\s]+)\)/g)) wantAsset(m[1], "image");
};
posts.forEach(collectUrls);

const upload = async (url, kind) => {
  const r = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`GET ${url} → ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 100) throw new Error("suspiciously small");
  const u = new URL(url);
  const name = decodeURIComponent(u.pathname.split("/").pop() || "asset").replace(/[^\w.-]/g, "_");
  const res = await fetch(`${API}/assets/${kind}s/${DATASET}?filename=${encodeURIComponent(name)}`, {
    method: "POST", headers: { ...auth, "Content-Type": r.headers.get("content-type") ?? "application/octet-stream" }, body: buf,
  });
  if (!res.ok) throw new Error(`upload ${name} → ${res.status} ${await res.text()}`);
  const doc = (await res.json()).document;
  return { ref: doc._id, url: doc.url, kind };
};

console.log(`${posts.length} posts; ${pendingAssets.size} assets to mirror`);
if (APPLY && pendingAssets.size) {
  for (const [url, kind] of pendingAssets) {
    try { assetMap[url] = await upload(url, kind); process.stdout.write("+"); }
    catch (e) { assetMap[url] = { error: String(e) }; process.stdout.write(`\n! ${url} — ${e.message}\n`); }
    writeFileSync(assetMapPath, JSON.stringify(assetMap, null, 2));
  }
  console.log();
}

// ---------- transforms ----------
const imgBlock = (ref, alt = "", caption) => ({
  _key: key(), _type: "image", asset: { _type: "reference", _ref: ref },
  ...(alt ? { alt } : {}), ...(caption ? { caption } : {}),
});
const videoBlock = (ref, caption) => ({
  _key: key(), _type: "video", file: { _type: "file", asset: { _type: "reference", _ref: ref } },
  ...(caption ? { caption } : {}),
});
const span = (text, marks = []) => ({ _key: key(), _type: "span", text, marks });
const linkDef = (href) => ({ _key: key(), _type: "link", href });
const para = (children, markDefs = [], style = "normal") => ({ _key: key(), _type: "block", style, markDefs, children });

const assetRef = (url) => assetMap[url] && !assetMap[url].error ? assetMap[url].ref : null;

// split a text node on markdown syntax → {spans, markDefs, images:[{url,alt}]} linear pieces
const mdRe = /(!?)\[([^\]]*)\]\((https?:[^)\s]+)\s*([^)]*)\)/g;
function mdSpans(text, defsOut) {
  const pieces = []; // {type:"text"|"link"|"image", ...}
  let last = 0, m;
  mdRe.lastIndex = 0;
  while ((m = mdRe.exec(text))) {
    if (m.index > last) pieces.push({ type: "text", text: text.slice(last, m.index) });
    const url = m[3], label = m[2], title = (m[4] ?? "").replace(/^["']|["']$/g, "");
    if (m[1] === "!") {
      const type = /\.(mp4|webm|mov)(\?|$)/i.test(url) ? "video" : /youtube\.com|youtu\.be|vimeo\.com|twitter\.com|x\.com/i.test(url) ? "link" : "image";
      pieces.push({ type, url, alt: label, text: label || url, caption: title || undefined });
    }
    else pieces.push({ type: "link", text: label || url, url });
    last = m.index + m[0].length;
  }
  if (last < text.length) pieces.push({ type: "text", text: text.slice(last) });
  return pieces;
}

function transformBlock(b, notes) {
  if (b._type !== "block") return [b];
  const text = (b.children ?? []).map((s) => s.text ?? "").join("");
  // bare "Subscribe" junk
  if (/^\s*Subscribe\s*$/.test(text)) { notes.push("removed Subscribe block"); return []; }
  // bare URL paragraph
  if (/^\s*https?:\/\/\S+\s*$/.test(text)) {
    const url = text.trim();
    if (/storage\.ghost\.io.*\.(mp4|webm|mov)/i.test(url)) {
      const ref = assetRef(url);
      if (ref) { notes.push(`ghost video → video block`); return [videoBlock(ref)]; }
      notes.push(`FLAG: video asset not uploaded ${url.slice(0, 80)}`); return [b];
    }
    let href = cleanHref(url);
    const yt = url.match(/youtube(?:-nocookie)?\.com\/(?:embed\/|shorts\/)?([\w-]{6,})/);
    if (yt && !url.includes("watch?v=")) href = `https://www.youtube.com/watch?v=${yt[1]}`;
    const def = linkDef(href);
    notes.push(`bare URL → link`);
    return [para([span(url, [def._key])], [def])];
  }
  // guest-post byline line:  "\ Guest post by @x (url) . \" or "Guest post by _@x_."
  const gp = text.match(/guest post by\s+_?(@[\w-]+)_?/i);
  if (/guest post by/i.test(text) && gp) {
    const def = linkDef(`https://x.com/${gp[1].slice(1)}`);
    notes.push(`guest-post byline normalized → @${gp[1]}`);
    return [para([span(`Guest post by `), span(gp[1], [def._key]), span(`.`)], [def])];
  }

  // markDefs cleanup + media-href → image block
  const defs = (b.markDefs ?? []).map((d) => ({ ...d }));
  const mediaDefs = [];
  const keptDefs = [];
  for (const d of defs) {
    if (d._type !== "link") { keptDefs.push(d); continue; }
    if (d.href && /images\.mirror-media\.xyz/.test(d.href)) {
      const clean = d.href.split(/\s+"/)[0];
      const title = (d.href.match(/\s+"(.+)/) ?? [])[1];
      mediaDefs.push({ key: d._key, url: clean, title });
      continue;
    }
    // Paragraph/Twitter embed-card chrome (editor icons, avatars) — drop, not mirror
    if (d.href && /paragraph\.com\/editor|papyrus_images/.test(d.href)) {
      notes.push("dropped embed-card chrome link");
      mediaDefs.push({ key: d._key, drop: true });
      continue;
    }
    if (d.href && d.href.includes("{{DOMAIN}}")) { notes.push("dropped {{DOMAIN}} link"); continue; }
    const c = d.href ? cleanHref(d.href) : d.href;
    if (c !== d.href) notes.push(`href cleaned: ${(d.href ?? "").slice(0, 60)} → ${(c ?? "").slice(0, 60)}`);
    keptDefs.push({ ...d, href: c });
  }

  // rebuild children: markdown text pieces, media-link spans → image blocks
  const out = [];
  let curSpans = [], curDefs = [...keptDefs];
  const flush = () => {
    if (curSpans.length) { out.push({ ...b, children: curSpans, markDefs: curDefs }); curSpans = []; curDefs = [...keptDefs]; }
  };
  // strip mark keys that resolve to nothing (defs dropped earlier / import orphans)
  const INLINE = new Set(["strong", "em", "code", "underline", "strike-through"]);
  let strippedMarks = false;
  let children = (b.children ?? []).map((s) => {
    const kept = (s.marks ?? []).filter((mk) => INLINE.has(mk) || keptDefs.some((d) => d._key === mk) || mediaDefs.some((md) => md.key === mk));
    if (kept.length !== (s.marks ?? []).length) strippedMarks = true;
    return { ...s, marks: kept };
  });
  if (strippedMarks) notes.push("dropped dangling mark ref");
  // markdown syntax split across markless spans (underscores parsed as emphasis on import) — merge contiguous markless runs
  {
    const merged = [];
    let run = [];
    const flushRun = () => {
      if (run.length > 1) merged.push({ _key: run[0]._key, _type: "span", text: run.map((s) => s.text ?? "").join(""), marks: [] });
      else if (run.length) merged.push(run[0]);
      run = [];
    };
    for (const s of children) {
      if (!(s.marks ?? []).length) run.push(s);
      else { flushRun(); merged.push(s); }
    }
    flushRun();
    children = merged;
  }
  for (const s of children) {
    const marks = s.marks ?? [];
    const mediaKey = mediaDefs.find((md) => marks.includes(md.key));
    const linkKeys = marks.filter((mk) => curDefs.some((d) => d._key === mk));
    const decoMarks = marks.filter((mk) => INLINE.has(mk));
    // span carrying a media-image link → becomes an image block
    if (mediaKey) {
      flush();
      if (!mediaKey.drop) {
        const ref = assetRef(mediaKey.url);
        if (ref) { notes.push(`media hotlink → image block`); out.push(imgBlock(ref, mediaKey.title ?? "", mediaKey.title)); }
        else notes.push(`FLAG: media asset not uploaded ${mediaKey.url.slice(0, 80)}`);
      } else notes.push("dropped embed-card fragment");
      // drop the span text itself (markdown fragments like "![User Avatar")
      continue;
    }
    // markdown syntax inside text
    if (mdRe.test(s.text)) {
      mdRe.lastIndex = 0;
      for (const piece of mdSpans(s.text)) {
        if (piece.type === "text") curSpans.push(span(piece.text, [...decoMarks, ...linkKeys]));
        else if (piece.type === "link") {
          const def = linkDef(cleanHref(piece.url));
          curDefs.push(def);
          curSpans.push(span(piece.text, [...decoMarks, def._key]));
          notes.push(`md link → annotation: ${piece.text.slice(0, 40)}`);
        } else {
          flush();
          const ref = assetRef(piece.url);
          if (ref) {
            notes.push(`md ${piece.type} → block`);
            out.push(piece.type === "video" ? videoBlock(ref, piece.caption) : imgBlock(ref, piece.alt ?? "", piece.caption));
          } else {
            notes.push(`FLAG: asset not uploaded ${piece.url.slice(0, 80)}`);
            curSpans.push(span(`![${piece.alt ?? ""}](${piece.url})`, [...decoMarks, ...linkKeys]));
          }
        }
      }
      continue;
    }
    curSpans.push({ ...s, marks: [...decoMarks, ...linkKeys] });
  }
  flush();
  // drop empty paragraph left behind
  return out.filter((x) => x._type !== "block" || (x.children ?? []).some((s) => (s.text ?? "").trim()) || (x.markDefs ?? []).length);
}

const slugify = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 96) || "post";

const mutations = [];
const report = [];
for (const p of posts) {
  const notes = [];
  const set = {};

  // title
  const tt = (p.title ?? "").trim().replace(/\s+/g, " ");
  if (tt !== p.title) { set.title = tt; notes.push(`title trimmed`); }

  // hash slugs → real slug (+ alias)
  if (/^[0-9a-f]{20,}$/.test(p.slug ?? "")) {
    const ns = slugify(tt).slice(0, 90);
    set.slug = { _type: "slug", current: ns };
    set.aliases = [...new Set([...(p.aliases ?? []), `/${p.channel}/${p.slug}`])];
    notes.push(`hash slug → ${ns} (alias kept)`);
  } else if (p.migration?.legacyUrl && p.migration.source === "ghost") {
    const last = p.migration.legacyUrl.replace(/\/+$/, "").split("/").pop();
    if (last && last !== p.slug) {
      set.aliases = [...new Set([...(p.aliases ?? []), `/${p.channel}/${last}`])];
      notes.push(`alias += /${p.channel}/${last}`);
    }
  }

  // body
  const newBody = (p.body ?? []).flatMap((b) => transformBlock(b, notes));
  const changed = JSON.stringify(newBody) !== JSON.stringify(p.body ?? []);
  if (changed) set.body = newBody;
  // commentary gets the same cleanup
  if (p.commentary?.length) {
    const newC = p.commentary.flatMap((b) => transformBlock(b, notes));
    if (JSON.stringify(newC) !== JSON.stringify(p.commentary)) set.commentary = newC;
  }

  // snapshot images → mirrored URLs; bot-check junk stripped outright
  if (p.archiveSnapshot && /!\[[^\]]*\]\(https?:/.test(p.archiveSnapshot)) {
    let snap = p.archiveSnapshot.replace(/(!\[[^\]]*\]\()(https?:[^)\s]+)(\))/g, (m, pre, url, post) => {
      if (DROP_URLS.has(url) || /google\.com\/recaptcha|gstatic\.com\/recaptcha|googleusercontent.*captcha/i.test(url)) { notes.push("stripped junk image from snapshot"); return ""; }
      const a = assetMap[url];
      return a && !a.error ? `${pre}${a.url}${post}` : m;
    });
    // dead-host links → wayback (visla.kr is dead; tags/authors/features have captures)
    snap = snap.replace(/(\[[^\]]*\]\()(https?:\/\/visla\.kr[^)\s]+)(\))/g, (m, pre, url, post) => {
      notes.push(`dead-host link → wayback: ${url.slice(0, 60)}`);
      return `${pre}https://web.archive.org/web/2024/${url}${post}`;
    });
    if (snap !== p.archiveSnapshot) { set.archiveSnapshot = snap; notes.push("snapshot images → sanity cdn"); }
  }

  // events → album
  if (p.channel === "events") {
    const imgs = (set.body ?? p.body ?? []).filter((b) => b._type === "image");
    if (imgs.length && !(p.nAlbums > 0)) {
      const albumId = `album-${p.slug}`.slice(0, 128);
      mutations.push({ createOrReplace: {
        _id: albumId, _type: "album",
        title: `${tt} — photos`.slice(0, 200),
        slug: { _type: "slug", current: `${p.slug}-photos`.slice(0, 96) },
        ...(p.publishedAt ? { date: p.publishedAt.slice(0, 10) } : {}),
        // no `post` back-ref: the post is a draft; the authoritative link is post.albums → album
        images: imgs.map((i) => ({
          _key: key(), _type: "image",
          asset: { _type: "reference", _ref: i.asset._ref },
          alt: i.alt ?? "", ...(i.caption ? { caption: i.caption } : {}),
        })),
      } });
      set.albums = [{ _key: key(), _type: "reference", _ref: albumId }];
      set.body = (set.body ?? p.body).filter((b) => b._type !== "image");
      notes.push(`${imgs.length} images → album ${albumId}`);
    }
  }

  if (!Object.keys(set).length && !mutations.some((m) => m.createOrReplace?._id === `album-${p.slug}`)) continue;
  if (Object.keys(set).length) mutations.push({ patch: { id: p.id, set } });
  report.push({ id: p.id, notes });
}

if (process.argv.includes("--print")) {
  console.log(JSON.stringify(mutations.filter((m) => (m.patch?.id ?? "").includes(ONLY ?? "") || (m.createOrReplace?._id ?? "").includes(ONLY ?? "")), null, 2).slice(0, 12000));
}
writeFileSync("content-review/fix/report.json", JSON.stringify(report, null, 2));
console.log(`${report.length} posts changed; ${mutations.length} mutations`);
const byNote = {};
for (const r of report) for (const n of r.notes) { const k = n.split(":")[0].replace(/ →.*$/, ""); byNote[k] = (byNote[k] ?? 0) + 1; }
for (const [k, n] of Object.entries(byNote).sort((a, b) => b[1] - a[1])) console.log(`  ${n} × ${k}`);

if (APPLY && mutations.length) {
  let failed = 0;
  for (let i = 0; i < mutations.length; i += 40) {
    const res = await fetch(`${API}/data/mutate/${DATASET}`, {
      method: "POST", headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ mutations: mutations.slice(i, i + 40) }),
    });
    if (!res.ok) {
      failed++;
      console.error(`batch ${i}: ${res.status} ${(await res.text()).slice(0, 300)}`);
      continue;
    }
    console.log(`committed ${Math.min(i + 40, mutations.length)}/${mutations.length}`);
  }
  if (failed) console.error(`${failed} batches failed — rerun to retry`);
}
