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

export const NOTES_CSS = scopeBlogCss(`${notesCss}\n${sidenotesCss}`, {
  root: `:is(${NOTE_ROOTS})`,
  // Sanity's own controls inside the note's dialog keep their look.
  limit: "[data-ui='Button'], [data-ui='TextInput'], [data-ui='Menu']",
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
