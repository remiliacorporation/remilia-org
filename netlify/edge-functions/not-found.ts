import { caseRedirect, machineNotFound } from "./lib/paths.ts";

interface EdgeContext {
  next: () => Promise<Response>;
}

/**
 * Two fallbacks `_redirects` cannot express: case-normalizing section URLs
 * (rule matching is exact, so `/Updates/Post` would 404), and answering a
 * missing `.md`/`.txt`/`.xml`/`.json` in its own format instead of serving the
 * HTML 404 body under a machine-readable URL.
 *
 * Everything else passes through untouched, so static files and the
 * `_redirects` rules keep their normal behavior.
 */
export async function notFoundHandler(
  request: Request,
  context: EdgeContext,
): Promise<Response> {
  const url = new URL(request.url);

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
