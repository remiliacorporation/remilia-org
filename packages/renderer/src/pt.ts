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

const INTERNAL_HOSTS =
  /^https?:\/\/(www\.)?(remilia\.(org|com|net)|blog\.remilia\.org)\b/;

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
}

function linkHtml(def: MarkDef, inner: string, state: RenderState): string {
  const href = safeHref(def.href ?? "");
  const external = /^https?:/.test(href) && !INTERNAL_HOSTS.test(href);
  if (external)
    return `<a href="${esc(href)}" rel="external noopener">${inner}</a>`;
  const card = state.opts.linkCard?.(href);
  if (!card) return `<a href="${esc(href)}">${inner}</a>`;
  const img = card.imageUrl
    ? `<span class="ht"><span class="ht-map"><img src="${esc(card.imageUrl)}" alt="" loading="lazy"><span class="ht-ink" aria-hidden="true"></span></span></span>`
    : "";
  return `<a class="interlink" href="${esc(href)}">${inner}<span class="link-card" role="tooltip">${img}<strong>${esc(card.title)}</strong><span>${esc(card.description)}</span></span></a>`;
}

function fnHtml(def: MarkDef, inner: string, state: RenderState): string {
  state.count += 1;
  const n = state.count;
  return `${inner}<span class="fn" id="fn-${n}"><input type="checkbox" class="fn-on" id="fn-${n}-on" aria-label="Show note ${n}"><a class="fn-ref" href="#fn-${n}">[${n}]</a><label class="fn-scrim" for="fn-${n}-on"></label><span class="fn-note" role="note" data-n="${n}"><strong>${n}:</strong><span class="sn-text">${esc(def.text ?? "")}</span></span></span>`;
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
      else if (def?._type === "footnote") html = fnHtml(def, html, state);
    }
  }
  return html;
}

export function portableTextToHtml(blocks: PTBlock[], opts: PTOptions): string {
  const state: RenderState = { count: 0, opts };
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

    if (isTextBlock(block)) {
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
        out.push(`<blockquote><p>${inner}</p></blockquote>`);
      } else {
        out.push(`<p>${inner}</p>`);
      }
    } else if (isImageBlock(block)) {
      const src = opts.imageUrl(block);
      if (!src) continue;
      const caption = block.caption
        ? `<figcaption><a href="${esc(src)}">${esc(block.caption)}</a></figcaption>`
        : "";
      out.push(
        `<figure><a href="${esc(src)}" aria-label="${esc(block.alt || block.caption || "View full-size image")}"><span class="ht"><span class="ht-map"><img src="${esc(src)}" alt="${esc(block.alt ?? "")}" loading="lazy"><span class="ht-ink" aria-hidden="true"></span></span></span></a>${caption}</figure>`,
      );
    }
  }
  flushList();
  closeH2();

  return out.join("\n");
}
