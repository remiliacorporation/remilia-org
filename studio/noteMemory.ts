/**
 * A note's words, kept while its mark is out of the editor.
 *
 * A note's text is written in its own editor (its dialog, or its box in the
 * margin), apart from the editor its mark stands in. That editor's undo
 * history holds the note as it was inserted, before it had any words. Undo
 * takes the note out, and redo puts that empty copy back: the words written
 * in the note's own editor were lost (AI 2084's third-level notes, 2026-11-13).
 *
 * So when a note's mark leaves the editor, its words are kept here by the
 * note's key. A note that comes back with no words gets them back. A note
 * that comes back with words of its own keeps them, and a note emptied by
 * its author while its mark is in the editor has nothing kept.
 */
export class NoteMemory {
  private readonly kept = new Map<string, unknown[]>();

  /** The note's mark left the editor: keep what the note said then. */
  leave(key: string, content: unknown): void {
    if (hasWords(content)) this.kept.set(key, content);
    else this.kept.delete(key);
  }

  /**
   * The note's mark is in the editor again. Returns the words to write
   * back when the note came back with none.
   */
  back(key: string, content: unknown): unknown[] | undefined {
    const kept = this.kept.get(key);
    this.kept.delete(key);
    return kept && !hasWords(content) ? kept : undefined;
  }
}

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null;

/**
 * True when a note's content says something: a span with text, a note of
 * its own, or anything that is not a text block. A note with only empty
 * paragraphs says nothing.
 */
export function hasWords(content: unknown): content is unknown[] {
  if (!Array.isArray(content)) return false;
  return content.some((b) => {
    if (!isRec(b)) return false;
    if (b._type !== "block") return true;
    const children = Array.isArray(b.children) ? b.children : [];
    return children.some(
      (c) =>
        isRec(c) &&
        (c._type !== "span" ||
          (typeof c.text === "string" && c.text.trim() !== "")),
    );
  });
}
