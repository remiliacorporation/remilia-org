import { esc, safeHref } from "./html";

interface Span {
  _type: "span";
  text: string;
  marks?: string[];
}

interface MarkDef {
  _key: string;
  _type: string;
  href?: string;
  text?: string;
  /** Source-document note number — pins the rendered ref/id when set. */
  n?: number;
  /** Image-bodied notes — rendered inside the note. */
  image?: { asset?: { _ref?: string; url?: string }; alt?: string; caption?: string };
}

interface TextBlock {
  _type: "block";
  style?: string;
  listItem?: string;
  children: Span[];
  markDefs?: MarkDef[];
}

interface ImageBlock {
  _type: "image";
  alt?: string;
  caption?: string;
  asset?: { _ref?: string; url?: string };
}

interface VideoBlock {
  _type: "video";
  caption?: string;
  file?: { asset?: { _ref?: string; url?: string } };
  poster?: { asset?: { _ref?: string; url?: string } };
}

export type PTBlock = TextBlock | ImageBlock | VideoBlock | { _type: string };

export interface LinkCard {
  title: string;
  description: string;
  imageUrl?: string;
}

export interface PTOptions {
  imageUrl: (img: ImageBlock) => string | undefined;
  /** Candidate widths for the same image, as a ready `srcset` value. */
  imageSrcSet?: (img: ImageBlock) => string | undefined;
  /** Overrides the prose-measure `sizes` hint. */
  imageSizes?: string;
  /** Self-hosted video/file asset URL for `video` blocks. */
  videoUrl?: (v: VideoBlock) => string | undefined;
  linkCard?: (href: string) => LinkCard | undefined;
}

const INTERNAL_HOSTS = /^https?:\/\/(?:[\w-]+\.)*remilia\.(?:org|com|net)\b/;

export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "section"
  );
}

export interface Heading {
  id: string;
  text: string;
  level: 2 | 3 | 4;
}

function isTextBlock(b: PTBlock): b is TextBlock {
  return b._type === "block";
}

function isImageBlock(b: PTBlock): b is ImageBlock {
  return b._type === "image";
}

function isVideoBlock(b: PTBlock): b is VideoBlock {
  return b._type === "video";
}

const HEADING_LEVEL: Record<string, 2 | 3 | 4> = { h2: 2, h3: 3, h4: 4 };

function headingBlocks(
  blocks: PTBlock[],
): { block: TextBlock; level: 2 | 3 | 4 }[] {
  return blocks.flatMap((b) =>
    isTextBlock(b) && !b.listItem && b.style && b.style in HEADING_LEVEL
      ? [{ block: b, level: HEADING_LEVEL[b.style] }]
      : [],
  );
}

function plainText(block: TextBlock): string {
  return block.children.map((s) => s.text).join("");
}

export function extractHeadings(blocks: PTBlock[]): Heading[] {
  const seen = new Map<string, number>();
  return headingBlocks(blocks).map(({ block, level }) => {
    const text = plainText(block);
    const base = slugify(text);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return { id: n === 0 ? base : `${base}-${n}`, text, level };
  });
}

export function tocItems(headings: Heading[], minHeadings = 3): string {
  const usable = headings.filter((h) => h.level <= 3);
  if (usable.length < minHeadings) return "";
  return usable
    .map(
      (h) =>
        `<li class="toc-l${h.level}"><a href="#${h.id}"><span class="toc-label">${esc(h.text)}</span></a></li>`,
    )
    .join("\n");
}

export function footnoteCount(blocks: PTBlock[]): number {
  let n = 0;
  for (const b of blocks) {
    if (!isTextBlock(b)) continue;
    const defs = b.markDefs ?? [];
    for (const s of b.children) {
      for (const mark of s.marks ?? []) {
        const def = defs.find((d) => d._key === mark);
        if (def?._type === "footnote") n += 1;
      }
    }
  }
  return n;
}

