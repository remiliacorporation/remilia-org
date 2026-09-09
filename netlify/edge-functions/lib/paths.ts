/**
 * Pure path logic for the `not-found` edge function.
 *
 * Self-contained on purpose: this module is bundled by Netlify's Deno runtime,
 * which requires explicit file extensions on every import, so it cannot pull
 * from `@remilia/seo`. A test in `packages/seo` asserts `SECTION_PREFIXES`
 * still matches `CHANNEL_BASEPATH`, so the two cannot drift apart silently.
 */

export const SECTION_PREFIXES = [
  "/updates",
  "/press",
  "/thought",
  "/archive",
  "/a/news",
  "/a/events",
  "/blog",
];

/**
 * Baked slugs are always lowercase, so a mixed-case section URL is a typo or a
 * mangled citation, never a real page. Returns the canonical lowercase path,
 * or undefined when there is nothing to fix.
 *
 * Scoped to section prefixes: asset filenames elsewhere (`/assets/RQ.png`)
 * are case-sensitive and must not be touched.
 */
export function caseRedirect(pathname: string): string | undefined {
  const lower = pathname.toLowerCase();
  if (lower === pathname) return undefined;
  const inSection = SECTION_PREFIXES.some(
    (prefix) => lower === prefix || lower.startsWith(`${prefix}/`),
  );
  return inSection ? lower : undefined;
}

const MACHINE_TYPES: Record<string, string> = {
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
};

/**
 * A miss on a machine-readable rendition must not answer with the HTML 404
 * page: an agent asking for `.md` or a reader asking for `.xml` would have to
 * parse markup to learn the page is gone. Returns a body in the requested
 * format, or undefined for ordinary page requests.
 */
export function machineNotFound(
  pathname: string,
): { contentType: string; body: string } | undefined {
  const dot = pathname.lastIndexOf(".");
  if (dot === -1) return undefined;
  const ext = pathname.slice(dot).toLowerCase();
  const contentType = MACHINE_TYPES[ext];
  if (!contentType) return undefined;

  const section =
    SECTION_PREFIXES.find(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    ) ?? "";
  const index = section || "/";
  if (ext === ".xml")
    return {
      contentType,
      body: `<?xml version="1.0" encoding="UTF-8"?>\n<error>\n  <status>404</status>\n  <message>Not found: ${pathname}</message>\n  <index>${index}</index>\n</error>\n`,
    };
  if (ext === ".json")
    return {
      contentType,
      body: `${JSON.stringify({ status: 404, message: `Not found: ${pathname}`, index }, null, 2)}\n`,
    };
  return {
    contentType,
    body: `404 Not found\n\n${pathname} does not exist.\n\nIndex: ${index}\nMap: ${section ? `${section}/llms.txt` : "/llms.txt"}\n`,
  };
}
