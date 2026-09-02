/**
 * Build-time print FX twin.
 *
 * Corporate pages author a single `.layer-base`. This step injects a
 * decorative `.layer-fx` clone (aria-hidden / inert / data-nosnippet) so the
 * SVG print filter can misregister ink without a second hand-maintained tree.
 *
 *   node --import tsx hosts/bake-fx.ts [deployDir]
 *
 * Idempotent: replaces any existing `.layer-fx`. Wired into Netlify after
 * `bake:org`.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const deployDir = process.argv[2] ?? join(here, "../deploy");

async function* walkHtml(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === ".git" || e.name === "assets") continue;
      yield* walkHtml(p);
    } else if (e.isFile() && e.name.endsWith(".html")) {
      yield p;
    }
  }
}

/** Locate `<div class="layer-{name}">…</div><!-- /layer-{name} -->` (comment optional). */
export function layerBounds(
  html: string,
  name: "fx" | "base",
): { start: number; end: number; openEnd: number; inner: string } | null {
  const re = new RegExp(`<div\\b[^>]*\\bclass="[^"]*\\blayer-${name}\\b[^"]*"[^>]*>`, "i");
  const m = re.exec(html);
  if (!m || m.index === undefined) return null;
  const start = m.index;
  const openEnd = start + m[0].length;
  let depth = 1;
  let i = openEnd;
  while (i < html.length && depth > 0) {
    const nextOpen = html.indexOf("<div", i);
    const nextClose = html.indexOf("</div>", i);
    if (nextClose === -1) return null;
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth += 1;
      i = nextOpen + 4;
    } else {
      depth -= 1;
      if (depth === 0) {
        const closeStart = nextClose;
        let end = nextClose + 6;
        const commentClose = `<!-- /layer-${name} -->`;
        const after = html.slice(end, end + commentClose.length + 16);
        const cAt = after.indexOf(commentClose);
        if (cAt !== -1) end = end + cAt + commentClose.length;
        return {
          start,
          end,
          openEnd,
          inner: html.slice(openEnd, closeStart),
        };
      }
      i = nextClose + 6;
    }
  }
  return null;
}

/** Demote a layer-base inner HTML into FX-safe markup. */
export function toFxInner(inner: string): string {
  let out = inner;
  out = out.replace(/\s+id="[^"]*"/gi, "");
  // Avoid double-fetching embeds; CSS hides iframes in FX but keeps layout.
  out = out.replace(/<iframe\b([^>]*)>/gi, (_all, attrs: string) => {
    let a = String(attrs).replace(/\s+src="[^"]*"/i, "");
    a = a.replace(/\s+srcdoc="[^"]*"/i, "");
    if (!/\bsrc=/i.test(a)) a += ' src="about:blank"';
    return `<iframe${a}>`;
  });
  out = out.replace(/<a\b([^>]*)>/gi, (_all, attrs: string) => {
    let a = String(attrs);
    if (!/\btabindex=/i.test(a)) a += ' tabindex="-1"';
    if (!/\baria-hidden=/i.test(a)) a += ' aria-hidden="true"';
    a = a.replace(/\s+aria-label="[^"]*"/i, "");
    return `<a${a}>`;
  });
  out = out.replace(
    /<(button|input|select|textarea)\b([^>]*)>/gi,
    (_all, tag: string, attrs: string) => {
      let a = String(attrs);
      if (!/\btabindex=/i.test(a)) a += ' tabindex="-1"';
      return `<${tag}${a}>`;
    },
  );
  return out;
}

export function injectFx(html: string): { html: string; status: "injected" | "replaced" | "skipped" } {
  const base = layerBounds(html, "base");
  if (!base) return { html, status: "skipped" };

  const fxBlock =
    `<div class="layer-fx" aria-hidden="true" inert data-nosnippet>` +
    toFxInner(base.inner) +
    `</div><!-- /layer-fx -->`;

  const existing = layerBounds(html, "fx");
  if (existing) {
    // Preserve a blank line before layer-base when we had one.
    const between = html.slice(existing.end, base.start);
    const sep = /^\s*$/.test(between) ? "\n\n" : between;
    const next = html.slice(0, existing.start) + fxBlock + sep + html.slice(base.start);
    return { html: next, status: "replaced" };
  }

  const indent = html.slice(html.lastIndexOf("\n", base.start - 1) + 1, base.start);
  const next = html.slice(0, base.start) + fxBlock + "\n\n" + indent + html.slice(base.start);
  return { html: next, status: "injected" };
}

async function main() {
  let n = 0;
  for await (const file of walkHtml(deployDir)) {
    const raw = await readFile(file, "utf8");
    if (!/\blayer-base\b/.test(raw)) continue;
    const { html, status } = injectFx(raw);
    if (status === "skipped") continue;
    if (html !== raw) {
      await writeFile(file, html);
      n += 1;
      console.log(`${status} ${relative(deployDir, file)}`);
    } else {
      console.log(`unchanged ${relative(deployDir, file)}`);
    }
  }
  console.log(`bake:fx done (${n} files)`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
