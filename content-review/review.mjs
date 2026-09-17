// Per-post audit over content-review/posts/*.json → findings.json + findings.md
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = "content-review/posts";
const posts = readdirSync(DIR).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(join(DIR, f), "utf8")));

const TRACKING = /^(ref|s|t|utm_\w+|fbclid|gclid)$/i;
const MEDIA_HOSTS = /mirror-media|papyrus_images|paragraph\.com\/editor|storage\.ghost\.io|substackcdn|twimg|imgur|cdn\.discord/;
const TYPE_PREFIX = /^(press release|feature|interview|cultural coverage|event coverage|news|thought leadership|artist profile|note|review|essay|guide|coverage|announcement)\s*:\s*/i;

const spanText = (b) => (b.children ?? []).map((s) => s.text ?? "").join("");
const allText = (p) => (p.body ?? []).filter((b) => b._type === "block").map(spanText).join("\n");

const F = []; // findings
const add = (p, kind, fix, note, flag = false) =>
  F.push({ id: p.id, channel: p.channel, slug: p.slug, kind, fix, note, flag });

// cross-doc indexes
const slugIdx = new Map();
const legacyIdx = new Map(); // normalized legacy path → post
for (const p of posts) {
  slugIdx.set(`${p.channel}/${p.slug}`, (slugIdx.get(`${p.channel}/${p.slug}`) ?? 0) + 1);
  const legacy = p.migration?.legacyUrl;
  if (legacy) {
    try {
      const u = new URL(legacy);
      const seg = u.pathname.replace(/\/+$/, "").split("/").filter(Boolean);
      if (seg.length) legacyIdx.set(seg[seg.length - 1], p);
    } catch {}
  }
}
for (const [k, n] of slugIdx) if (n > 1) add(posts.find((p) => `${p.channel}/${p.slug}` === k), "slug", null, `duplicate slug ${k} ×${n}`, true);

