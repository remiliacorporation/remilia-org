// Sidenotes in the page editor: the site's own layout script, run on the
// page frame. With both rails showing, every note stands in the margin as it
// does on the site (hosts/core/blog/sidenotes.css places it; this script stacks
// the notes and routes their lines).
import { createContext } from "react";
import { SIDENOTES_JS } from "../packages/renderer/src/nav";

/** True while the page frame is wide enough for notes in the margin. */
export const SidenotesShown = createContext(false);

type Stacker = (root: Element, wide: () => boolean) => () => void;

let make: Stacker | undefined;

/**
 * The site's `sidenotes(root, wide)`, built from the source nav.js ships, so
 * the editor and the site place notes with one piece of code. It is page
 * script, not a module, hence `Function`.
 */
export function sidenoteStacker(root: Element, wide: () => boolean): () => void {
  make ??= new Function(`${SIDENOTES_JS}; return sidenotes;`)() as Stacker;
  return make(root, wide);
}

/**
 * True when the frame's container is wide enough for notes in the margin.
 * The answer comes from the sheet (`--sidenotes`, studio/editor.css), so the
 * script and the note styles cannot disagree about the width.
 */
export function marginShown(root: Element): boolean {
  return getComputedStyle(root).getPropertyValue("--sidenotes").trim() === "1";
}
