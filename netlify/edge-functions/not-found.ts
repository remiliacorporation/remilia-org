import { caseRedirect, localeRedirect, machineNotFound } from "./lib/paths.ts";

interface EdgeContext {
  next: () => Promise<Response>;
  geo?: { country?: { code?: string } };
  cookies?: {
    get: (name: string) => string | undefined;
    set: (options: {
      name: string;
      value: string;
      path: string;
      maxAge: number;
      sameSite: "Lax";
      secure: boolean;
    }) => void;
  };
}

/**
 * Handles the routing Netlify's static rules cannot express: corporate locale
 * selection, case-normalizing section URLs, and machine-readable 404 bodies.
 * Everything else passes through untouched, so static files and `_redirects`
 * keep their normal behavior.
 */
export async function notFoundHandler(
  request: Request,
  context: EdgeContext,
): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "GET" || request.method === "HEAD") {
    const locale = localeRedirect({
      pathname: url.pathname,
      requested: url.searchParams.get("lang"),
      preference: context.cookies?.get("remilia_locale"),
      acceptLanguage: request.headers.get("accept-language"),
      country: context.geo?.country?.code,
    });
    if (locale) {
      url.pathname = locale.pathname;
      url.searchParams.delete("lang");
      if (locale.remember)
        context.cookies?.set({
          name: "remilia_locale",
          value: locale.locale,
          path: "/",
          maxAge: 31_536_000,
          sameSite: "Lax",
          secure: true,
        });
      return new Response(null, {
        status: 302,
        headers: {
          location: url.toString(),
          "cache-control": "private, no-store",
          vary: "Accept-Language, Cookie",
        },
      });
    }
  }


  const canonical = caseRedirect(url.pathname);
  if (canonical) {
    url.pathname = canonical;
    return new Response(null, {
      status: 301,
      headers: { location: url.toString() },
    });
  }

  const response = await context.next();
  if (response.status !== 404) return response;

  const fallback = machineNotFound(url.pathname);
  if (!fallback) return response;
  return new Response(fallback.body, {
    status: 404,
    headers: { "content-type": fallback.contentType },
  });
}

export default notFoundHandler;

export const config = { path: "/*" };
