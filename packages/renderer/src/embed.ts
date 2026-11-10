/**
 * The blog sheet re-rooted onto one element, so a page frame can sit inside
 * another app (the Studio's page editor) with the blog's own CSS and without
 * touching the app around it.
 *
 * - `:root`, `html` and `body` land on the frame element, which carries the
 *   host's `data-hue` / `data-dots` / `data-scheme` the way `<html>` does.
 * - Width media queries become container queries on `container`, so the
 *   layout answers to the frame's width rather than the window's.
 * - Everything else goes inside `@scope (root) to (limit)`: the sheet stops
 *   at the embedder's own widgets.
 * - `@property` may not sit inside `@scope`, so it stays global. `@font-face`
 *   is dropped: its URLs are site-relative, and the embedder loads the fonts.
 */
export function scopeBlogCss(
  css: string,
  opts: { root: string; limit: string; container: string },
): string {
  const hoisted: string[] = [];
  const body = css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/@font-face\s*\{[^}]*\}/g, "")
    .replace(/@property[^{]*\{[^}]*\}/g, (rule) => {
      hoisted.push(rule);
      return "";
    })
    .replace(
      /@media\s+((?:\(\s*(?:min|max)-width\s*:\s*[\d.]+px\s*\)\s*(?:and\s+)?)+)\{/g,
      (_, query: string) => `@container ${opts.container} ${query.trim()} {`,
    )
    .replace(
      /(^|[\s,(>+~}])(?:html|body|:root)(?=[\s,.:[{>+~)#])/g,
      "$1:scope",
    );
  return `${hoisted.join("\n")}\n@scope (${opts.root}) to (${opts.limit}) {\n${body.trim()}\n}\n`;
}
