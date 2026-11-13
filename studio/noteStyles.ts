// The site's footnote styles (hosts/core/blog/notes.css), read from the one
// file the bake ships, for the footnote in the editor: the reference mark,
// the note box, its paragraphs, and its quote lines. The editor adds only
// where the box sits (studio/editor.css).
import { scopeBlogCss } from "../packages/renderer/src/embed";
import notesCss from "../hosts/core/blog/notes.css?raw";

/** A note in the text, and the box a note is written in. */
export const NOTE_ROOTS = ".blog-pt-note, .blog-note-edit";

export const NOTES_CSS = scopeBlogCss(notesCss, {
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
