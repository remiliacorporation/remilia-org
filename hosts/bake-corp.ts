
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { localizeCorpChrome } from "./corp-locales";

const here = fileURLToPath(new URL(".", import.meta.url));
const defaultSrc = join(here, "../deploy/src");
const defaultOut = join(here, "../deploy");

const INCLUDE_RE = /<!-- @include _partials\/([^\s]+) -->/g;

/**
 * Bounds of a `.layer-<name>` block, brace-matched over nested `<div>`s.
 * Retained for `stripFxLayer`: pages are one ink-treated surface now, but
 * authored HTML may still carry a twin from the two-layer era.
 */
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
        return { start, end, openEnd, inner: html.slice(openEnd, closeStart) };
      }
      i = nextClose + 6;
    }
  }
  return null;
}

export function stripFxLayer(html: string): string {
  const fx = layerBounds(html, "fx");
  if (!fx) return html;
  let out = html.slice(0, fx.start) + html.slice(fx.end);
  out = out.replace(/\n<!-- FX LAYER[^\n]*-->\n?/g, "\n");
  out = out.replace(/\n<!-- BASE LAYER[^\n]*-->\n?/g, "\n");
  out = out.replace(/\n{3,}/g, "\n\n");
  return out;
}

export async function expandIncludes(html: string, partialsDir: string): Promise<string> {
  const cache = new Map<string, string>();
  const parts: string[] = [];
  let last = 0;
  const re = new RegExp(INCLUDE_RE.source, "g");
  for (let m = re.exec(html); m; m = re.exec(html)) {
    parts.push(html.slice(last, m.index));
    const name = m[1]!;
    const file = join(partialsDir, name);
    let chunk = cache.get(file);
    if (!chunk) {
      chunk = await readFile(file, "utf8");
      cache.set(file, chunk);
    }
    parts.push(chunk.trimEnd() + "\n");
    last = m.index + m[0].length;
  }
  parts.push(html.slice(last));
  return parts.join("");
}

async function* walkHtml(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "_partials" || e.name === "node_modules" || e.name === ".git") continue;
      yield* walkHtml(p);
    } else if (e.isFile() && e.name.endsWith(".html")) {
      yield p;
    }
  }
}

export async function bakeCorp(srcDir = defaultSrc, outDir = defaultOut): Promise<number> {
  const partialsDir = join(srcDir, "_partials");
  let n = 0;
  for await (const file of walkHtml(srcDir)) {
    const rel = relative(srcDir, file);
    const dest = join(outDir, rel);
    const raw = await readFile(file, "utf8");
    const html = stripFxLayer(
      localizeCorpChrome(await expandIncludes(raw, partialsDir), rel),
    );
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, html);
    n += 1;
    console.log(`baked ${rel}`);
  }
  return n;
}

async function main() {
  const n = await bakeCorp();
  console.log(`bake:corp done (${n} files)`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
