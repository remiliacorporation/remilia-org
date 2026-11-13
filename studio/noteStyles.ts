// The site's footnote styles (hosts/core/blog/notes.css) and its margin
// placement (hosts/core/blog/sidenotes.css), read from the files
// themselves, for the footnote in the editor: the reference mark, the note
// box, its paragraphs, its quote lines, and its place and line in the
// margin. The editor adds only what the page's sheet cannot reach inside it
// (studio/editor.css).
import { scopeBlogCss } from "../packages/renderer/src/embed";
import notesCss from "../hosts/core/blog/notes.css?raw";
import sidenotesCss from "../hosts/core/blog/sidenotes.css?raw";

/** A note in the text, and the box a note is written in. */
export const NOTE_ROOTS = ".blog-pt-note, .blog-note-edit";

/**
 * The frame width the editor stands notes in the margin from. The site
 * needs both rails beside the column (1100px). Below that the editor gives
 * up the left rail (studio/editor.css), so a document pane beside the
 * Studio's lists still has a rail's width for the notes: a gap, the
 * column, a gap, the rail, and a gap, with room to spare.
 */
export const MARGIN_FROM = "884px";

const SITE_FROM = "(min-width: 1100px)";
if (!sidenotesCss.includes(SITE_FROM))
  throw new Error("blog/sidenotes.css no longer starts at 1100px");

const marginCss = sidenotesCss.replaceAll(
  SITE_FROM,
  `(min-width: ${MARGIN_FROM})`,
);

export const NOTES_CSS = scopeBlogCss(`${notesCss}\n${marginCss}`, {
  root: `:is(${NOTE_ROOTS})`,
  // Sanity's own controls inside the note's dialog keep their look, and so
  // does the form of a note written in its box (NoteInPlace): the box's
  // own rules, such as the inverted look of a note pointed at, stop at it.
  // The note's text inside that form is a root of its own (.blog-note-edit).
  limit:
    "[data-ui='Button'], [data-ui='TextInput'], [data-ui='Menu'], .fn-edit-form",
  container: "blog-page",
});

let injected = false;

export function injectNoteCss(): void {
  if (injected) return;
  injected = true;
  const style = document.createElement("style");
  style.dataset.remilia = "blog-notes";
  style.textContent = NOTES_CSS;
  document.head.append(style);
}
