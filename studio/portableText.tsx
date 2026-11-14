import {
  useCallback,
  useContext,
  useEffect,
  useInsertionEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  getPublishedId,
  getVersionFromId,
  set,
  useClient,
  useDocumentOperation,
  useFormValue,
  type BlockAnnotationProps,
  type BlockDecoratorProps,
  type BlockProps,
  type BlockStyleProps,
  type ArrayOfObjectsInputProps,
  type StringInputProps,
} from "sanity";
import { CHANNEL_PATH_LABEL, type Channel } from "../lib/access";
import { numberFootnotes } from "../packages/renderer/src/footnotes";
import { portableTextToHtml, type PTBlock } from "../packages/renderer/src/pt";
import {
  jsonPath,
  MarkLife,
  NoteMemory,
  noteId,
} from "../packages/renderer/src/note-memory";
import { injectNoteCss } from "./noteStyles";
import { SidenotesShown } from "./sidenotes";

const INTERNAL_HOSTS = /^https?:\/\/(?:[\w-]+\.)*remilia\.(?:org|com|net)\b/;

function isExternalHref(href: string): boolean {
  return /^https?:/.test(href) && !INTERNAL_HOSTS.test(href);
}

function postHref(channel: Channel, slug: string): string {
  const hostPath = CHANNEL_PATH_LABEL[channel];
  const slash = hostPath.indexOf("/");
  const path = slash >= 0 ? hostPath.slice(slash) : `/${hostPath}`;
  return `${path}/${slug}`;
}

// Must not use <p>/<h2>/blockquote — those break the contenteditable tree
// and the editor renders empty.
export function H2Style(props: BlockStyleProps): ReactNode {
  return <div className="blog-pt-h2">{props.children}</div>;
}

export function H3Style(props: BlockStyleProps): ReactNode {
  return <div className="blog-pt-h3">{props.children}</div>;
}

export function H4Style(props: BlockStyleProps): ReactNode {
  return <div className="blog-pt-h4">{props.children}</div>;
}

export function QuoteStyle(props: BlockStyleProps): ReactNode {
  return <div className="blog-pt-quote">{props.children}</div>;
}

export function CodeDecorator(props: BlockDecoratorProps): ReactNode {
  return <code className="blog-pt-code">{props.children}</code>;
}

type PostHit = {
  _id: string;
  title: string;
  slug: string;
  channel: Channel;
};

