import { CHANNEL_BASEPATH, type Channel } from "@remilia/seo";
import { slugify, type PTBlock } from "./pt";

export interface MdMeta {
  title?: string;
  slug?: string;
  channel?: Channel;
  publishedAt?: string;
  excerpt?: string;
  author?: string;
  tags?: string[];
  cover?: string;
}

export interface MdPost {
  meta: MdMeta;
  body: PTBlock[];
}

type Span = { _type: "span"; text: string; marks?: string[] };
type MarkDef = { _key: string; _type: string; href?: string; text?: string };

const CHANNELS = new Set<string>([
  "updates",
  "press",
  "thought",
  "archive",
  "news",
  "events",
  "dev-updates",
  "devblog",
]);

function isChannel(v: string): v is Channel {
  return CHANNELS.has(v);
}

/** Split `---` YAML from the Markdown body. Values are strings or string lists. */
export function splitFrontmatter(src: string): { raw: Record<string, string | string[]>; body: string } {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { raw: {}, body: src };
  const raw: Record<string, string | string[]> = {};
  let key: string | undefined;
  for (const line of m[1].split(/\r?\n/)) {
    const list = line.match(/^\s+-\s+(.*)$/);
    if (list && key) {
      const cur = raw[key];
      raw[key] = Array.isArray(cur) ? [...cur, list[1].trim()] : [list[1].trim()];
      continue;
    }
    const kv = line.match(/^([A-Za-z][\w]*)\s*:\s*(.*?)\s*$/);
    if (!kv) continue;
    key = kv[1];
    raw[key] = kv[2];
  }
  return { raw, body: src.slice(m[0].length) };
}

function metaFromRaw(raw: Record<string, string | string[]>): MdMeta {
  const str = (k: string) => {
    const v = raw[k];
    return typeof v === "string" && v ? v : undefined;
  };
  const tags = raw.tags ?? raw.tag;
  const channel = str("channel");
  const published = str("publishedAt") ?? str("date") ?? str("published");
  return {
    title: str("title"),
    slug: str("slug"),
    channel: channel && isChannel(channel) ? channel : undefined,
    publishedAt: published ? (published.length === 10 ? `${published}T00:00:00.000Z` : published) : undefined,
    excerpt: str("excerpt") ?? str("description"),
    author: str("author"),
    tags: Array.isArray(tags) ? tags : typeof tags === "string" && tags ? tags.split(/,\s*/) : undefined,
    cover: str("cover") ?? str("image"),
  };
}

function keys() {
  let n = 0;
  return () => `k${++n}`;
}

function takeFootnotes(md: string): { md: string; notes: Map<string, string> } {
  const notes = new Map<string, string>();
  const md2 = md.replace(/^\[\^([^\]]+)\]:\s*(.*)$/gm, (_, id: string, text: string) => {
    notes.set(id, text.trim());
    return "";
  });
  return { md: md2.trim(), notes };
}

