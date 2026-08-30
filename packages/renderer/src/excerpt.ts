/**
 * Sentence-aware excerpt truncation for meta / RSS / cards.
 * Prefer ending on `.!?` within the budget — never mid-word / mid-sentence.
 */
export function smartExcerpt(raw: string, max = 300): string {
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (text.length <= max) {
    // Repair sources that were already hard-truncated mid-sentence (~at max).
    const looksTruncated = text.length >= Math.min(max - 20, 200) && /[a-z0-9]$/i.test(text) && !/[.!?]"?$/.test(text);
    if (looksTruncated) {
      const ends: number[] = [];
      for (let i = 0; i < text.length; i++) {
        if (/[.!?]/.test(text[i]) && (i + 1 >= text.length || /\s/.test(text[i + 1]))) {
          ends.push(i + 1);
        }
      }
      if (ends.length) return text.slice(0, ends[ends.length - 1]).trim();
      const sp = text.lastIndexOf(" ");
      if (sp > 40) return text.slice(0, sp).trim();
    }
    return text;
  }

  const window = text.slice(0, max);
  const minKeep = Math.min(60, Math.floor(max * 0.35));
  const sentenceEnds: number[] = [];
  for (let i = 0; i < window.length; i++) {
    const ch = window[i];
    if (!/[.!?]/.test(ch)) continue;
    const next = window[i + 1];
    if (next !== undefined && !/\s/.test(next) && !/["'”)\]]/.test(next)) continue;
    sentenceEnds.push(i + 1);
  }
  const good = sentenceEnds.filter((i) => i >= minKeep && i <= max);
  if (good.length) {
    return text.slice(0, good[good.length - 1]).trim();
  }

  const slice = text.slice(0, max);
  const sp = slice.lastIndexOf(" ");
  if (sp >= minKeep) return slice.slice(0, sp).trim();
  return slice.trim();
}

/** First N plain-text characters from Portable Text blocks (for excerpt fallback). */
export function plainFromBlocks(
  blocks: Array<{
    _type?: string;
    children?: Array<{ text?: string }>;
    style?: string;
  }>,
  maxScan = 800,
): string {
  const parts: string[] = [];
  let n = 0;
  for (const b of blocks) {
    if (b._type !== "block" || b.style === "blockquote") continue;
    const t = (b.children ?? []).map((c) => c.text ?? "").join("").trim();
    if (!t) continue;
    parts.push(t);
    n += t.length;
    if (n >= maxScan) break;
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}