for (const p of posts) {
  const isExternal = p.origin === "external";
  // --- title
  const t = p.title ?? "";
  const trimmed = t.trim().replace(/\s+/g, " ");
  if (t !== trimmed) add(p, "title", { set: { title: trimmed } }, `whitespace: ${JSON.stringify(t.slice(0, 60))} → ${JSON.stringify(trimmed.slice(0, 60))}`);
  const gp = t.match(/\s*\[(gp|guest post[^\]]*)\]\s*$/i);
  if (gp) add(p, "title", null, `guest-post attribution in title: "${gp[0]}" → move to authors/byline`, true);
  if (TYPE_PREFIX.test(trimmed)) add(p, "title", null, `type prefix "${trimmed.match(TYPE_PREFIX)[1]}" vs channel ${p.channel}/outlet`, true);
  if (/[a-z]/.test(trimmed) && !/[a-z]{3}/.test(trimmed.slice(1))) {} // noop
  if (/^[^a-z]*[A-Z][A-Z0-9 '$.:!-]{10,}$/.test(trimmed) && trimmed === trimmed.toUpperCase())
    add(p, "title", null, "ALLCAPS title — casing convention?", true);

  // --- slug
  const s = p.slug ?? "";
  if (!s) add(p, "slug", null, "missing slug", true);
  if (/^[0-9a-f]{20,}$/.test(s)) add(p, "slug", null, `hash slug ${s} — needs real slug + alias`, true);
  if (s.endsWith("-2")) add(p, "slug", null, `collision suffix ${s} — rename if base slug free`, true);
  if (p.channel === "events") {
    const m = s.match(/^(\d{2})-(\d{4})-/) || s.match(/^(\d{2})-(\d{4})-/);
    const ym = m ? `${m[2]}-${m[1]}` : null;
    const tm = t.match(/(\d{2})\/(\d{4})/);
    const ty = tm ? `${tm[2]}-${tm[1]}` : null;
    if (ym && ty && ym !== ty) add(p, "slug", null, `events slug date ${ym} vs title date ${ty}`, true);
    if (ym && p.publishedAt && ym !== p.publishedAt.slice(0, 7)) add(p, "slug", null, `events slug date ${ym} vs publishedAt ${p.publishedAt.slice(0, 7)}`, true);
  }
  // alias needed when legacy path's last segment ≠ slug
  if (p.migration?.legacyUrl && p.migration.source === "ghost") {
    const last = p.migration.legacyUrl.replace(/\/+$/, "").split("/").pop();
    if (last && last !== s) add(p, "alias", { setIfMissing: { aliases: [`/${p.channel}/${last}`] } }, `legacy slug ${last} ≠ ${s} — add alias`);
  }

  // --- excerpt
  const e = p.excerpt ?? "";
  if (/\\|!\[|\]\(|^@|\bShots from\b|Guest post/i.test(e))
    add(p, "excerpt", null, `leaked markup/byline in excerpt: ${JSON.stringify(e.slice(0, 80))} — rewrite from first clean paragraph`, true);
  if (!e && !isExternal) add(p, "excerpt", null, "missing excerpt", true);
  if (e.length > 300) add(p, "excerpt", { set: { excerpt: e.slice(0, 297).replace(/\s+\S*$/, "") + "…" } }, "excerpt >300 chars — trim");

  // --- body
  const body = p.body ?? [];
  if (!body.length && !isExternal) add(p, "body", null, "EMPTY BODY (non-external post)", true);
  let nullHrefs = 0, tracking = 0, deadInternal = 0, malformed = [], mediaLinks = [], nullKeyIds = [];
  const markKeys = new Set();
  for (const b of body) {
    if (b._type !== "block") {
      if (b._type === "image" && b.asset && !b.alt) add(p, "image-alt", null, `image ${b.asset?._ref?.slice(0, 20)}… missing alt`);
      continue;
    }
    for (const d of b.markDefs ?? []) {
      if (d._type !== "link") continue;
      markKeys.add(d._key);
      const h = d.href;
      if (h == null || h === "") { nullHrefs++; nullKeyIds.push(d._key); continue; }
      if (h.includes("{{DOMAIN}}") || h.includes("https//") || /[ "]/.test(h)) malformed.push(h.slice(0, 80));
      else {
        try {
          const u = new URL(h.startsWith("/") || h.startsWith("#") ? "https://remilia.org" + h : h.includes("://") ? h : "https://" + h);
          const bad = [...u.searchParams.keys()].filter((k) => TRACKING.test(k));
          if (bad.length) tracking++;
          if (!h.includes("://") && !h.startsWith("/") && !h.startsWith("#") && !h.startsWith("mailto")) malformed.push(h.slice(0, 80));
          if (u.hostname === "blog.remilia.org") deadInternal++;
          if (MEDIA_HOSTS.test(u.hostname + u.pathname)) mediaLinks.push(h.slice(0, 100));
        } catch { malformed.push(h.slice(0, 80)); }
      }
    }
    const txt = spanText(b);
    if (/!\[[^\]]*\]\(https?:/.test(txt)) add(p, "md-image-text", null, `literal ![](url) in text: ${txt.match(/!\[[^\]]*\]\(https?:[^)]*\)/)?.[0]?.slice(0, 100)}`);
    if (/[^!]\[[^\]]{1,60}\]\(https?:/.test(txt)) add(p, "md-link-text", null, `literal [text](url) in body text`);
    if (/^\s*https?:\/\/\S+\s*$/.test(txt)) add(p, "bare-url", null, `bare URL paragraph: ${txt.trim().slice(0, 100)}`);
    if (/^\s*Subscribe\s*$/.test(txt)) add(p, "subscribe-junk", { removeBlock: b._key }, `bare "Subscribe" block`);
    if (/^\s*\\?\s*Guest post/i.test(txt)) add(p, "guestpost-junk", null, `guest-post byline line: ${txt.slice(0, 80)}`);
    if (/[Ã¢Ââ€™â€œ�]/.test(txt)) add(p, "mojibake", null, `encoding junk: ${txt.slice(0, 80)}`);
    if (/\d[¹²³⁴⁵⁶⁷⁸⁹⁰]/.test(txt) || /[¹²³⁴⁵⁶⁷⁸⁹⁰]\s*[a-z]/i.test(txt)) add(p, "glyph-footnote", null, `superscript glyph footnote in: ${txt.slice(0, 60)}`);
    if (/<\/?(figure|figcaption|a |img|video|iframe)/i.test(txt)) add(p, "html-leak", null, `HTML in text: ${txt.slice(0, 80)}`);
    if (/storage\.ghost\.io\S*\.(mp4|webm|mov)/i.test(txt)) add(p, "ghost-video", null, `ghost video URL in text: ${txt.match(/storage\.ghost\.io\S+/)?.[0]?.slice(0, 100)}`);
  }
  if (nullHrefs) add(p, "null-href", { removeMarkKeys: nullKeyIds }, `${nullHrefs} null-href link annotations`);
  if (tracking) add(p, "tracking-params", { stripParams: true }, `${tracking} links with tracking params (ref/s/t/utm)`);
  if (deadInternal) add(p, "dead-internal", null, `${deadInternal} links to blog.remilia.org paths`, true);
  if (malformed.length) add(p, "malformed-url", null, `${malformed.length} malformed hrefs: ${[...new Set(malformed)].slice(0, 3).join(" | ")}`);
  if (mediaLinks.length) add(p, "media-hotlink", null, `${mediaLinks.length} media-URL links → re-host as blocks: ${[...new Set(mediaLinks)].slice(0, 3).join(" | ")}`);

  // --- fields
  if (!p.authors?.length) add(p, "authors", null, "no authors");
  if (!p.tags?.length) add(p, "tags", null, "no tags");
  if (p.coverRef && !p.coverAlt) add(p, "cover-alt", null, "cover missing alt");
  if (!p.publishedAt) add(p, "publishedAt", null, "missing publishedAt", true);
  if (p.channel === "events" && !(p.nAlbums > 0)) {
    const imgs = body.filter((b) => b._type === "image").length;
    add(p, "album", null, `${imgs} inline image blocks → migrate to album doc (title: "${t.trim()}")`);
  }
  if (isExternal && (!p.externalUrl || !p.outlet || !p.archiveSnapshot))
    add(p, "external-incomplete", null, `external archive missing ${[!p.externalUrl && "externalUrl", !p.outlet && "outlet", !p.archiveSnapshot && "snapshot"].filter(Boolean).join("/")}`);
  if (p.archiveSnapshot && /!\[[^\]]*\]\(https?:/.test(p.archiveSnapshot)) {
    const imgs = (p.archiveSnapshot.match(/!\[[^\]]*\]\((https?:[^)]*)\)/g) ?? [])
      .filter((m) => !/cdn\.sanity\.io|web\.archive\.org/.test(m));
    if (imgs.length) add(p, "snapshot-images", null, `${imgs.length} external ![](…) in archiveSnapshot → mirror to Sanity`);
  }
}

writeFileSync("content-review/findings.json", JSON.stringify(F, null, 2));
// readable roll-up
const byKind = {};
for (const f of F) (byKind[f.kind] ??= []).push(f);
const md = ["# Per-post findings", ""];
for (const [k, list] of Object.entries(byKind).sort((a, b) => b[1].length - a[1].length)) {
  md.push(`## ${k} — ${list.length}${list[0].flag ? " (flagged)" : ""}`);
  for (const f of list) md.push(`- \`${f.id.replace("drafts.", "")}\` ${f.note ?? ""}`);
  md.push("");
}
writeFileSync("content-review/findings.md", md.join("\n"));
console.log(`${F.length} findings across ${new Set(F.map((f) => f.id)).size} posts / ${posts.length} total`);
for (const [k, l] of Object.entries(byKind).sort((a, b) => b[1].length - a[1].length)) console.log(`  ${k}: ${l.length}`);
