import {
  type Channel,
  atomUrl,
  CHANNEL_BASEPATH,
  CHANNEL_ORIGIN,
  indexUrl,
  rssUrl,
  siteMetaFor,
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

export function auditMarkup(html: string): string[] {
  const errors: string[] = [];
  if (!/^<!doctype html>/i.test(html.trim())) errors.push("missing HTML5 doctype");
  if (!/<html\b[^>]*\blang=["'][^"']+["']/i.test(html)) errors.push("html element has no lang attribute");
  if (!/<main[\s>]/i.test(html)) errors.push("no <main> landmark");

  const ids = new Set<string>();
  for (const id of html.matchAll(/\bid=["']([^"']+)["']/gi)) {
    if (ids.has(id[1])) errors.push(`duplicate id: ${id[1]}`);
    ids.add(id[1]);
  }
  for (const img of html.matchAll(/<img\b([^>]*)>/gi)) {
    if (!/\balt=["']/i.test(img[1])) errors.push("image is missing an alt attribute");
  }
  for (const ref of html.matchAll(/\b(?:for|aria-labelledby|aria-describedby)=["']([^"']+)["']/gi)) {
    for (const id of ref[1].split(/\s+/)) if (id && !ids.has(id)) errors.push(`missing referenced id: ${id}`);
  }
  return errors;
}

export function auditStylesheet(css: string): string[] {
  const errors: string[] = [];
  let depth = 0;
  for (const char of css.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, "")) {
    if (char === "{") depth++;
    if (char === "}") depth--;
    if (depth < 0) return ["stylesheet has an unmatched closing brace"];
  }
  if (depth !== 0) errors.push("stylesheet has unbalanced braces");
  if (/<!--[\s\S]*?-->/i.test(css)) errors.push("stylesheet contains HTML markup");
  return errors;
}

const CSS_LENGTH =
  /-?\d*\.?\d+\s*(?:px|em|rem|ch|ex|cap|ic|lh|rlh|vi|vb|vh|vw|vmin|vmax|cm|mm|q|in|pt|pc)\b/gi;
const hasLength = (value: string): boolean =>
  Array.from(value.matchAll(CSS_LENGTH)).some((m) => parseFloat(m[0]) !== 0);
const CSS_COLOR =
  /#[0-9a-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|hwb|oklch|oklab|lab|lch|color|light-dark)\s*\(/i;
const CSS_NAMED_COLOR =
  /\b(?:red|blue|green|black|white|gray|grey|maroon|purple|fuchsia|olive|lime|navy|teal|aqua|yellow|orange|pink|cyan|magenta|brown|coral|crimson|gold|indigo|violet|salmon|tan|beige|ivory|khaki|lavender)\b/i;
const CSS_RHYTHM =
  /^(?:margin|padding|gap|row-gap|column-gap|letter-spacing|font-size|line-height|font-weight|border-radius)(?:-[a-z]+)?$/;
const CSS_BORDER =
  /^border(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?|-width|-top-width|-right-width|-bottom-width|-left-width)?$/;

function* styleRules(
  css: string,
): Generator<{ selector: string; body: string; at: string[] }> {
  let i = 0;
  let selStart = 0;
  const stack: string[] = [];
  while (i < css.length) {
    const ch = css[i];
    if (ch === "{") {
      stack.push(css.slice(selStart, i).trim());
      selStart = i + 1;
      i++;
    } else if (ch === "}") {
      const sel = stack.pop() ?? "";
      const body = css.slice(selStart, i);
      if (sel && !sel.startsWith("@"))
        yield {
          selector: sel,
          body,
          at: stack.filter((s) => s.startsWith("@")),
        };
      selStart = i + 1;
      i++;
    } else {
      i++;
    }
  }
}

/**
 * The component system, enforced: spacing, type scale, weights and border
 * radii come from tokens; colors come from the skin; borders use
 * var(--border)/var(--border-w); interactions are instant; every token has
 * exactly one owner (a second :root/html definition of the same token is a
 * silent override). At-rule blocks (@font-face, @media preludes) are exempt.
 */
export function auditDesignSystem(css: string): string[] {
  const errors: string[] = [];
  const cleaned = css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/url\(\s*[^)]*\)/gi, "url()")
    .replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '""');

  const tokenLayer = new Map<string, number>();
  for (const { selector, body, at } of styleRules(cleaned)) {
    // Conditional layers (@media/@supports) may override tokens and print
    // normalization may use absolute colors — only unconditional rules count.
    const conditional = at.length > 0;
    const print = at.some((a) => /^@media\b[^({]*\bprint\b/.test(a));
    for (const m of body.matchAll(
      /(--[a-z0-9-]+|[a-z-]+)\s*:\s*([^;]+?)(?:;|$)/gi,
    )) {
      const prop = m[1].toLowerCase();
      const value = m[2].trim();
      if (prop.startsWith("--")) {
        if (!conditional && /^(?::root|html)$/.test(selector))
          tokenLayer.set(prop, (tokenLayer.get(prop) ?? 0) + 1);
        continue;
      }
      if (print) continue;
      const at2 = `${selector} { ${prop}: ${value} }`;
      if (CSS_COLOR.test(value) || CSS_NAMED_COLOR.test(value))
        errors.push(`${at2} — colors come from theme tokens`);
      if (CSS_RHYTHM.test(prop) && hasLength(value))
        errors.push(`${at2} — rhythm uses spacing/type tokens`);
      if (prop === "font-weight" && !/^var\(/.test(value))
        errors.push(`${at2} — weights are var(--weight-*)`);
      if (prop === "font-family" && !/^var\(/.test(value))
        errors.push(`${at2} — fonts are var(--font-*)`);
      if (
        CSS_BORDER.test(prop) &&
        !/var\(--border/.test(value) &&
        !/^(?:0|none)\b/.test(value)
      )
        errors.push(`${at2} — borders are var(--border)/var(--border-w)`);
      if (/^(?:transition|animation)(?:-[a-z]+)?$/.test(prop) && !/^(?:none|0)/.test(value))
        errors.push(`${at2} — interactions are instant, no motion`);
    }
  }
  for (const [name, count] of tokenLayer)
    if (count > 1)
      errors.push(`token ${name} defined ${count}× at :root/html — one owner only`);
  return errors;
}

/**
 * Markup side of the component system: separators are .nav-rule, nothing is
 * styled inline, buttons are typed, inputs carry a label hook.
 */
export function auditComponents(html: string): string[] {
  const errors: string[] = [];
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");
  for (const hr of body.matchAll(/<hr\b([^>]*)>/gi))
    if (!/class=["'][^"']*\bnav-rule\b/.test(hr[1]))
      errors.push(`<hr${hr[1].trim()}> — separators are .nav-rule`);
  for (const m of body.matchAll(/\bstyle=["']([^"']*)["']/gi))
    errors.push(`inline style="${m[1].slice(0, 60)}" — styles come from the stylesheet`);
  for (const b of body.matchAll(/<button\b([^>]*)>/gi))
    if (!/\btype=/.test(b[1]))
      errors.push(`<button${b[1].trim().slice(0, 60)}> — missing type`);
  for (const i of body.matchAll(/<input\b([^>]*)>/gi))
    if (!/\baria-label=|\bid=/.test(i[1]))
      errors.push(`<input${i[1].trim().slice(0, 60)}> — no aria-label or id for a label`);
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

/**
 * Host identity, icons, social profiles, alternate renditions and breadcrumbs
 * — the discovery set the hand-authored corporate pages declare. Baked
 * literature is held to the same bar.
 */
export function auditDiscovery(html: string, channel: Channel): string[] {
  const errors: string[] = [];
  const site = siteMetaFor(channel);
  const base = CHANNEL_BASEPATH[channel];
  const has = (re: RegExp, what: string): void => {
    if (!re.test(html)) errors.push(what);
  };

  has(/<html\b[^>]*\bdir=["'][^"']+["']/i, "html element has no dir attribute");
  has(
    /<meta\s+name=["']author["']\s+content=["'][^"']+["']/i,
    "no meta author",
  );
  has(
    /<meta\s+name=["']robots["']\s+content=["'][^"']+["']/i,
    "no meta robots directive",
  );
  has(
    /<meta\s+name=["']theme-color["']\s+content=["'][^"']+["']/i,
    "no theme-color",
  );
  has(
    /<meta\s+name=["']color-scheme["']\s+content=["'][^"']+["']/i,
    "no color-scheme",
  );
  has(
    /<meta\s+property=["']og:site_name["']\s+content=["'][^"']+["']/i,
    "no og:site_name",
  );
  has(
    /<meta\s+property=["']og:locale["']\s+content=["'][^"']+["']/i,
    "no og:locale",
  );
  for (const name of ["twitter:title", "twitter:description", "twitter:url"])
    has(
      new RegExp(`<meta\\s+name=["']${name}["']\\s+content=["'][^"']+["']`, "i"),
      `no ${name}`,
    );
  if (site.twitterSite)
    has(/<meta\s+name=["']twitter:site["']/i, "no twitter:site");

  for (const [rel, href] of Object.entries({
    icon: site.icons?.favicon,
    "apple-touch-icon": site.icons?.appleTouch,
    manifest: site.icons?.manifest,
  })) {
    if (!href) continue;
    has(
      new RegExp(`<link\\s+rel=["']${rel}["'][^>]*href=["']${href}["']`, "i"),
      `no ${rel} link for ${href}`,
    );
  }

  has(
    new RegExp(
      `<link\\s+rel=["']sitemap["'][^>]*href=["']${sitemapUrl(channel)}["']`,
      "i",
    ),
    `no sitemap link for ${sitemapUrl(channel)}`,
  );
  has(
    new RegExp(`<link\\s+rel=["']alternate["'][^>]*href=["']${base}/llms.txt["']`, "i"),
    `no llms.txt alternate for ${base}/llms.txt`,
  );
  if (site.me.length && !/<link\s+rel=["']me["']/i.test(html))
    errors.push("no rel=me profile links");

  const ldBlocks = matchAll(
    html,
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  const crumbs = ldBlocks.some((block) => {
    try {
      const parsed: unknown = JSON.parse(block);
      if (typeof parsed !== "object" || parsed === null) return false;
      if (!("@type" in parsed) || parsed["@type"] !== "BreadcrumbList")
        return false;
      if (!("itemListElement" in parsed)) return false;
      const trail = parsed.itemListElement;
      return Array.isArray(trail) && trail.length >= 2;
    } catch {
      return false;
    }
  });
  if (!crumbs) errors.push("no BreadcrumbList JSON-LD with a trail");

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
    .filter(
      (c) => c !== channel && CHANNEL_ORIGIN[c] !== CHANNEL_ORIGIN[channel],
    )
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
