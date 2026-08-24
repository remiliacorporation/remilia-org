import { esc } from "./html";

/**
 * Portable Text → semantic HTML. No framework; the only JS anywhere is the
 * optional left-rail fuzzy filter (progressive — the list works without it).
 * Covers `blockContent`: text styles, lists, strong/em/code, link +
 * footnote annotations, inline images. New Koenig cards get a case in the
 * main loop (`.prose-*` classes reserved in blog-core.css).
 *
 * Emits:
 * - h2–h4 with slug ids + `.anchor` self-links (ToC targets)
 * - external links marked `rel="external noopener"` (CSS adds the ↗)
 * - internal links with bake-supplied card data → `.interlink` + a CSS
 *   `.link-card` hover preview (the target's own social-card data)
 * - footnotes → Tufte-style SIDENOTES: a numbered `.fn` label + hidden
 *   checkbox + inline `.sidenote` span. Wide screens float the note into
 *   the right margin at the citation line; narrow screens hide it and the
 *   number toggles it inline (pure CSS, no JS, no duplicated text).
 */

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
}

interface TextBlock {
  _type: "block";
  style?: string;
  listItem?: string;
  level?: number;
  children: Span[];
  markDefs?: MarkDef[];
}

interface ImageBlock {
  _type: "image";
  alt?: string;
  caption?: string;
  asset?: { _ref?: string; url?: string };
}

export type PTBlock = TextBlock | ImageBlock | { _type: string };

export interface LinkCard {
  title: string;
  description: string;
  imageUrl?: string;
}

export interface PTOptions {
  imageUrl: (img: ImageBlock) => string | undefined;
  linkCard?: (href: string) => LinkCard | undefined;
}

const INTERNAL_HOSTS = /^https?:\/\/(www\.)?(remilia\.(org|com|net)|blog\.remilia\.org)\b/;

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

const HEADING_LEVEL: Record<string, 2 | 3 | 4> = { h2: 2, h3: 3, h4: 4 };

function headingBlocks(blocks: PTBlock[]): { block: TextBlock; level: 2 | 3 | 4 }[] {
  return blocks.flatMap((b) =>
    isTextBlock(b) && !b.listItem && b.style && b.style in HEADING_LEVEL
      ? [{ block: b, level: HEADING_LEVEL[b.style] }]
      : [],
  );
}

function plainText(block: TextBlock): string {
  return block.children.map((s) => s.text).join("");
}

/** Deduped slug ids in document order — MUST match portableTextToHtml. */
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

/** ToC list items (the <details class="toc"> wrapper is built by the caller). */
export function tocItems(headings: Heading[], minHeadings = 3): string {
  if (headings.length < minHeadings) return "";
  return headings
    .map((h) => `<li class="toc-l${h.level}"><a href="#${h.id}">${esc(h.text)}</a></li>`)
    .join("\n");
}

interface RenderState {
  count: number;
  opts: PTOptions;
}

function linkHtml(def: MarkDef, inner: string, state: RenderState): string {
  const href = def.href ?? "";
  const external = /^https?:/.test(href) && !INTERNAL_HOSTS.test(href);
  if (external) return `<a href="${esc(href)}" rel="external noopener">${inner}</a>`;
  const card = state.opts.linkCard?.(href);
  if (!card) return `<a href="${esc(href)}">${inner}</a>`;
  const img = card.imageUrl ? `<img src="${esc(card.imageUrl)}" alt="" loading="lazy">` : "";
  return `<a class="interlink" href="${esc(href)}">${inner}<span class="link-card" role="tooltip">${img}<strong>${esc(card.title)}</strong><span>${esc(card.description)}</span></span></a>`;
}

function sidenoteHtml(def: MarkDef, inner: string, state: RenderState): string {
  state.count += 1;
  const n = state.count;
  return `${inner}<label class="fn" for="sn-${n}" role="doc-noteref">${n}</label><input type="checkbox" id="sn-${n}" class="sn-toggle"><span class="sidenote" role="note"><sup>${n}</sup> ${esc(def.text ?? "")}</span>`;
}

function spanHtml(span: Span, markDefs: MarkDef[], state: RenderState): string {
  let html = esc(span.text);
  for (const mark of span.marks ?? []) {
    if (mark === "strong") html = `<strong>${html}</strong>`;
    else if (mark === "em") html = `<em>${html}</em>`;
    else if (mark === "code") html = `<code>${html}</code>`;
    else {
      const def = markDefs.find((d) => d._key === mark);
      if (def?._type === "link" && def.href) html = linkHtml(def, html, state);
      else if (def?._type === "footnote") html = sidenoteHtml(def, html, state);
    }
  }
  return html;
}

export function portableTextToHtml(blocks: PTBlock[], opts: PTOptions): string {
  const state: RenderState = { count: 0, opts };
  const headingIds = new Map<TextBlock, string>();
  const headingList = headingBlocks(blocks);
  extractHeadings(blocks).forEach((h, i) => headingIds.set(headingList[i].block, h.id));

  const out: string[] = [];
  let list: { tag: "ul" | "ol"; items: string[] } | null = null;

  const flushList = (): void => {
    if (!list) return;
    out.push(`<${list.tag}>${list.items.map((i) => `<li>${i}</li>`).join("")}</${list.tag}>`);
    list = null;
  };

  for (const block of blocks) {
    if (isTextBlock(block) && block.listItem) {
      const tag = block.listItem === "number" ? "ol" : "ul";
      const item = block.children.map((s) => spanHtml(s, block.markDefs ?? [], state)).join("");
      if (list && list.tag === tag) list.items.push(item);
      else {
        flushList();
        list = { tag, items: [item] };
      }
      continue;
    }
    flushList();

    if (isTextBlock(block)) {
      const inner = block.children.map((s) => spanHtml(s, block.markDefs ?? [], state)).join("");
      const id = headingIds.get(block);
      if (id && block.style && block.style in HEADING_LEVEL) {
        const tag = block.style;
        out.push(
          `<${tag} id="${id}">${inner}<a class="anchor" href="#${id}" aria-label="Link to this section">#</a></${tag}>`,
        );
      } else if (block.style === "blockquote") {
        out.push(`<blockquote><p>${inner}</p></blockquote>`);
      } else {
        out.push(`<p>${inner}</p>`);
      }
    } else if (isImageBlock(block)) {
      const src = opts.imageUrl(block);
      if (!src) continue;
      const caption = block.caption ? `<figcaption>${esc(block.caption)}</figcaption>` : "";
      out.push(
        `<figure><img src="${esc(src)}" alt="${esc(block.alt ?? "")}" loading="lazy">${caption}</figure>`,
      );
    }
    // Unknown types are skipped deliberately: the Ghost card audit adds
    // explicit cases here; silent HTML injection is never a fallback.
  }
  flushList();
  return out.join("\n");
}