function inlineToSpans(
  text: string,
  channel: Channel,
  notes: Map<string, string>,
  key: () => string,
): { children: Span[]; markDefs: MarkDef[] } {
  const children: Span[] = [];
  const markDefs: MarkDef[] = [];
  const push = (t: string, marks?: string[]) => {
    if (!t && !marks?.length) return;
    children.push(marks?.length ? { _type: "span", text: t, marks } : { _type: "span", text: t });
  };
  let i = 0;
  while (i < text.length) {
    if (text.startsWith("[[", i)) {
      const end = text.indexOf("]]", i + 2);
      if (end < 0) {
        push(text.slice(i));
        break;
      }
      const inner = text.slice(i + 2, end);
      const [target, label] = inner.includes("|") ? inner.split("|", 2) : [inner, inner];
      const href = /^(https?:|\/)/.test(target)
        ? target
        : `${CHANNEL_BASEPATH[channel]}/${slugify(target)}`;
      const k = key();
      markDefs.push({ _key: k, _type: "link", href });
      push(label.trim(), [k]);
      i = end + 2;
      continue;
    }
    if (text.startsWith("[^", i)) {
      const end = text.indexOf("]", i + 2);
      if (end > i) {
        const id = text.slice(i + 2, end);
        const k = key();
        markDefs.push({ _key: k, _type: "footnote", text: notes.get(id) ?? id });
        push("", [k]);
        i = end + 1;
        continue;
      }
    }
    if (text.startsWith("[", i) && !text.startsWith("[^", i)) {
      const mid = text.indexOf("](", i);
      const end = mid >= 0 ? text.indexOf(")", mid + 2) : -1;
      if (mid > i && end > mid) {
        const k = key();
        markDefs.push({ _key: k, _type: "link", href: text.slice(mid + 2, end) });
        push(text.slice(i + 1, mid), [k]);
        i = end + 1;
        continue;
      }
    }
    if (text.startsWith("**", i)) {
      const end = text.indexOf("**", i + 2);
      if (end > i) {
        push(text.slice(i + 2, end), ["strong"]);
        i = end + 2;
        continue;
      }
    }
    if (text.startsWith("`", i)) {
      const end = text.indexOf("`", i + 1);
      if (end > i) {
        push(text.slice(i + 1, end), ["code"]);
        i = end + 1;
        continue;
      }
    }
    if (text[i] === "*" || text[i] === "_") {
      const q = text[i];
      const end = text.indexOf(q, i + 1);
      if (end > i + 1) {
        push(text.slice(i + 1, end), ["em"]);
        i = end + 1;
        continue;
      }
    }
    const next = text.slice(i).search(/(\[\[|\*\*|`|\[[^\]]+\]\(|\[\^|_|\*)/);
    if (next < 0) {
      push(text.slice(i));
      break;
    }
    if (next === 0) {
      push(text[i]);
      i += 1;
      continue;
    }
    push(text.slice(i, i + next));
    i += next;
  }
  return { children: children.length ? children : [{ _type: "span", text: "" }], markDefs };
}

function blocksFromMarkdown(md: string, channel: Channel): PTBlock[] {
  const { md: stripped, notes } = takeFootnotes(md);
  const key = keys();
  const chunks = stripped.split(/\n{2,}/);
  const out: PTBlock[] = [];
  for (const chunk of chunks) {
    const lines = chunk.split(/\n/).filter((l) => l.length > 0);
    if (!lines.length) continue;
    const img = chunk.trim().match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)$/);
    if (img) {
      out.push({ _type: "image", alt: img[1], caption: img[3], asset: { url: img[2] } });
      continue;
    }
    const listKind = lines.every((l) => /^\d+\.\s/.test(l))
      ? "number"
      : lines.every((l) => /^[-*]\s/.test(l))
        ? "bullet"
        : null;
    if (listKind) {
      for (const line of lines) {
        const text = line.replace(/^(\d+\.|[-*])\s+/, "");
        const inline = inlineToSpans(text, channel, notes, key);
        out.push({
          _type: "block",
          listItem: listKind,
          children: inline.children,
          markDefs: inline.markDefs,
        });
      }
      continue;
    }
    const joined = lines.join("\n");
    let style = "normal";
    let text = joined;
    if (joined.startsWith("#### ")) {
      style = "h4";
      text = joined.slice(5);
    } else if (joined.startsWith("### ")) {
      style = "h3";
      text = joined.slice(4);
    } else if (joined.startsWith("## ") || joined.startsWith("# ")) {
      style = "h2";
      text = joined.replace(/^##?\s+/, "");
    } else if (joined.startsWith("> ")) {
      style = "blockquote";
      text = lines.map((l) => l.replace(/^>\s?/, "")).join("\n");
    }
    const inline = inlineToSpans(text, channel, notes, key);
    out.push({ _type: "block", style, children: inline.children, markDefs: inline.markDefs });
  }
  return out;
}

/** Obsidian-style Markdown file → frontmatter + Portable Text for the bake. */
export function markdownToPost(src: string, fallbackChannel: Channel = "press"): MdPost {
  const { raw, body } = splitFrontmatter(src);
  const meta = metaFromRaw(raw);
  const channel = meta.channel ?? fallbackChannel;
  if (!meta.slug && meta.title) meta.slug = slugify(meta.title);
  return { meta: { ...meta, channel }, body: blocksFromMarkdown(body, channel) };
}

function marksOf(span: { marks?: string[] }, defs: MarkDef[]): { strong?: boolean; em?: boolean; code?: boolean; href?: string; fn?: string } {
  const out: { strong?: boolean; em?: boolean; code?: boolean; href?: string; fn?: string } = {};
  for (const m of span.marks ?? []) {
    if (m === "strong") out.strong = true;
    else if (m === "em") out.em = true;
    else if (m === "code") out.code = true;
    else {
      const d = defs.find((x) => x._key === m);
      if (d?._type === "link") out.href = d.href;
      if (d?._type === "footnote") out.fn = d.text;
    }
  }
  return out;
}

function spanToMd(span: { text: string; marks?: string[] }, defs: MarkDef[], fns: string[]): string {
  const m = marksOf(span, defs);
  let t = span.text.replace(/\[/g, "\\[");
  if (m.code) t = `\`${t}\``;
  if (m.strong) t = `**${t}**`;
  if (m.em) t = `*${t}*`;
  if (m.href) {
    const path = m.href.match(
      /^\/(?:updates|press|thought|archive|a\/news|a\/events|a\/studio|blog)\/([^/?#]+)/,
    );
    t = path ? `[[${path[1]}|${span.text}]]` : `[${span.text}](${m.href})`;
  }
  if (m.fn !== undefined) {
    fns.push(m.fn);
    t += `[^${fns.length}]`;
  }
  return t;
}

/** Portable Text → Obsidian Markdown (bake sibling / vault export). */
export function portableTextToMarkdown(blocks: PTBlock[]): string {
  const fns: string[] = [];
  const lines: string[] = [];
  let list: "bullet" | "number" | null = null;
  let n = 0;
  const flushList = () => {
    if (list) {
      lines.push("");
      list = null;
      n = 0;
    }
  };
  for (const b of blocks) {
    if (b._type === "image") {
      flushList();
      const img = b as { alt?: string; caption?: string; asset?: { url?: string; _ref?: string } };
      const src = img.asset?.url ?? img.asset?._ref ?? "";
      const cap = img.caption ? ` "${img.caption}"` : "";
      lines.push(`![${img.alt ?? ""}](${src}${cap})`, "");
      continue;
    }
    if (b._type !== "block") continue;
    const block = b as {
      style?: string;
      listItem?: string;
      children: { text: string; marks?: string[] }[];
      markDefs?: MarkDef[];
    };
    const defs = block.markDefs ?? [];
    const inner = block.children.map((s) => spanToMd(s, defs, fns)).join("");
    if (block.listItem) {
      const kind = block.listItem === "number" ? "number" : "bullet";
      if (list && list !== kind) flushList();
      list = kind;
      if (kind === "number") {
        n += 1;
        lines.push(`${n}. ${inner}`);
      } else lines.push(`- ${inner}`);
      continue;
    }
    flushList();
    if (block.style === "h2") lines.push(`## ${inner}`, "");
    else if (block.style === "h3") lines.push(`### ${inner}`, "");
    else if (block.style === "h4") lines.push(`#### ${inner}`, "");
    else if (block.style === "blockquote") lines.push(`> ${inner}`, "");
    else lines.push(inner, "");
  }
  flushList();
  if (fns.length) {
    lines.push("");
    fns.forEach((t, i) => lines.push(`[^${i + 1}]: ${t}`));
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

export function postToMarkdownFile(input: {
  title: string;
  slug: string;
  channel: Channel;
  publishedAt: string;
  excerpt: string;
  canonical: string;
  author?: string;
  tags?: string[];
  body: PTBlock[];
}): string {
  const tags = (input.tags ?? []).map((t) => `  - ${t}`).join("\n");
  const fm = [
    "---",
    `title: ${input.title}`,
    `slug: ${input.slug}`,
    `channel: ${input.channel}`,
    `publishedAt: ${input.publishedAt.slice(0, 10)}`,
    `excerpt: ${input.excerpt}`,
    ...(input.author ? [`author: ${input.author}`] : []),
    ...(tags ? [`tags:`, tags] : []),
    `canonical: ${input.canonical}`,
    "---",
    "",
  ].join("\n");
  return `${fm}\n${portableTextToMarkdown(input.body)}`;
}

export function slugFromPath(file: string): string {
  return slugify(file.replace(/\\/g, "/").split("/").pop()?.replace(/\.md$/i, "") ?? "post");
}
