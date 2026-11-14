import { esc, safeHref } from "./html";
import { lowerFootnotes } from "./footnotes";

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
  /**
   * A note written in the Studio: paragraphs and block quotes, with marks,
   * links, and notes of its own. Wins over `text` when it has blocks.
   */
  content?: PTBlock[];
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
  /** The image's intrinsic size, so the card holds its box before it loads. */
  imageWidth?: number;
  imageHeight?: number;
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
  /**
   * Called with each note in the text as it renders: its block's key, its
   * own key, the markup inside its `.fn-note` box, and the boxes of the
   * notes nested in it (`.fn-sub`, whole). The Studio shows that markup in
   * the editor, so a note looks there as it does on the site.
   */
  onNote?: (
    blockKey: string,
    noteKey: string,
    html: string,
    subs: string,
  ) => void;
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

/** Every note a reader meets: the text's notes and the notes inside them. */
export function footnoteCount(blocks: PTBlock[]): number {
  let n = 0;
  for (const b of lowerFootnotes(blocks)) {
    if (!isTextBlock(b)) continue;
    const defs = b.markDefs ?? [];
    for (const s of b.children) {
      for (const mark of s.marks ?? []) {
        const def = defs.find((d) => d._key === mark);
        if (def?._type !== "footnote") continue;
        n += 1;
        if (def.content?.length) n += footnoteCount(def.content);
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
  /** Set while a note's own blocks render: a note in there is a nested note. */
  inNote?: boolean;
  /** The margin copies of the notes nested in the note being rendered. */
  subs?: string[];
  /**
   * Old-shape notes with no mark in the text (a block of notes alone), by
   * number. Such a note is cited only from inside other notes, so it is a
   * nested note: it gets a margin copy under each note that cites it.
   */
  orphans: Map<number, MarkDef>;
  /** The orphans already copied under the note being rendered. */
  subSeen?: Set<number>;
  /** The key of the block being rendered, for `onNote`. */
  blockKey?: string;
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
        if (state.fnTargets.has(t)) subNote(t, state);
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

/**
 * The margin copy (fn-sub) of an orphan note, cited as `t` from the note
 * being rendered. The page script stands it under that note and ties it to
 * the reference (`.fn-xref[href="#fn-t"]`).
 */
function subNote(t: number, state: RenderState): void {
  const def = state.orphans.get(t);
  if (!def || !state.subs || !state.subSeen || state.subSeen.has(t)) return;
  state.subSeen.add(t);
  const at = state.subs.push("") - 1;
  const body = fnBodyHtml(def, state, false);
  state.subs[at] =
    `<span class="fn-note fn-sub" role="note" data-n="${t}" data-ref="fn-${t}"><strong>${t}:</strong><span class="sn-text">${body}</span></span>`;
}

/**
 * A block of notes alone: its children are only empty note-marked spans
 * and white space. Its notes have no mark in the text (orphans).
 */
function notesOnly(block: TextBlock): boolean {
  const fnKeys = new Set(
    (block.markDefs ?? []).filter((d) => d._type === "footnote").map((d) => d._key),
  );
  return (
    fnKeys.size > 0 &&
    block.children.length > 0 &&
    block.children.every((s) => {
      if ((s.text ?? "").trim()) return false;
      const m = s.marks ?? [];
      return m.length === 0 || m.some((k) => fnKeys.has(k));
    })
  );
}

function linkHtml(def: MarkDef, inner: string, state: RenderState): string {
  const href = safeHref(def.href ?? "");
  const external = /^https?:/.test(href) && !INTERNAL_HOSTS.test(href);
  if (external)
    return `<a class="outlink" href="${esc(href)}" rel="external noopener">${inner}</a>`;
  const card = state.opts.linkCard?.(href);
  if (!card) return `<a href="${esc(href)}">${inner}</a>`;
  const dims =
    card.imageWidth && card.imageHeight
      ? ` width="${card.imageWidth}" height="${card.imageHeight}"`
      : "";
  const img = card.imageUrl
    ? `<span class="ht"><span class="ht-map"><img src="${esc(card.imageUrl)}"${dims} alt="" loading="lazy"><span class="ht-ink" aria-hidden="true"></span></span></span>`
    : "";
  return `<a class="interlink" href="${esc(href)}">${inner}<span class="link-card" role="tooltip">${img}<strong>${esc(card.title)}</strong><span>${esc(card.description)}</span></span></a>`;
}

function fnImgHtml(def: MarkDef, state: RenderState): string {
  if (!def.image?.asset) return "";
  const dims = imageDims(def.image.asset._ref);
  return `<img class="fn-img" src="${esc(state.opts.imageUrl({ _type: "image", asset: def.image.asset }) ?? "")}"${dims ? ` width="${dims.w}" height="${dims.h}"` : ""} alt="${esc(def.image.alt ?? def.image.caption ?? "")}" loading="lazy">`;
}

/** Takes the next free `fn-N` id for a note numbered `n`. */
function fnId(n: number, state: RenderState): string {
  let id = `fn-${n}`;
  for (let k = 2; state.emitted.has(id); k++) id = `fn-${n}-${k}`;
  state.emitted.add(id);
  return id;
}

/**
 * A Studio-written note's blocks. A note sits inside a paragraph, so its
 * paragraphs and quotes are spans (`.fn-par`, `.fn-q`), the same ones the
 * hand-marked text of an old note becomes.
 */
function fnContentHtml(blocks: PTBlock[], state: RenderState): string {
  const was = state.inNote;
  state.inNote = true;
  const out = blocks
    .filter(isTextBlock)
    .map((b) => {
      const inner = b.children
        .map((s) => spanHtml(s, b.markDefs ?? [], state))
        .join("");
      if (!inner) return "";
      return b.style === "blockquote"
        ? `<span class="fn-q">${inner}</span>`
        : `<span class="fn-par">${inner}</span>`;
    })
    .join("");
  state.inNote = was;
  return out;
}

/** What a note says: its blocks, or an old note's hand-marked text. */
function fnBodyHtml(def: MarkDef, state: RenderState, trim = true): string {
  const text = def.text ?? "";
  const body = def.content?.length
    ? fnContentHtml(def.content, state)
    : fnTextHtml(trim ? text.trim() : text, state);
  return `${body}${fnImgHtml(def, state)}`;
}

/**
 * Two marks with nothing between them read as one number ("23"), so a
 * superscript comma goes between: a note's closing tags, then the next
 * note's opening tag. A space alone between two marks gives way to it.
 */
const ADJACENT_NOTES = /(<\/span><\/span><\/span>)\s*(?=<span class="fn" id=)/g;
const FN_SEP = '$1<sup class="fn-sep" aria-hidden="true">,</sup>';

/** A nested note's reference carries its id only in the endnotes copy. */
const withoutIds = (html: string): string =>
  html.replace(/(<a class="fn-xref") id="fn-[^"]*"/g, "$1");

function fnHtml(def: MarkDef, inner: string, state: RenderState): string {
  state.count += 1;
  const n = def.n ?? state.count;
  const id = fnId(n, state);
  // The note takes its place in the endnotes before the notes inside it.
  const slot = state.endnotes.push("") - 1;
  if (state.inNote) {
    // A note inside a note: its reference sits in the parent's text and
    // links to its own endnote, which links back. Its margin copy
    // (fn-sub) follows the parent's, in reading order; the page script
    // stands it under the parent and ties it to this reference.
    const at = state.subs ? state.subs.push("") - 1 : -1;
    const body = fnBodyHtml(def, state);
    state.endnotes[slot] =
      `<div class="fn-end" id="fndef-${id.slice(3)}"><strong>${n}.</strong><span class="sn-text">${body}</span><a class="fn-hit" href="#${id}" aria-label="Back to reference ${n}"></a></div>`;
    if (state.subs && at >= 0)
      state.subs[at] =
        `<span class="fn-note fn-sub" role="note" data-n="${n}" data-ref="fndef-${id.slice(3)}"><strong>${n}:</strong><span class="sn-text">${withoutIds(body)}</span></span>`;
    return `${inner}<a class="fn-xref" id="${id}" href="#fndef-${id.slice(3)}" aria-label="Note ${n}"><sup>${n}</sup></a>`;
  }
  const subs: string[] = [];
  state.subs = subs;
  state.subSeen = new Set();
  const body = fnBodyHtml(def, state);
  state.subs = undefined;
  state.subSeen = undefined;
  // the note also lands in the endnotes pool — its entry id is fndef-N so
  // in-note xrefs to #fn-N still resolve to the in-text anchor.
  state.endnotes[slot] =
    `<div class="fn-end" id="fndef-${id.slice(3)}"><strong>${n}.</strong><span class="sn-text">${body}</span><a class="fn-hit" href="#${id}" aria-label="Back to reference ${n}"></a></div>`;
  const note = `<strong>${n}:</strong><span class="sn-text">${withoutIds(body)}</span>`;
  state.opts.onNote?.(state.blockKey ?? "", def._key, note, subs.join(""));
  return `${inner}<span class="fn" id="${id}"><a class="fn-ref" href="#fndef-${id.slice(3)}" aria-label="Note ${n}"><sup>${n}</sup></a><span class="fn-note" role="note" data-n="${n}">${note}</span>${subs.join("")}</span>`;
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
      if (def?._type === "link" && def.href)
        html = linkHtml(
          def,
          html,
          // No hover card inside a note: the note is already a hover box.
          state.inNote ? { ...state, opts: { ...state.opts, linkCard: undefined } } : state,
        );
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

/**
 * The Sanity asset id behind an image, from its `image-<id>-WxH-fmt` ref or
 * its `cdn.sanity.io/images/<project>/<dataset>/<id>-WxH.fmt` URL.
 */
export function imageAssetId(asset?: {
  _ref?: string;
  url?: string;
}): string | undefined {
  return (
    asset?._ref?.match(/^image-([a-f0-9]+)-/)?.[1] ??
    asset?.url?.match(/cdn\.sanity\.io\/images\/[^/]+\/[^/]+\/([a-f0-9]+)-/)?.[1]
  );
}

/** True when a body already shows the image with this asset ref. */
export function bodyShowsImage(body: PTBlock[], ref?: string): boolean {
  const id = imageAssetId({ _ref: ref });
  return (
    !!id && body.some((b) => isImageBlock(b) && imageAssetId(b.asset) === id)
  );
}

export function figureHtml(input: {
  src: string;
  srcset?: string;
  sizes?: string;
  alt?: string;
  caption?: string;
  width?: number;
  height?: number;
  /** The page's lead image loads at once; body images wait for the viewport. */
  lead?: boolean;
}): string {
  // The image is also its own link, so a script URL (an imported
  // `![x](javascript:...)`) would run on click.
  if (safeHref(input.src) !== input.src) return "";
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
  return `<figure><a href="${esc(input.src)}" aria-label="${esc(input.alt || input.caption || "View full-size image")}"><span class="ht"><span class="ht-map"><img src="${esc(input.src)}"${responsive}${dims} alt="${esc(input.alt ?? "")}"${input.lead ? ' fetchpriority="high"' : ' loading="lazy"'}><span class="ht-ink" aria-hidden="true"></span></span></span></a>${caption}</figure>`;
}

export function portableTextToHtml(blocks: PTBlock[], opts: PTOptions): string {
  blocks = lowerFootnotes(blocks);
  const state: RenderState = { count: 0, opts, emitted: new Set(), fnTargets: new Set(), fnTexts: new Map(), endnotes: [], orphans: new Map() };
  {
    let pos = 0;
    const scan = (list: PTBlock[]): void => {
      for (const b of list) {
        if (!isTextBlock(b)) continue;
        const orphan = list === blocks && !b.listItem && notesOnly(b);
        for (const d of b.markDefs ?? []) {
          if (d._type !== "footnote") continue;
          const n = d.n ?? ++pos;
          if (orphan) state.orphans.set(n, d);
          state.fnTargets.add(n);
          state.fnTexts.set(n, d.text ?? "");
          if (d.content?.length) scan(d.content);
        }
      }
    };
    scan(blocks);
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
      state.blockKey = (block as { _key?: string })._key;
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
      state.blockKey = (block as { _key?: string })._key;
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
      if (notesOnly(block)) {
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
          const id = fnId(n, state);
          const slot = state.endnotes.push("") - 1;
          state.endnotes[slot] =
            `<div class="fn-end" id="${id}"><strong>${n}.</strong><span class="sn-text">${fnBodyHtml(d, state, false)}</span></div>`;
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

  return out.join("\n").replace(ADJACENT_NOTES, FN_SEP);
}
