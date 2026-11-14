/**
 * A note's words, kept while its mark is out of its parent's editor.
 *
 * A note's text is written in its own editor (its dialog, or its box in the
 * margin), apart from the editor its mark stands in (its parent's). That
 * editor's undo history holds the note as it was inserted, before it had any
 * words. Undo takes the note out, and redo puts that empty copy back: the
 * words written in the note's own editor were lost (AI 2084's notes,
 * 2026-11-13).
 *
 * The parent editor sends its changes to the document in batches, up to a
 * second apart. So when a note comes back, the document may still hold the
 * note with its words (undo and redo inside one batch), not hold it at all
 * yet (redo not yet sent), or hold the empty copy (redo sent). Its words are
 * written back only once the document holds the empty copy, so they land
 * after the editor's own insert and nothing the editor sends later can undo
 * them. They are forgotten once both the document and the editor hold words.
 *
 * Words are kept only for a note whose mark left an editor that is still
 * open, while the document still held the note with words: an editor that
 * closes, or a note a collaborator emptied or removed, keeps nothing.
 * Entries are by document id and the note's path, so another document, or a
 * copy of this one, never receives them, and each belongs to the one editor
 * the mark left.
 */
export class NoteMemory<E> {
  private readonly kept = new Map<string, { words: unknown[]; editor: E }>();

  /**
   * @param open - whether an editor is still open (an entry for a closed
   * editor is dropped).
   * @param cap - the most entries kept; the oldest go first.
   */
  constructor(
    private readonly open: (editor: E) => boolean = () => true,
    private readonly cap = 64,
  ) {}

  /**
   * The note's mark left `editor`. `inDocument` is the note as the document
   * held it then; its words are kept if it had any.
   */
  leave(id: string, editor: E, inDocument: unknown): void {
    for (const [k, v] of this.kept) if (!this.open(v.editor)) this.kept.delete(k);
    const words = contentOf(inDocument);
    if (!hasWords(words)) return;
    this.kept.delete(id);
    this.kept.set(id, { words, editor });
    while (this.kept.size > this.cap) {
      const oldest = this.kept.keys().next().value;
      if (oldest === undefined) break;
      this.kept.delete(oldest);
    }
  }

  /** True when words are kept for this note, from this editor. */
  has(id: string, editor: E): boolean {
    return this.kept.get(id)?.editor === editor;
  }

  /**
   * What a note whose mark is back in `editor` needs, given the note as the
   * document holds it and as the editor holds it.
   */
  step(id: string, editor: E, inDocument: unknown, inEditor: unknown): Step {
    const kept = this.kept.get(id);
    if (!kept || kept.editor !== editor) return { kind: "none" };
    // The document does not hold the note yet: the editor has not sent it.
    if (!inDocument || typeof inDocument !== "object") return { kind: "wait" };
    if (!hasWords(contentOf(inDocument))) return { kind: "write", words: kept.words };
    // The document holds words the editor has not taken in yet: either the
    // undo and redo have not been sent, or the words just written back have
    // not reached the editor.
    if (!hasWords(contentOf(inEditor))) return { kind: "wait" };
    this.kept.delete(id);
    return { kind: "none" };
  }

  /** Forgets the note's words. */
  forget(id: string): void {
    this.kept.delete(id);
  }
}

export type Step =
  | { kind: "none" }
  | { kind: "wait" }
  | { kind: "write"; words: unknown[] };

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null;

const contentOf = (note: unknown): unknown =>
  isRec(note) ? note.content : undefined;

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

const keyOf = (seg: unknown): string | undefined =>
  isRec(seg) && "_key" in seg ? String(seg._key) : undefined;

/**
 * A note's memory id: its document's id and the keys on its path. None for a
 * path with fewer than two keys, as a note's path has before the form holds
 * it.
 */
export function noteId(docId: unknown, path: readonly unknown[]): string | undefined {
  const keys = path.map(keyOf).filter((k): k is string => k !== undefined);
  if (typeof docId !== "string" || !docId || keys.length < 2) return undefined;
  return `${docId}|${keys.join("/")}`;
}

/** A form path as a patch path: `body[_key=="a"].children[_key=="b"]`. */
export function jsonPath(path: readonly unknown[]): string {
  return path
    .map((seg, i) => {
      const key = keyOf(seg);
      if (key !== undefined) return `[_key==${JSON.stringify(key)}]`;
      if (typeof seg === "number") return `[${seg}]`;
      return `${i ? "." : ""}${String(seg)}`;
    })
    .join("");
}
