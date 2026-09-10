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

export type CorpLocale = "en" | "kr" | "jp" | "cn";

export interface LocaleRequest {
  pathname: string;
  requested?: string | null;
  preference?: string | null;
  acceptLanguage?: string | null;
  country?: string | null;
}

export interface LocaleRedirect {
  pathname: string;
  locale: CorpLocale;
  remember: boolean;
}

const CORP_ROUTES = new Set(["/", "/about", "/careers", "/contact"]);
const LOCALE_PREFIXES: Record<Exclude<CorpLocale, "en">, string> = {
  kr: "/kr",
  jp: "/jp",
  cn: "/cn",
};

function asLocale(value: string | null | undefined): CorpLocale | undefined {
  return value === "en" || value === "kr" || value === "jp" || value === "cn"
    ? value
    : undefined;
}

function corpPage(pathname: string): { locale: CorpLocale; route: string } | undefined {
  const path = pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
  if (CORP_ROUTES.has(path)) return { locale: "en", route: path };
  for (const [locale, prefix] of Object.entries(LOCALE_PREFIXES) as [
    Exclude<CorpLocale, "en">,
    string,
  ][]) {
    if (path !== prefix && !path.startsWith(`${prefix}/`)) continue;
    const route = path === prefix ? "/" : path.slice(prefix.length);
    if (CORP_ROUTES.has(route)) return { locale, route };
  }
  return undefined;
}

function localePath(locale: CorpLocale, route: string): string {
  if (locale === "en") return route;
  const prefix = LOCALE_PREFIXES[locale];
  return route === "/" ? `${prefix}/` : `${prefix}${route}`;
}

function acceptedLocale(value: string | null | undefined): CorpLocale | undefined {
  let best: CorpLocale | undefined;
  let bestQ = 0;
  for (const item of (value ?? "").split(",")) {
    const [rawLanguage, ...parameters] = item.trim().split(";");
    const language = rawLanguage?.toLowerCase();
    const locale =
      language === "en" || language?.startsWith("en-")
        ? "en"
        : language === "ko" || language?.startsWith("ko-")
          ? "kr"
          : language === "ja" || language?.startsWith("ja-")
            ? "jp"
            : language === "zh" || language?.startsWith("zh-")
              ? "cn"
              : undefined;
    if (!locale) continue;
    const qParameter = parameters.find((part) => part.trim().startsWith("q="));
    const q = qParameter ? Number(qParameter.trim().slice(2)) : 1;
    if (Number.isFinite(q) && q > bestQ) {
      best = locale;
      bestQ = q;
    }
  }
  return best;
}

/**
 * Chooses a clean locale URL for corporate pages only. Explicit selections
 * persist; otherwise browser language wins, with IP country as the fallback.
 */
export function localeRedirect(input: LocaleRequest): LocaleRedirect | undefined {
  const page = corpPage(input.pathname);
  if (!page) return undefined;

  const requested = asLocale(input.requested);
  if (requested)
    return {
      pathname: localePath(requested, page.route),
      locale: requested,
      remember: true,
    };

  if (page.locale !== "en") return undefined;

  const preference = asLocale(input.preference);
  const country =
    input.country === "KR"
      ? "kr"
      : input.country === "JP"
        ? "jp"
        : input.country === "CN"
          ? "cn"
          : undefined;
  const locale = preference ?? acceptedLocale(input.acceptLanguage) ?? country;
  if (!locale || locale === "en") return undefined;
  return { pathname: localePath(locale, page.route), locale, remember: false };
}

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
