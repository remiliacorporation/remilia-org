import { readdir, readFile, stat } from "node:fs/promises";
import { join, posix } from "node:path";

/** Every same-origin href in a baked page, normalized to a root-absolute path. */
export function internalHrefs(html: string, origins: string[]): string[] {
  const found: string[] = [];
  for (const match of html.matchAll(
    /\b(?:href|src)=["']([^"']+)["']/gi,
  )) {
    const raw = match[1].trim();
    if (!raw || raw.startsWith("#") || raw.startsWith("data:")) continue;
    let path = raw;
    for (const origin of origins) {
      if (path === origin) path = "/";
      else if (path.startsWith(`${origin}/`)) path = path.slice(origin.length);
    }
    if (/^[a-z][a-z0-9+.-]*:/i.test(path)) continue;
    if (!path.startsWith("/")) continue;
    found.push(path.replace(/[?#].*$/, ""));
  }
  return [...new Set(found)];
}

/** Files that would satisfy a path, in the order Netlify would try them. */
export function candidateFiles(path: string): string[] {
  const clean = path.replace(/\/+$/, "") || "/";
  if (clean === "/") return ["index.html"];
  const rel = clean.slice(1);
  return [rel, `${rel}.html`, posix.join(rel, "index.html")];
}

/**
 * Redirect sources that actually deliver a page. Rules with a 404 status are
 * skipped: the catch-all `/*  /404.html  404` claims every path, and counting
 * it as coverage would make the whole check vacuous.
 */
export function redirectSources(redirects: string): {
  exact: Set<string>;
  prefixes: string[];
} {
  const exact = new Set<string>();
  const prefixes: string[] = [];
  for (const line of redirects.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [from, , status] = trimmed.split(/\s+/);
    if (!from.startsWith("/")) continue;
    if (status && status.replace("!", "") === "404") continue;
    if (from.endsWith("/*")) prefixes.push(from.slice(0, -1));
    else exact.add(from.replace(/\/+$/, "") || "/");
  }
  return { exact, prefixes };
}

async function htmlFiles(dir: string, root = dir): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "src") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await htmlFiles(full, root)));
    else if (entry.name.endsWith(".html")) out.push(full);
  }
  return out;
}

export interface BrokenLink {
  page: string;
  href: string;
}

/**
 * Walks the baked output and reports internal links that resolve to nothing —
 * the class of mistake that only shows up as a reader's 404. A path counts as
 * live when a file satisfies it or a `_redirects` rule claims it.
 */
export async function checkInternalLinks(
  outDir: string,
  origins: string[],
): Promise<BrokenLink[]> {
  const pages = await htmlFiles(outDir);
  let redirects = "";
  try {
    redirects = await readFile(join(outDir, "_redirects"), "utf8");
  } catch {
    redirects = "";
  }
  const { exact, prefixes } = redirectSources(redirects);
  const resolved = new Map<string, boolean>();

  const exists = async (path: string): Promise<boolean> => {
    const cached = resolved.get(path);
    if (cached !== undefined) return cached;
    let ok = false;
    for (const candidate of candidateFiles(path)) {
      try {
        const info = await stat(join(outDir, candidate));
        if (info.isFile()) {
          ok = true;
          break;
        }
      } catch {
        // try the next shape
      }
    }
    if (!ok) {
      const clean = path.replace(/\/+$/, "") || "/";
      ok =
        exact.has(clean) || prefixes.some((prefix) => path.startsWith(prefix));
    }
    resolved.set(path, ok);
    return ok;
  };

  const broken: BrokenLink[] = [];
  for (const page of pages) {
    const html = await readFile(page, "utf8");
    for (const href of internalHrefs(html, origins)) {
      if (!(await exists(href)))
        broken.push({ page: page.slice(outDir.length + 1), href });
    }
  }
  return broken;
}