interface RenderState {
  count: number;
  opts: PTOptions;
  /** fn ids already emitted — later defs sharing a source number get suffixed. */
  emitted: Set<string>;
  /** every fn-N id this document will render — lets in-note refs resolve. */
  fnTargets: Set<number>;
  /** footnote texts by number — nested in-note refs can embed the target as a sub-note. */
  fnTexts: Map<number, string>;
  /** pooled endnote entries — every note also lists at the end of the article. */
  endnotes: string[];
}

const FN_GLYPH: Record<string, number> = { "¹": 1, "²": 2, "³": 3, "⁴": 4, "⁵": 5, "⁶": 6, "⁷": 7, "⁸": 8, "⁹": 9, "⁰": 0 };
const fnGlyphNum = (g: string) => parseInt([...g].map((c) => FN_GLYPH[c]).join(""), 10);
const FN_XREF_RE = /⁽([¹²³⁴⁵⁶⁷⁸⁹⁰]+)⁾?|\\\[(\d+)\\\]|\[(\d+)\]|([A-Za-z])(\d{1,3})(?=[,.;:)\s]|$)/g;
const xrefTarget = (m: RegExpMatchArray) =>
  m[1] != null ? fnGlyphNum(m[1]) : parseInt(m[2] ?? m[3] ?? m[5], 10);

