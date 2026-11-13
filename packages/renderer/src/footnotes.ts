/**
 * The two shapes a footnote has in a post body, and the moves between them.
 *
 * Stored shape (what the Studio writes): an inline object among a block's
 * children, `{ _type: "footnote", content | text, n?, image? }`. The editor
 * treats it as one atom, so typing next to it cannot remove it.
 *
 * Old shape (every note imported before 2026-11-13): a `footnote` mark
 * definition on a span with no text. The Portable Text editor drops empty
 * spans when it tidies a block, and the unused definition with them, so one
 * keystroke in the paragraph deleted the note. `liftFootnotes` moves old
 * notes to the stored shape; the migration script writes that.
 *
 * The renderer still reads the old shape. `lowerFootnotes` turns stored
 * notes back into it at the door, so one code path renders both and a
 * migrated post bakes to the same bytes.
 */

type Rec = Record<string, unknown>;

const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null;
const isTextBlock = (b: unknown): b is Rec & { children: unknown[] } =>
  isRec(b) && b._type === "block" && Array.isArray(b.children);
const isNote = (c: unknown): c is Rec => isRec(c) && c._type === "footnote";
const defsOf = (b: Rec): Rec[] =>
  Array.isArray(b.markDefs) ? b.markDefs.filter(isRec) : [];
const marksOf = (c: Rec): string[] =>
  Array.isArray(c.marks) ? c.marks.map(String) : [];

/** The fields a note carries in either shape, without its key and type. */
function noteFields(note: Rec, content: (blocks: unknown[]) => unknown[]): Rec {
  const { _key: _k, _type: _t, content: inner, ...rest } = note;
  return Array.isArray(inner) && inner.length
    ? { ...rest, content: content(inner) }
    : rest;
}

/** True when a body (or a note inside it) still holds an old-shape note. */
export function hasOldFootnotes(blocks: unknown): boolean {
  if (!Array.isArray(blocks)) return false;
  return blocks.some((b) => {
    if (!isTextBlock(b)) return false;
    if (defsOf(b).some((d) => d._type === "footnote")) return true;
    return b.children.some((c) => isNote(c) && hasOldFootnotes(c.content));
  });
}

/**
 * Old shape to stored shape. A marked span with no text becomes the note; a
 * marked span with text keeps its text, and the note follows it. A note
 * definition no span uses is dropped (it never rendered).
 */
export function liftFootnotes<T>(blocks: T[]): T[] {
  return blocks.map((b) => {
    if (!isTextBlock(b)) return b;
    const defs = defsOf(b);
    const notes = new Map(
      defs.filter((d) => d._type === "footnote").map((d) => [String(d._key), d]),
    );
    const children = b.children.flatMap((c): unknown[] => {
      if (isNote(c)) {
        return [
          { _type: "footnote", _key: c._key, ...noteFields(c, liftFootnotes) },
        ];
      }
      if (!isRec(c)) return [c];
      const marks = marksOf(c);
      const mine = marks.filter((m) => notes.has(m));
      if (!mine.length) return [c];
      const lifted = mine.map((m, i) => ({
        _type: "footnote",
        _key: i === 0 ? String(c._key ?? m) : `${String(c._key ?? m)}${i}`,
        ...noteFields(notes.get(m) as Rec, liftFootnotes),
      }));
      if (c.text === "" || c.text === undefined) return lifted;
      return [
        {
          ...c,
          _key: `${String(c._key ?? mine[0])}t`,
          marks: marks.filter((m) => !notes.has(m)),
        },
        ...lifted,
      ];
    });
    if (!notes.size && children.every((c, i) => c === b.children[i])) return b;
    const out: Rec = { ...b, children: padNotes(children) };
    if (Array.isArray(b.markDefs))
      out.markDefs = defs.filter((d) => d._type !== "footnote");
    return out as T;
  });
}

/**
 * The editor keeps a text span on each side of an inline object. Adding the
 * empty ones here means the first keystroke in a migrated post changes only
 * what was typed.
 */
function padNotes(children: unknown[]): unknown[] {
  const out: unknown[] = [];
  const isSpan = (c: unknown): boolean => isRec(c) && c._type === "span";
  const pad = (near: unknown, side: string): Rec => ({
    _type: "span",
    _key: `${String((near as Rec)._key)}${side}`,
    text: "",
    marks: [],
  });
  children.forEach((c, i) => {
    if (isNote(c) && !isSpan(out[out.length - 1])) out.push(pad(c, "a"));
    out.push(c);
    if (isNote(c) && i === children.length - 1) out.push(pad(c, "z"));
  });
  return out;
}

/**
 * Stored shape to old shape, for the renderer: each inline note becomes an
 * empty span marked with a `footnote` definition that carries the note.
 */
