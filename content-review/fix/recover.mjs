// Recovery apply: download recovered URLs (fresh signed links — time sensitive),
// upload to Sanity, record in assets-map keyed by the DEAD url so apply.mjs
// rewrites land. Reads fix/*-recovery.json files produced by the hunt agents.
import { readFileSync, writeFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join, extname } from "path";

const token = JSON.parse(readFileSync(join(homedir(), ".config/sanity/config.json"), "utf8")).authToken;
const API = "https://8x9419lh.api.sanity.io/v2024-01-01";
const DATASET = "production";
const auth = { Authorization: `Bearer ${token}` };
const MAP = new URL("./assets-map.json", import.meta.url);
const assetMap = existsSync(MAP) ? JSON.parse(readFileSync(MAP, "utf8")) : {};
const drops = [];

async function upload(url, kind) {
  const res = await fetch(url, { redirect: "follow", headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`GET ${url.slice(0, 90)} → ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength < 3000) throw new Error("suspiciously small");
  const mime = res.headers.get("content-type")?.split(";")[0] ?? "application/octet-stream";
  const ext = { "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp", "video/mp4": "mp4", "video/webm": "webm" }[mime] ?? extname(new URL(url).pathname).slice(1) ?? "bin";
  const up = await fetch(`${API}/assets/${kind}s/${DATASET}?filename=${encodeURIComponent("recovered-" + Math.random().toString(36).slice(2, 8) + "." + ext)}`, {
    method: "POST", headers: { ...auth, "Content-Type": mime }, body: buf,
  });
  const j = await up.json();
  if (!up.ok) throw new Error(`upload → ${up.status} ${JSON.stringify(j).slice(0, 200)}`);
  return { ref: j.document._id, url: j.document.url };
}

const recovered = [], failed = [], dropNotes = [];
for (const name of ["ig-recovery.json", "visla-recovery.json"]) {
  const p = new URL(`./${name}`, import.meta.url);
  if (!existsSync(p)) continue;
  const r = JSON.parse(readFileSync(p, "utf8"));
  const images = r.images ?? Object.fromEntries(Object.entries(r.map ?? {}).map(([k, v]) => [k, { fresh: v, identity: r.detail?.[k]?.depicts ?? "" }]));
  for (const [dead, info] of Object.entries(images)) {
    if (!info?.fresh) { failed.push(`${dead.slice(0, 80)} — no fresh url`); continue; }
    if (assetMap[dead] && !assetMap[dead].error) continue;
    if (/author avatar|outlet (avatar|logo)|VISLA Magazine outlet|profile picture of @/i.test(info.identity ?? "")) { drops.push(dead); dropNotes.push(`dropped chrome: ${(info.identity ?? "").slice(0, 60)}`); continue; }
    try {
      const a = await upload(info.fresh, "image");
      assetMap[dead] = a;
      recovered.push(`${dead.slice(0, 70)} → ${a.ref}`);
      process.stdout.write("+");
    } catch (e) { assetMap[dead] = { error: String(e) }; failed.push(`${dead.slice(0, 70)} — ${String(e).slice(0, 90)}`); process.stdout.write("!"); }
  }
  if (r.myriad?.verdict?.includes("drop")) { drops.push(r.myriad.url); dropNotes.push("dropped myriad.markets widget avatar"); }
}
writeFileSync(MAP, JSON.stringify(assetMap, null, 1));
writeFileSync(new URL("./drops.json", import.meta.url), JSON.stringify([...new Set(drops)], null, 1));
console.log(`\n${recovered.length} recovered, ${failed.length} failed, ${drops.length} dropped-as-chrome`);
for (const f of failed) console.log(" !", f);
for (const d of dropNotes) console.log(" ×", d);

// t.co resolutions → href rewrites
const tcoPatches = [];
const ig = JSON.parse(readFileSync(new URL("./ig-recovery.json", import.meta.url), "utf8"));
for (const [tco, resolved] of Object.entries(ig.tco ?? {})) {
  const live = resolved.match(/https?:\/\/[^\s)]+/)?.[0];
  if (live && !/404|deleted|not found/i.test(resolved)) tcoPatches.push({ tco, live });
}
if (tcoPatches.length) {
  const { readdirSync } = await import("fs");
  const DIR = new URL("../posts/", import.meta.url).pathname;
  const muts = [];
  for (const f of readdirSync(DIR).filter((f) => f.endsWith(".json"))) {
    const p = JSON.parse(readFileSync(join(DIR, f), "utf8"));
    let hit = false;
    for (const b of p.body ?? []) for (const d of b.markDefs ?? []) {
      for (const { tco, live } of tcoPatches) if (d.href === tco) { d.href = live; hit = true; }
    }
    if (hit) muts.push({ patch: { id: p.id, set: { body: p.body } } });
  }
  for (const m of muts) {
    const res = await fetch(`${API}/data/mutate/${DATASET}`, { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ mutations: [m] }) });
    console.log(res.ok ? `tco → live href in ${m.patch.id}` : `tco patch failed ${res.status}`);
  }
}