export function LinkHrefInput(props: StringInputProps): ReactNode {
  const client = useClient({ apiVersion: "2026-02-01" });
  const href = typeof props.value === "string" ? props.value : "";
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<PostHit[]>([]);
  const [preview, setPreview] = useState("");

  useEffect(() => {
    const t = window.setTimeout(() => {
      const needle = q.trim();
      if (needle.length < 2) {
        setHits([]);
        return;
      }
      void client
        .fetch<PostHit[]>(
          `*[_type == "post" && (title match $q || slug.current match $q)] | order(publishedAt desc) [0...8]{
            _id, title, "slug": slug.current, channel
          }`,
          { q: `${needle}*` },
        )
        .then((rows) => setHits(rows ?? []))
        .catch(() => setHits([]));
    }, 200);
    return () => window.clearTimeout(t);
  }, [q, client]);

  useEffect(() => {
    let alive = true;
    if (!href) {
      setPreview("");
      return;
    }
    const slug = href.split("/").filter(Boolean).pop() ?? "";
    if (!slug || /[^a-z0-9-]/.test(slug)) {
      setPreview(href);
      return;
    }
    void client
      .fetch<{ title: string; channel: Channel } | null>(
        `*[_type == "post" && slug.current == $slug][0]{title, channel}`,
        { slug },
      )
      .then((post) => {
        if (!alive) return;
        setPreview(post ? `${post.title}` : href);
      })
      .catch(() => {
        if (alive) setPreview(href);
      });
    return () => {
      alive = false;
    };
  }, [href, client]);

  const external = isExternalHref(href);

  return (
    <div className="blog-link-edit">
      {props.renderDefault(props)}
      {href ? (
        <p className="blog-link-preview">
          <span>{external ? "External" : "Internal"}</span>
          {preview}
        </p>
      ) : null}
      <input
        className="blog-link-search"
        type="search"
        value={q}
        placeholder="Search posts…"
        onChange={(e) => setQ(e.target.value)}
      />
      {hits.length > 0 ? (
        <ul className="blog-link-hits">
          {hits.map((hit) => (
            <li key={hit._id}>
              <button
                type="button"
                onClick={() =>
                  props.onChange(set(postHref(hit.channel, hit.slug)))
                }
              >
                {hit.title}
                <span>
                  {postHref(hit.channel, hit.slug)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

// Sanity shows its own edit box for an annotation; rendering the form here
// as well put a second, empty copy of it in the text.
export function LinkAnnotation(props: BlockAnnotationProps): ReactNode {
  const href =
    props.value && typeof props.value.href === "string" ? props.value.href : "";
  const external = isExternalHref(href);
  return (
    <span
      className={external ? "blog-pt-outlink" : "blog-pt-link"}
      title={href || "Link"}
      onClick={() => props.onOpen()}
    >
      {props.textElement}
    </span>
  );
}

/** A paragraph inside a note, in the site's own class (blog/notes.css). */
export function NoteTextStyle(props: BlockStyleProps): ReactNode {
  return <div className="fn-par">{props.children}</div>;
}

/** A block quote inside a note, in the site's own class (blog/notes.css). */
export function NoteQuoteStyle(props: BlockStyleProps): ReactNode {
  return <div className="fn-q">{props.children}</div>;
}

/** The box a note is written in, in the site's note styles. */
export function NoteContentInput(props: ArrayOfObjectsInputProps): ReactNode {
  useInsertionEffect(injectNoteCss, []);
  return <div className="blog-note-edit">{props.renderDefault(props)}</div>;
}

const keysOf = (path: readonly unknown[]): string[] =>
  path.flatMap((seg) =>
    seg && typeof seg === "object" && "_key" in seg ? [String(seg._key)] : [],
  );

/** A note's site markup: inside its box, and the boxes nested in it. */
interface NotePreview {
  html: string;
  subs: string;
}

const previews = new WeakMap<object, Map<string, NotePreview>>();

/** Each note's site markup, by block key and note key, for one body value. */
function notePreviews(body: unknown): Map<string, NotePreview> {
  if (!Array.isArray(body)) return new Map();
  const hit = previews.get(body);
  if (hit) return hit;
  const out = new Map<string, NotePreview>();
  try {
    portableTextToHtml(body as PTBlock[], {
      imageUrl: () => undefined,
      onNote: (block, note, html, subs) =>
        out.set(`${block}/${note}`, { html, subs }),
    });
  } catch {
    // A half-made block: the number still shows, the preview waits.
  }
  previews.set(body, out);
  return out;
}

/**
 * Each note's words while its mark is out of its parent's editor, by the
 * editor's element (packages/renderer/src/note-memory.ts).
 */
const memory = new NoteMemory<Element>((editor) => editor.isConnected);

/**
 * A note back in its parent's editor that left with words: once the
 * document holds the empty copy the editor put back, the kept words are
 * written to the document (not through the editor, so the editor's undo
 * does not take them out again). Mounted only for such a note, so a mark
 * does not watch the document's operations for nothing.
 */
function NoteReturn(props: {
  id: string;
  editor: Element;
  path: BlockProps["path"];
  inDocument: unknown;
  inEditor: unknown;
  onDone: () => void;
}): null {
  const docId = useFormValue(["_id"]);
  const docType = useFormValue(["_type"]);
  const full = typeof docId === "string" ? docId : "";
  // The version being edited: a release's, or the draft.
  const { patch } = useDocumentOperation(
    getPublishedId(full),
    typeof docType === "string" ? docType : "post",
    getVersionFromId(full),
  );
  const sent = useRef<unknown>(null);
  const { id, editor, path, inDocument, inEditor, onDone } = props;
  useEffect(() => {
    const step = memory.step(id, editor, inDocument, inEditor);
    if (step.kind === "none") onDone();
    if (step.kind !== "write" || sent.current === inDocument) return;
    sent.current = inDocument;
    patch.execute([{ set: { [`${jsonPath(path)}.content`]: step.words } }]);
  }, [id, editor, path, inDocument, inEditor, onDone, patch]);
  return null;
}

/**
 * The note being written in its margin box, by its path; one at a time. It
 * lives outside the notes' components, so a note stays open while the rest
 * of the post is edited, even if Sanity mounts its mark again.
 */
let writing: string | null = null;
/** True from a click that opens a note until its box takes the caret. */
let caretPending = false;
const writers = new Set<() => void>();

function setWriting(id: string | null, caret = false): void {
  if (writing === id) return;
  caretPending = caret && id !== null;
  writing = id;
  for (const f of writers) f();
}

function useWriting(): string | null {
  return useSyncExternalStore(
    (f) => {
      writers.add(f);
      return () => writers.delete(f);
    },
    () => writing,
  );
}

/**
 * The note's box in the margin while the note is written there. It holds
 * Sanity's own form for the note, so its edits are the form's patches, as
 * in the dialog. It stays open while the rest of the post is edited;
 * Escape in the note, or opening another note, closes it, and the box then
 * shows the note as the site draws it again.
 */
function NoteInPlace(props: {
  n: number | undefined;
  onClose: () => void;
  children: ReactNode;
}): ReactNode {
  const [box, setBox] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!box || !caretPending) return;
    caretPending = false;
    // The caret goes into the note at once, as the dialog put it there. The
    // note's editor mounts a frame or two after its box.
    let tries = 0;
    let frame = requestAnimationFrame(function focus() {
      const text = box.querySelector<HTMLElement>('[contenteditable="true"]');
      if (text) text.focus();
      else if (++tries < 30) frame = requestAnimationFrame(focus);
    });
    return () => cancelAnimationFrame(frame);
  }, [box]);
  return (
    <span
      ref={setBox}
      className="fn-note fn-edit"
      role="group"
      aria-label={`Note ${props.n ?? ""}`.trim()}
      contentEditable={false}
      onKeyDown={(e) => {
        // A dialog the note's editor opens is a React child of this box, so
        // its keys arrive here too; Escape there closes only that dialog.
        if (!e.currentTarget.contains(e.target as Node)) return;
        if (e.key === "Escape" && !e.defaultPrevented) {
          e.stopPropagation();
          props.onClose();
        }
      }}
    >
      <strong>{props.n ?? "*"}:</strong>
      {/* sn-text: the layout script measures the note's text here. */}
      <span className="fn-edit-form sn-text">{props.children}</span>
    </span>
  );
}

/**
 * A footnote in the text: the site's own reference mark, numbered by its
 * place in the text (the renderer's `numberFootnotes`, so the editor and the
 * site agree), and the note as the site draws it. In the page frame with
 * both rails showing, every note stands in the margin, as on the site
 * (studio/sidenotes.ts): a click on the mark opens the note there in full,
 * and a click on the note opens it for writing in its own box
 * (NoteInPlace). In a narrower frame the selected note opens under its
 * mark, and a click on the mark or the note opens Sanity's dialog.
 */
export function FootnoteInline(props: BlockProps): ReactNode {
  useInsertionEffect(injectNoteCss, []);
  const margin = useContext(SidenotesShown);
  const root = useFormValue(props.path.slice(0, 1));
  const keys = keysOf(props.path);
  const id = keys.join("/");
  const me = JSON.stringify(props.path);
  // A note that comes back into its parent's editor with no words, as undo
  // then redo brings it back, gets back the words the document held when
  // its mark left (note-memory.ts). Not in a view that cannot be edited,
  // such as an older revision.
  const formId = useFormValue(["_id"]);
  const memoryId = props.readOnly ? undefined : noteId(formId, props.path);
  const inDocument = useFormValue(props.path);
  const markRef = useRef<HTMLSpanElement>(null);
  const [back, setBack] = useState<Element | null>(null);
  const inDocumentNow = useRef(inDocument);
  inDocumentNow.current = inDocument;
  const life = useRef<MarkLife<Element> | null>(null);
  life.current ??= new MarkLife(memory);
  useEffect(() => {
    // The editor the mark stands in: its nearest editable ancestor.
    const editor =
      markRef.current?.parentElement?.closest('[contenteditable="true"]') ??
      undefined;
    // A new id (a draft made, the document published) or a read-only view
    // forgets what was kept and keeps nothing; only the mark leaving its
    // editor keeps words (below). A mark mounted again at once (the editor
    // re-syncing a block) finds its words kept and forgets them, as the
    // note still has them.
    const kept = life.current?.set(memoryId, editor);
    setBack(kept && editor ? editor : null);
  }, [memoryId]);
  useEffect(() => () => life.current?.unmount(inDocumentNow.current), []);
  const done = useCallback(() => setBack(null), []);
  const n = useMemo(
    () => numberFootnotes(root).find((x) => x.keys.join("/") === id)?.n,
    [root, id],
  );
  // A note in the text itself, written while its box stands in the margin,
  // is written in that box: Sanity's own form for the note (props.children,
  // the input its dialog would hold) renders there instead of the dialog.
  // Sanity closes an item when the caret leaves it; the box stays open
  // until Escape or another note opens (`writing`).
  const writingNow = useWriting();
  const top = margin && keys.length === 2;
  const inPlace = top && (writingNow === me || props.open);
  // A note Sanity opens itself (a new note from the toolbar) is written in
  // place too, and stays open like one opened by a click.
  useEffect(() => {
    if (top && props.open) setWriting(me, true);
  }, [top, props.open, me]);
  const picked = (props.selected || props.focused) && !props.open;
  // Only a note in the text itself has a box on the site; a note inside a
  // note shows as its number here, and as its own box under its parent's
  // in the margin.
  const note =
    keys.length === 2 && (margin || picked)
      ? notePreviews(root).get(id)
      : undefined;
  // The site's own class (fn) sits one element in: the note styles are
  // scoped to this mark, and a scoped rule reaches only below its root.
  // In the margin, the note being written stays open in full (fn-pin, read
  // by the layout script).
  const state = [
    "fn",
    note && !margin ? "fn-pop" : "",
    inPlace ? "fn-pin" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <span
      ref={markRef}
      className="blog-pt-note"
      onClick={(e) => {
        // The note's dialog is a React child of this mark, so a click in the
        // dialog arrives here too; only a click on the mark itself opens.
        if (!e.currentTarget.contains(e.target as Node)) return;
        const t = e.target as Element;
        // A click in the note being written is the writer's own. A note
        // nested in that note stands in its box, and a click on its mark
        // opens it.
        const box = t.closest?.(".fn-edit");
        if (box && !box.contains(e.currentTarget)) return;
        // A link in the note's markup must not leave the Studio.
        if (t.closest?.("a")) e.preventDefault();
        if (note && margin) {
          // In the margin, a click on the mark opens its note in full there
          // (the layout script's own click); a click on the note opens it
          // for writing.
          if (!t.closest?.(".fn-ref")) setWriting(me, true);
          return;
        }
        // After the click has moved the editor's focus: inside a note's
        // dialog, opening at once is undone by that focus change.
        window.setTimeout(() => props.onOpen(), 0);
      }}
    >
      {back && memoryId ? (
        <NoteReturn
          id={memoryId}
          editor={back}
          path={props.path}
          inDocument={inDocument}
          inEditor={props.value}
          onDone={done}
        />
      ) : null}
      <span className={state}>
        {props.renderDefault({
          ...props,
          // Written in place, the note needs no dialog.
          open: inPlace ? false : props.open,
          renderPreview: () => (
            <span className="fn-ref">
              <sup>{n ?? "*"}</sup>
            </span>
          ),
        })}
        {inPlace ? (
          <NoteInPlace
            n={n}
            onClose={() => {
              setWriting(null);
              props.onClose();
            }}
          >
            {props.children}
          </NoteInPlace>
        ) : note ? (
          <span
            className="fn-note"
            role="note"
            contentEditable={false}
            dangerouslySetInnerHTML={{ __html: note.html }}
          />
        ) : null}
        {note?.subs && margin && !inPlace ? (
          <span
            className="blog-pt-subs"
            contentEditable={false}
            dangerouslySetInnerHTML={{ __html: note.subs }}
          />
        ) : null}
      </span>
    </span>
  );
}

export function ImageBlock(props: BlockProps): ReactNode {
  const value = props.value as { caption?: string; alt?: string } | undefined;
  const caption =
    typeof value?.caption === "string" && value.caption.trim()
      ? value.caption
      : typeof value?.alt === "string" && value.alt.trim()
        ? value.alt
        : "";
  return (
    <div className="blog-pt-figure">
      {props.renderDefault(props)}
      {caption ? <div className="blog-pt-caption">{caption}</div> : null}
    </div>
  );
}

export function VideoBlock(props: BlockProps): ReactNode {
  return <div className="blog-pt-video">{props.renderDefault(props)}</div>;
}

export function DividerBlock(props: BlockProps): ReactNode {
  return <div className="blog-pt-divider">{props.renderDefault(props)}</div>;
}
