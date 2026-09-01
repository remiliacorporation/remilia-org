
export type Span = { _type?: "span"; text?: string; marks?: string[] };
export type MarkDef = { _key: string; _type: string; href?: string; text?: string };
export type PTBlock = {
  _type?: string;
  _key?: string;
  style?: string | null;
  listItem?: string | null;
  children?: Span[];
  markDefs?: MarkDef[];
  alt?: string;
  caption?: string;
  asset?: unknown;
  [k: string]: unknown;
};

function keys(): () => string {
  let n = 0;
  return () => `fnk${++n}`;
}

const SUPER_DIGIT: Record<string, string> = {
  "⁰": "0",
  "¹": "1",
  "²": "2",
  "³": "3",
  "⁴": "4",
  "⁵": "5",
  "⁶": "6",
  "⁷": "7",
  "⁸": "8",
  "⁹": "9",
  "₀": "0",
  "₁": "1",
  "₂": "2",
  "₃": "3",
  "₄": "4",
  "₅": "5",
  "₆": "6",
  "₇": "7",
  "₈": "8",
  "₉": "9",
};

function blockText(b: PTBlock): string {
  return (b.children ?? []).map((c) => c.text ?? "").join("");
}

function isEmptySpacer(b: PTBlock): boolean {
  if (b._type !== "block") return false;
  const t = blockText(b).replace(/\u00a0/g, " ").trim();
  if (t.length > 0) return false;
  return !!b.listItem || (b.children ?? []).every((c) => (c.marks ?? []).includes("em"));
}

function isItalicOnlyParagraph(b: PTBlock): boolean {
  if (b._type !== "block" || b.listItem) return false;
  if (b.style === "blockquote" || (b.style && b.style !== "normal")) return false;
  const children = b.children ?? [];
  let total = 0;
  let italic = 0;
  for (const c of children) {
    const t = (c.text ?? "").replace(/\u00a0/g, " ");
    if (!t.trim()) continue;
    total += t.length;
    if ((c.marks ?? []).includes("em")) italic += t.length;
  }
  if (total < 40) return false;

  return italic / total >= 0.35;
}

function toBlockquote(b: PTBlock): PTBlock {
  const children = (b.children ?? []).map((c) => ({
    ...c,
    marks: (c.marks ?? []).filter((m) => m !== "em"),
  }));
  return {
    ...b,
    style: "blockquote",
    listItem: undefined,
    children,
  };
}

export function parseFootnoteDump(text: string): Map<number, string> {
  const map = new Map<number, string>();
  const cleaned = text.replace(/\r/g, "").trim();
  if (!/^\s*\d+\.\s/.test(cleaned)) return map;
  const parts = cleaned.split(/\n(?=\s*\d+\.\s)/);
  for (const part of parts) {
    const m = part.match(/^\s*(\d+)\.\s+([\s\S]+)$/);
    if (!m) continue;
    const n = Number(m[1]);
    const body = m[2].replace(/\s+/g, " ").trim();
    if (n > 0 && body) map.set(n, body);
  }
  return map;
}

function looksLikeFootnoteDump(text: string): boolean {
  const t = text.trim();
  if (!/^\d+\.\s/.test(t)) return false;

  const hits = t.match(/^\d+\.\s/gm) ?? [];
  return hits.length >= 2 || (hits.length === 1 && t.length > 80);
}

export function splitSuperscripts(
  text: string,
): Array<{ text: string } | { fn: number }> {
  const out: Array<{ text: string } | { fn: number }> = [];
  let buf = "";
  let i = 0;
  const flush = () => {
    if (buf) {
      out.push({ text: buf });
      buf = "";
    }
  };
  while (i < text.length) {
    if (SUPER_DIGIT[text[i]] !== undefined) {
      flush();
      let digits = "";
      while (i < text.length && SUPER_DIGIT[text[i]] !== undefined) {
        digits += SUPER_DIGIT[text[i]];
        i += 1;
      }
      const n = Number(digits);
      if (n > 0) out.push({ fn: n });
      continue;
    }
    buf += text[i];
    i += 1;
  }
  flush();
  return out;
}

function applyFootnotesToBlock(b: PTBlock, notes: Map<number, string>, key: () => string): PTBlock {
  if (b._type !== "block") return b;
  const markDefs = [...(b.markDefs ?? [])];
  const children: Span[] = [];
  let changed = false;
  for (const span of b.children ?? []) {
    const parts = splitSuperscripts(span.text ?? "");
    if (parts.length === 1 && "text" in parts[0] && parts[0].text === (span.text ?? "")) {
      children.push(span);
      continue;
    }
    changed = true;
    const baseMarks = (span.marks ?? []).filter((m) => !markDefs.some((d) => d._key === m && d._type === "footnote"));
    for (const part of parts) {
      if ("text" in part) {
        if (!part.text) continue;
        children.push({
          _type: "span",
          text: part.text,
          ...(baseMarks.length ? { marks: [...baseMarks] } : {}),
        });
      } else {
        const k = key();
        markDefs.push({
          _key: k,
          _type: "footnote",
          text: notes.get(part.fn) ?? `Note ${part.fn}`,
        });
        children.push({ _type: "span", text: "", marks: [...baseMarks, k] });
      }
    }
  }
  if (!changed) return b;
  return { ...b, children, markDefs };
}

function improveImage(b: PTBlock, title: string): PTBlock {
  if (b._type !== "image") return b;
  let alt = (b.alt ?? "").trim();
  let caption = (b.caption ?? "").trim();
  if (/^image$/i.test(alt) || alt === title) alt = "";
  if (!caption && alt && alt.length > 8 && alt !== title) caption = alt;
  if (!alt) alt = caption || `Illustration for ${title}`;
  if (alt === title && caption) alt = caption;
  return { ...b, alt, ...(caption ? { caption } : {}) };
}

export function polishBody(blocks: PTBlock[], title: string): PTBlock[] {
  if (!blocks?.length) return blocks;

  const notes = new Map<number, string>();
  let end = blocks.length;
  while (end > 0) {
    const b = blocks[end - 1];
    if (b._type !== "block") break;
    const t = blockText(b);
    if (isEmptySpacer(b)) {
      end -= 1;
      continue;
    }
    if (looksLikeFootnoteDump(t)) {
      for (const [k, v] of parseFootnoteDump(t)) notes.set(k, v);
      end -= 1;
      continue;
    }
    break;
  }

  const key = keys();
  const out: PTBlock[] = [];
  for (let i = 0; i < end; i++) {
    let b = blocks[i];
    if (isEmptySpacer(b)) continue;
    if (b._type === "image") {
      out.push(improveImage(b, title));
      continue;
    }
    if (isItalicOnlyParagraph(b)) b = toBlockquote(b);
    if (notes.size) b = applyFootnotesToBlock(b, notes, key);
    out.push(b);
  }
  return out;
}

