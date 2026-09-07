import {
  type Channel,
  atomUrl,
  CHANNEL_BASEPATH,
  CHANNEL_ORIGIN,
  indexUrl,
  rssUrl,
  sitemapUrl,
} from "@remilia/seo";

const matchAll = (html: string, re: RegExp): string[] =>
  Array.from(html.matchAll(re), (m) => m[1] ?? m[0]);

function hasStructuredType(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.length > 0 && value.every(hasStructuredType);
  if ("@type" in value) return Boolean(value["@type"]);
  return "@graph" in value && hasStructuredType(value["@graph"]);
}

export function auditPage(
  html: string,
  expectedCanonical: string,
  minTextChars = 500,
): string[] {
  const errors: string[] = [];

  const titles = matchAll(html, /<title[^>]*>([\s\S]*?)<\/title>/gi);
  if (titles.length !== 1)
    errors.push(`expected exactly one <title>, found ${titles.length}`);
  else if (!titles[0].trim()) errors.push("<title> is empty");

  const descs = matchAll(
    html,
    /<meta\s+name=["']description["']\s+content=["']([^"']*)["']/gi,
  );
  if (descs.length !== 1)
    errors.push(`expected exactly one meta description, found ${descs.length}`);
  else if (!descs[0].trim()) errors.push("meta description is empty");

  const h1s = matchAll(html, /<h1[\s>]/gi);
  if (h1s.length !== 1)
    errors.push(`expected exactly one <h1>, found ${h1s.length}`);

  const rawText = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (rawText.length < minTextChars)
    errors.push(
      `only ${rawText.length} chars of no-JS text content (need ${minTextChars}) — agents see nothing`,
    );

  const canonicals = matchAll(
    html,
    /<link\s+rel=["']canonical["']\s+href=["']([^"']*)["']/gi,
  );
  if (canonicals.length !== 1)
    errors.push(`expected exactly one canonical, found ${canonicals.length}`);
  else if (canonicals[0] !== expectedCanonical)
    errors.push(`canonical is ${canonicals[0]}, expected ${expectedCanonical}`);

  const ogUrl = matchAll(
    html,
    /<meta\s+property=["']og:url["']\s+content=["']([^"']*)["']/gi,
  );
  if (ogUrl.length === 1 && ogUrl[0] !== expectedCanonical)
    errors.push(`og:url is ${ogUrl[0]}, expected ${expectedCanonical}`);

  const ldBlocks = matchAll(
    html,
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  if (ldBlocks.length === 0) errors.push("no JSON-LD <script> found");
  for (const block of ldBlocks) {
    try {
      const parsed: unknown = JSON.parse(block);
      if (!hasStructuredType(parsed))
        errors.push("JSON-LD block has no @type");
    } catch {
      errors.push("JSON-LD block is not valid JSON");
    }
  }

  if (
    /\.vercel\.app/.test(
      html.match(/<link\s+rel=["']canonical["'][^>]*>/i)?.[0] ?? "",
    )
  )
    errors.push("canonical points at a *.vercel.app origin");

  return errors;
}

export function auditIndexability(
  html: string,
  expectIndexable: boolean,
): string[] {
  const noindex =
    /<meta\s+name=["']robots["']\s+content=["'][^"']*noindex/i.test(html);
  if (expectIndexable && noindex)
    return ["page is noindex but must be indexable"];
  if (!expectIndexable && !noindex)
    return ["origin/studio page is indexable but must be noindex"];
  return [];
}

export function audit404(status: number, body: string): string[] {
  if (status !== 404 && status !== 410)
    return [
      `nonexistent path returned HTTP ${status} (soft-404) — must be 404 or 410`,
    ];
  if (!/sitemap|llms\.txt/i.test(body))
    return ["404 body should point agents at the sitemap or llms.txt"];
  return [];
}

export function auditSitemap(xml: string, channel: Channel): string[] {
  const errors: string[] = [];
  const locs = matchAll(xml, /<loc>([^<]+)<\/loc>/gi);
  if (locs.length === 0) errors.push("sitemap has no <loc> entries");
  const origin = CHANNEL_ORIGIN[channel];
  for (const loc of locs) {
    if (!loc.startsWith(`${origin}/`))
      errors.push(
        `sitemap leaks a foreign host URL: ${loc} (host is ${origin})`,
      );
  }
  return errors;
}

export function auditRss(xml: string, channel: Channel): string[] {
  const errors: string[] = [];
  if (!xml.includes(`<link>${indexUrl(channel)}</link>`))
    errors.push(`rss channel link is not ${indexUrl(channel)}`);
  if (!xml.includes(`href="${rssUrl(channel)}"`))
    errors.push("rss atom:link self href missing or wrong");
  const guids = matchAll(xml, /<guid[^>]*>([^<]+)<\/guid>/gi);
  if (guids.length === 0) errors.push("rss has no items");
  for (const guid of guids) {
    if (!guid.startsWith(indexUrl(channel)))
      errors.push(`rss item guid off-channel: ${guid}`);
  }
  return errors;
}

export function auditAtom(xml: string, channel: Channel): string[] {
  const errors: string[] = [];
  if (!xml.includes(`href="${atomUrl(channel)}"`))
    errors.push("atom self link missing or wrong");
  if (!xml.includes(`<id>${indexUrl(channel)}</id>`))
    errors.push(`atom feed id is not ${indexUrl(channel)}`);
  const ids = matchAll(xml, /<id>([^<]+)<\/id>/gi).filter(
    (id) => id !== indexUrl(channel),
  );
  if (ids.length === 0) errors.push("atom has no entries");
  for (const id of ids) {
    if (!id.startsWith(indexUrl(channel)))
      errors.push(`atom entry id off-channel: ${id}`);
  }
  return errors;
}

export function auditFeedDiscovery(html: string, channel: Channel): string[] {
  const errors: string[] = [];
  if (
    !new RegExp(
      `rel=["']alternate["'][^>]*application/rss\\+xml[^>]*href=["']${rssUrl(channel)}["']|href=["']${rssUrl(channel)}["'][^>]*application/rss\\+xml`,
    ).test(html)
  )
    errors.push(`no RSS autodiscovery <link> for ${rssUrl(channel)}`);
  if (!html.includes("application/atom+xml"))
    errors.push(`no Atom autodiscovery <link> for ${atomUrl(channel)}`);
  return errors;
}

export function auditArticleSemantics(html: string): string[] {
  const errors: string[] = [];
  if (!/<main[\s>]/i.test(html)) errors.push("no <main> landmark");
  if (!/<article[\s>]/i.test(html))
    errors.push("post content is not in an <article>");
  if (!/<time[^>]+datetime=["'][^"']+["']/i.test(html))
    errors.push("no <time datetime> — publish date is not machine-readable");
  return errors;
}

export function auditRobots(txt: string, channel: Channel): string[] {
  return txt.includes(sitemapUrl(channel))
    ? []
    : [`robots.txt missing "Sitemap: ${sitemapUrl(channel)}"`];
}

export function auditLlmsTxt(txt: string, channel: Channel): string[] {
  const errors: string[] = [];
  if (!txt.trim()) errors.push("llms.txt is empty");
  if (!txt.includes("wiki.remilia.org"))
    errors.push("llms.txt has no wiki citation");
  if (!/^##\s+when to use/im.test(txt))
    errors.push(
      'llms.txt has no "When to use" section — agents need explicit guidance',
    );
  const channels: Channel[] = [
    "updates",
    "press",
    "thought",
    "archive",
    "news",
    "events",
    "dev-updates",
    "dev-blog",
  ];
  const foreign = channels
    .filter((c) => c !== channel)
    .map((c) => `${CHANNEL_ORIGIN[c]}${CHANNEL_BASEPATH[c]}/`);

  const seen = new Set<string>();
  for (const prefix of foreign) {
    if (seen.has(prefix)) continue;
    seen.add(prefix);
    if (txt.includes(prefix))
      errors.push(
        `llms.txt lists foreign-host content under ${prefix} (cite the index, not posts)`,
      );
  }
  return errors;
}