export function lowerFootnotes<T>(blocks: T[]): T[] {
  return blocks.map((b) => {
    if (!isTextBlock(b)) return b;
    const defs = defsOf(b);
    // An old-shape note inside this block may hold stored notes of its own.
    let changed = false;
    const lowered = defs.map((d) => {
      if (d._type !== "footnote" || !Array.isArray(d.content)) return d;
      const inner = lowerFootnotes(d.content);
      if (inner.every((x, i) => x === (d.content as unknown[])[i])) return d;
      changed = true;
      return { ...d, content: inner };
    });
    if (!b.children.some(isNote)) {
      return changed ? ({ ...b, markDefs: lowered } as T) : b;
    }
    const taken = new Set(lowered.map((d) => String(d._key)));
    const added: Rec[] = [];
    const children = b.children.map((c, i) => {
      if (!isNote(c)) return c;
      let key = String(c._key ?? `fn${i}`);
      while (taken.has(key)) key = `${key}_`;
      taken.add(key);
      added.push({ _key: key, _type: "footnote", ...noteFields(c, lowerFootnotes) });
      return { _type: "span", _key: c._key ?? key, text: "", marks: [key] };
    });
    return { ...b, children, markDefs: [...lowered, ...added] } as T;
  });
}

/** One note's place in a body and the number it shows. */
export interface NoteNumber {
  /**
   * Keys from the body down to the note: block, child, then (for a note
   * inside a note) block, child again, and so on.
   */
  keys: string[];
  n: number;
}

/**
 * The number every note shows, in reading order: a note, then the notes
 * inside it, then the next note in the text. This is the order the renderer
 * numbers in, so the editor and the site agree. A stored `n` (old posts
 * only) still wins over the count, as it does on the site.
 */
export function numberFootnotes(blocks: unknown): NoteNumber[] {
  const out: NoteNumber[] = [];
  let count = 0;
  const walk = (list: unknown, at: string[]): void => {
    if (!Array.isArray(list)) return;
    for (const b of list) {
      if (!isTextBlock(b)) continue;
      const here = [...at, String(b._key)];
      const defs = defsOf(b);
      for (const c of b.children) {
        if (!isRec(c)) continue;
        if (c._type === "footnote") {
          count += 1;
          const keys = [...here, String(c._key)];
          out.push({ keys, n: typeof c.n === "number" ? c.n : count });
          walk(c.content, keys);
          continue;
        }
        for (const m of marksOf(c)) {
          const d = defs.find((x) => x._key === m && x._type === "footnote");
          if (!d) continue;
          count += 1;
          const keys = [...here, String(c._key)];
          out.push({ keys, n: typeof d.n === "number" ? d.n : count });
          walk(d.content, keys);
        }
      }
    }
  };
  walk(blocks, []);
  return out;
}

function withoutNumbers<T>(blocks: T[]): T[] {
  return blocks.map((b) => {
    if (!isTextBlock(b)) return b;
    const children = b.children.map((c) => {
      if (!isNote(c)) return c;
      const { n: _n, ...rest } = c;
      return Array.isArray(rest.content)
        ? { ...rest, content: withoutNumbers(rest.content) }
        : rest;
    });
    return { ...b, children } as T;
  });
}

/** What `migrateFootnotes` did to one body. */
export interface NoteMigration<T> {
  blocks: T[];
  /** Notes in the body, in reading order. */
  notes: number;
  /** Old-shape notes moved to the stored shape. */
  moved: number;
  /** Stored numbers removed (the site shows the same numbers without them). */
  unpinned: number;
  /**
   * The stored numbers, when they differ from the reading order (a number
   * used twice, a first note numbered 2). They are kept, because removing
   * them changes the numbers the site shows, unless `renumber` is set.
   */
  pinned?: number[];
}

/**
 * The footnote migration for one body: old-shape notes move to the stored
 * shape, and stored numbers are removed where the count gives the same
 * numbers. The baked page is the same before and after, unless `renumber`
 * removes numbers that differ from the reading order.
 */
export function migrateFootnotes<T>(
  body: T[],
  opts: { renumber?: boolean } = {},
): NoteMigration<T> {
  const moved = numberFootnotes(body).length - numberFootnotes(liftOnly(body)).length;
  const lifted = liftFootnotes(body);
  const numbers = numberFootnotes(lifted);
  const stored = countStored(lifted);
  const inOrder = numbers.every((x, i) => x.n === i + 1);
  if (inOrder || opts.renumber) {
    return {
      blocks: stored ? withoutNumbers(lifted) : lifted,
      notes: numbers.length,
      moved,
      unpinned: stored,
      ...(inOrder ? {} : { pinned: numbers.map((x) => x.n) }),
    };
  }
  return {
    blocks: lifted,
    notes: numbers.length,
    moved,
    unpinned: 0,
    pinned: numbers.map((x) => x.n),
  };
}

/** The body with its old-shape notes taken out, to count them. */
function liftOnly<T>(body: T[]): T[] {
  return body.map((b) => {
    if (!isTextBlock(b)) return b;
    return {
      ...b,
      markDefs: defsOf(b).filter((d) => d._type !== "footnote"),
      children: b.children.map((c) =>
        isNote(c) && Array.isArray(c.content)
          ? { ...c, content: liftOnly(c.content) }
          : c,
      ),
    } as T;
  });
}

function countStored(blocks: unknown[]): number {
  let n = 0;
  for (const b of blocks) {
    if (!isTextBlock(b)) continue;
    for (const c of b.children) {
      if (!isNote(c)) continue;
      if (typeof c.n === "number") n += 1;
      if (Array.isArray(c.content)) n += countStored(c.content);
    }
  }
  return n;
}