const BARE_URL_RE = /https?:\/\/(?:[^\s<>"')\]&]|&amp;)+/g;
const urlFor = (u: string) =>
  (/^https?:\/\//.test(u) ? u : `https://${u}`).replace(/\\/g, "");
const urlHost = (u: string) =>
  urlFor(u).replace(/^https?:\/\//, "").replace(/\/.*$/, "");

// Footnote text is a hand-marked string: _emphasis_, <urls> and bare
// https://, citation tails "Author, _Title_ (year); <url>", in-note refs
// ⁽N⁾ / [N] / word-glued digits, and \n paragraph breaks. Normalize all of
// it into real markup — links point at the title, quoted passages become
// inset blocks, each \n chunk a paragraph.
function fnTextHtml(text: string, state: RenderState): string {
  const stash: string[] = [];
  const keep = (h: string) => `\u0000${stash.push(h) - 1}\u0000`;
  const resolve = (s: string): string =>
    s.replace(/\u0000(\d+)\u0000/g, (_m, i) => resolve(stash[+i]));
  const link = (label: string, url: string, ital = false) =>
    keep(
      `<a href="${esc(urlFor(url))}">${ital ? `<em>${esc(label)}</em>` : esc(label)}</a>`,
    );
  const inline = (s0: string): string =>
    s0
      .replace(/\\([[\]()<>_])/g, "$1")
      .replace(
        /, (_[^_]{2,90}?_|[^,;_()]{2,90}?) \((\d{4}[a-z]?)\); (?:<([^\s>]*(?:[\w-]+\.)+[a-zA-Z]{2,}[^\s>]*)>|_((?:https?:\/\/)?[^\s_]+)_)/g,
        (_m, t: string, y: string, u1?: string, u2?: string) =>
          `, ${link(t.replace(/^_+|_+$/g, ""), u1 ?? u2 ?? "", /^_/.test(t))} (${y})`,
      )
      .replace(
        /<([^\s>]*(?:[\w-]+\.)+[a-zA-Z]{2,}[^\s>]*)>|_((?:https?:\/\/)[^\s_]+)_|(https?:\/\/[^\s<>"')\]]+)/g,
        (_m, a?: string, b?: string, c?: string) =>
          link(urlHost(a ?? b ?? c ?? ""), a ?? b ?? c ?? ""),
      )
      .replace(FN_XREF_RE, (m, ...a) => {
        const mm = [m, ...a] as RegExpMatchArray;
        const t = xrefTarget(mm);
        return state.fnTargets.has(t)
          ? (mm[4] ?? "") +
              keep(`<a class="fn-xref" href="#fn-${t}"><sup>${t}</sup></a>`)
          : m;
      })
      .replace(/_([^_\n]+)_/g, (_m, i: string) => keep(`<em>${esc(i)}</em>`));
  const para = (p: string): string => {
    let s = esc(inline(p));
    s = s.replace(/“[^”]{80,}”|&quot;.{80,}?&quot;/g, (m) =>
      keep(`<span class="fn-q">${m}</span>`),
    );
    const q = s.match(/^(.{0,100}?): (\S[\s\S]{150,})$/);
    if (q) s = `${q[1]}: ${keep(`<span class="fn-q">${q[2]}</span>`)}`;
    return keep(`<span class="fn-par">${s}</span>`);
  };
  return resolve(text.split(/\n+/).map(para).join(""));
}

function linkHtml(def: MarkDef, inner: string, state: RenderState): string {
  const href = safeHref(def.href ?? "");
  const external = /^https?:/.test(href) && !INTERNAL_HOSTS.test(href);
  if (external)
    return `<a class="outlink" href="${esc(href)}" rel="external noopener">${inner}</a>`;
  const card = state.opts.linkCard?.(href);
  if (!card) return `<a href="${esc(href)}">${inner}</a>`;
  const img = card.imageUrl
    ? `<span class="ht"><span class="ht-map"><img src="${esc(card.imageUrl)}" alt="" loading="lazy"><span class="ht-ink" aria-hidden="true"></span></span></span>`
    : "";
  return `<a class="interlink" href="${esc(href)}">${inner}<span class="link-card" role="tooltip">${img}<strong>${esc(card.title)}</strong><span>${esc(card.description)}</span></span></a>`;
}

function fnImgHtml(def: MarkDef, state: RenderState): string {
  if (!def.image?.asset) return "";
  const dims = imageDims(def.image.asset._ref);
  return `<img class="fn-img" src="${esc(state.opts.imageUrl({ _type: "image", asset: def.image.asset }) ?? "")}"${dims ? ` width="${dims.w}" height="${dims.h}"` : ""} alt="${esc(def.image.alt ?? def.image.caption ?? "")}" loading="lazy">`;
}

function fnHtml(def: MarkDef, inner: string, state: RenderState): string {
  state.count += 1;
  const n = def.n ?? state.count;
  let id = `fn-${n}`;
  for (let k = 2; state.emitted.has(id); k++) id = `fn-${n}-${k}`;
  state.emitted.add(id);
  const img = fnImgHtml(def, state);
  const txt = (def.text ?? "").trim();
  // the note also lands in the endnotes pool — its entry id is fndef-N so
  // in-note xrefs to #fn-N still resolve to the in-text anchor.
  state.endnotes.push(
    `<div class="fn-end" id="fndef-${id.slice(3)}"><strong>${n}.</strong><span class="sn-text">${fnTextHtml(txt, state)}${img}</span><a class="fn-hit" href="#${id}" aria-label="Back to reference ${n}"></a></div>`,
  );
  return `${inner}<span class="fn" id="${id}"><a class="fn-ref" href="#fndef-${id.slice(3)}" aria-label="Note ${n}"><sup>${n}</sup></a><span class="fn-note" role="note" data-n="${n}"><strong>${n}:</strong><span class="sn-text">${fnTextHtml(txt, state)}${img}</span></span></span>`;
}

function spanHtml(span: Span, markDefs: MarkDef[], state: RenderState): string {
  let html = esc(span.text)
    .replace(/\n/g, "<br>")
    .replace(BARE_URL_RE, (u) => {
      const trail = u.match(/[.,;:!?)\]]+$/)?.[0] ?? "";
      const url = u.slice(0, u.length - trail.length);
      return `<a href="${url}">${url}</a>${trail}`;
    });
  for (const mark of span.marks ?? []) {
    if (mark === "strong") html = `<strong>${html}</strong>`;
    else if (mark === "em") html = `<em>${html}</em>`;
    else if (mark === "code") html = `<code>${html}</code>`;
    else {
      const def = markDefs.find((d) => d._key === mark);
      if (def?._type === "link" && def.href) html = linkHtml(def, html, state);
      else if (def?._type === "footnote") html = fnHtml(def, html, state);
    }
  }
  return html;
}

/** Sanity asset refs end in `-<W>x<H>-<fmt>` — intrinsic size for img attrs. */
export function imageDims(
  ref?: string,
): { w: number; h: number } | undefined {
  const m = ref?.match(/-(\d+)x(\d+)-[a-z0-9]+$/i);
  return m ? { w: +m[1], h: +m[2] } : undefined;
}

export function figureHtml(input: {
  src: string;
  srcset?: string;
  sizes?: string;
  alt?: string;
  caption?: string;
  width?: number;
  height?: number;
}): string {
  const caption = input.caption
    ? `<figcaption><a href="${esc(input.src)}">${esc(input.caption)}</a></figcaption>`
    : "";
  const responsive = input.srcset
    ? ` srcset="${esc(input.srcset)}" sizes="${esc(input.sizes ?? "(min-width: 1100px) 560px, 100vw")}"`
    : "";
  const dims =
    input.width && input.height
      ? ` width="${input.width}" height="${input.height}"`
      : "";
  return `<figure><a href="${esc(input.src)}" aria-label="${esc(input.alt || input.caption || "View full-size image")}"><span class="ht"><span class="ht-map"><img src="${esc(input.src)}"${responsive}${dims} alt="${esc(input.alt ?? "")}" loading="lazy"><span class="ht-ink" aria-hidden="true"></span></span></span></a>${caption}</figure>`;
}

export function portableTextToHtml(blocks: PTBlock[], opts: PTOptions): string {
  const state: RenderState = { count: 0, opts, emitted: new Set(), fnTargets: new Set(), fnTexts: new Map(), endnotes: [] };
  {
    let pos = 0;
    for (const b of blocks) {
      if (!isTextBlock(b)) continue;
      for (const d of b.markDefs ?? []) {
        if (d._type !== "footnote") continue;
        const n = d.n ?? ++pos;
        state.fnTargets.add(n);
        state.fnTexts.set(n, d.text ?? "");
      }
    }
  }
  const headingIds = new Map<TextBlock, string>();
  const headingList = headingBlocks(blocks);
  extractHeadings(blocks).forEach((h, i) =>
    headingIds.set(headingList[i].block, h.id),
  );

  const out: string[] = [];
  let list: { tag: "ul" | "ol"; items: string[] } | null = null;
  let openH2 = false;
  let openH3 = false;

  const flushList = (): void => {
    if (!list) return;
    out.push(
      `<${list.tag}>${list.items.map((i) => `<li>${i}</li>`).join("")}</${list.tag}>`,
    );
    list = null;
  };
  const closeH3 = (): void => {
    if (!openH3) return;
    out.push("</div>");
    openH3 = false;
  };
  const closeH2 = (): void => {
    closeH3();
    if (!openH2) return;
    out.push("</div>");
    openH2 = false;
  };

  for (const block of blocks) {
    if (isTextBlock(block) && block.listItem) {
      const tag = block.listItem === "number" ? "ol" : "ul";
      const item = block.children
        .map((s) => spanHtml(s, block.markDefs ?? [], state))
        .join("");
      if (list && list.tag === tag) list.items.push(item);
      else {
        flushList();
        list = { tag, items: [item] };
      }
      continue;
    }
    flushList();

    if (block._type === "divider") {
      out.push("<hr>");
      continue;
    }

    if (isTextBlock(block)) {
      // a lone run of rule characters is an imported <hr>
      if (
        !block.listItem &&
        !block.markDefs?.length &&
        /^[-–—=_*]{3,}$/.test(plainText(block).trim())
      ) {
        out.push("<hr>");
        continue;
      }
      // notes-list block: children are only empty fn-marked spans (+ whitespace)
      // — trailing/orphan notes render as a static list, not margin popovers.
      const fnKeys = new Set(
        (block.markDefs ?? []).filter((d) => d._type === "footnote").map((d) => d._key),
      );
      const onlyNotes =
        fnKeys.size > 0 &&
        block.children.length > 0 &&
        block.children.every((s) => {
          if ((s.text ?? "").trim()) return false;
          const m = s.marks ?? [];
          return m.length === 0 || m.some((k) => fnKeys.has(k));
        });
      if (onlyNotes) {
        // orphan notes have no in-text ref — their endnote entry keeps the
        // fn-N id so xrefs resolve; no backlink (nothing to jump back to).
        const ordered: MarkDef[] = [];
        for (const s of block.children) {
          for (const m of s.marks ?? []) {
            const d = (block.markDefs ?? []).find((x) => x._key === m && x._type === "footnote");
            if (d) ordered.push(d);
          }
        }
        for (const d of ordered) {
          state.count += 1;
          const n = d.n ?? state.count;
          let id = `fn-${n}`;
          for (let k = 2; state.emitted.has(id); k++) id = `fn-${n}-${k}`;
          state.emitted.add(id);
          const img = fnImgHtml(d, state);
          state.endnotes.push(
            `<div class="fn-end" id="${id}"><strong>${n}.</strong><span class="sn-text">${fnTextHtml(d.text ?? "", state)}${img}</span></div>`,
          );
        }
        continue;
      }
      const inner = block.children
        .map((s) => spanHtml(s, block.markDefs ?? [], state))
        .join("");
      const id = headingIds.get(block);
      if (id && block.style === "h2") {
        closeH2();
        out.push(`<div class="h2-sec">`);
        openH2 = true;
        out.push(
          `<h2 id="${id}"><a class="hlink" href="#${id}">${inner}</a></h2>`,
        );
      } else if (id && block.style === "h3") {
        closeH3();
        out.push(`<div class="h3-sec">`);
        openH3 = true;
        out.push(
          `<h3 id="${id}"><a class="hlink" href="#${id}">${inner}</a></h3>`,
        );
      } else if (id && block.style === "h4") {
        out.push(`<h4 id="${id}">${inner}</h4>`);
      } else if (block.style === "blockquote") {
        let quote = inner;
        const br = quote.lastIndexOf("<br>");
        if (br >= 0) {
          const tail = quote.slice(br + 4);
          const tailText = tail.replace(/<[^>]+>/g, "");
          if (tailText.trim() && /^\s*[—–-]/.test(tailText))
            quote = `${quote.slice(0, br)}<br><span class="bq-by">${tail}</span>`;
        }
        out.push(`<blockquote><p>${quote}</p></blockquote>`);
      } else if (
        plainText(block).trim() ||
        block.markDefs?.some((d) => d._type === "footnote")
      ) {
        out.push(`<p>${inner}</p>`);
      }
    } else if (isImageBlock(block)) {
      const src = opts.imageUrl(block);
      if (!src) continue;
      const dims = imageDims(block.asset?._ref);
      out.push(
        figureHtml({
          src,
          srcset: opts.imageSrcSet?.(block),
          sizes: opts.imageSizes,
          alt: block.alt,
          caption: block.caption,
          width: dims?.w,
          height: dims?.h,
        }),
      );
    } else if (isVideoBlock(block)) {
      const src = opts.videoUrl?.(block);
      if (!src) continue;
      const posterSrc = block.poster?.asset
        ? opts.imageUrl({ _type: "image", asset: block.poster.asset })
        : undefined;
      const caption = block.caption
        ? `<figcaption>${esc(block.caption)}</figcaption>`
        : "";
      out.push(
        `<figure class="video"><video controls playsinline preload="metadata" src="${esc(src)}"${posterSrc ? ` poster="${esc(posterSrc)}"` : ""}></video>${caption}</figure>`,
      );
    }
  }
  flushList();
  if (state.endnotes.length) {
    out.push(
      `<div class="fn-endnotes" role="doc-endnotes">${state.endnotes.join("")}</div>`,
    );
  }
  closeH2();

  return out.join("\n");
}
