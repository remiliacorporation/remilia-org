import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { createClient, type SanityClient } from "@sanity/client";
import {
  type Channel,
  CHANNEL_BASEPATH,
  CHANNEL_HOST,
  CHANNEL_LABEL,
  CHANNEL_ORIGIN,
  HOST_AGGREGATE,
  HOST_SECTIONS,
  atom,
  blogPosting,
  breadcrumbs,
  canonicalFor,
  event as eventJsonLd,
  feedLinks,
  imageGallery,
  indexPath,
  indexUrl,
  legacyRedirect,
  llmsTxt,
  organization,
  rss,
  sitemap,
  siteMetaFor,
  type SitemapEntry,
  type OrgInput,
} from "@remilia/seo";
import {
  extractHeadings,
  figureHtml,
  imageDims,
  portableTextToHtml,
  tocItems,
  footnoteCount,
  slugify,
  type LinkCard,
  type PTBlock,
  bodyShowsImage,
} from "./pt";
import { markdownToPost, postToMarkdownFile } from "./md";
import {
  articleHtml,
  citeBox,
  htmlPage,
  notFoundHtml,
  tocBox,
  adjacentHtml,
  indexMain,
  cardHtml,
  type IndexCard,
  termIndexMain,
  type Chrome,
} from "./page";
import {
  leftRail,
  emptyRail,
  dateSel,
  authorSel,
  filterBox,
  sectionNav as sectionRow,
  NAV_JS,
  type NavPost,
} from "./nav";
import { galleryHtml, LIGHTBOX_JS } from "./gallery";
import { esc } from "./html";
import {
  aliasRules,
  ghostFromUrl,
  mergeRedirectBlock,
  type RedirectRule,
} from "./redirects";
import {
  BakeRefused,
  readFailureMessage,
  type ContentPerspective,
} from "./guard";

export interface BakeOptions {
  channel: Channel;
  chrome: Chrome;
  outDir: string;
  projectId: string;
  dataset: string;
  token?: string;
  host: {
    title: string;
    description: string;
    lead: string;
    whenToUse: string[];
    citeElsewhere: { label: string; url: string }[];
  };

  /**
   * Content API origin. Defaults to Sanity; point it at a fixture server to
   * bake known content without the network.
   */
  apiHost?: string;

  /** Sanity view to bake. Production uses `published`; protected previews use `drafts`. */
  perspective?: ContentPerspective;

  stylesheets: string[];
  /** Pool posts across these channels — the listing-only aggregate surface. */
  aggregateOf?: Channel[];
  /**
   * The host also bakes its pooled index, with an author archive for every
   * author on the host. A section's Author control then offers every one of
   * them, opening the pooled archive for an author the section has no
   * posts by.
   */
  hostPooled?: boolean;
}

interface FetchedPost {
  channel?: Channel;
  title: string;
  slug: string;
  excerpt: string;
  publishedAt: string;
  updatedAt?: string;
  body: PTBlock[];
  markdown?: string;
  coverRef?: string;
  coverAlt?: string;
  ogImageRef?: string;
  seoTitle?: string;
  seoDescription?: string;
  noIndex?: boolean;
  authors?: { name: string; url?: string }[];
  tags?: string[];
  origin?: "first-party" | "external";
  externalUrl?: string;
  outlet?: string;
  commentary?: PTBlock[];
  startsAt?: string;
  endsAt?: string;
  locationName?: string;
  albums?: FetchedAlbum[];
  legacyUrl?: string;
  migrationSource?: string;
  aliases?: string[];
}

interface FetchedImage {
  ref?: string;
  alt?: string;
  caption?: string;
  credit?: string;
}

interface FetchedAlbum {
  title: string;
  slug: string;
  date?: string;
  description?: string;
  images: FetchedImage[];
}

export function cdnUrl(
  projectId: string,
  dataset: string,
  ref: string,
  params: string,
): string | undefined {
  const m = /^image-([a-f0-9]+)-(\d+x\d+)-(\w+)$/.exec(ref);
  if (!m) return undefined;
  return `https://cdn.sanity.io/images/${projectId}/${dataset}/${m[1]}-${m[2]}.${m[3]}?${params}`;
}

/** `file-<sha>-<ext>` ref → CDN file URL (videos, attachments). */
function fileUrl(
  projectId: string,
  dataset: string,
  ref: string,
): string | undefined {
  const m = /^file-([a-f0-9]+)-(\w+)$/.exec(ref);
  if (!m) return undefined;
  return `https://cdn.sanity.io/files/${projectId}/${dataset}/${m[1]}.${m[2]}`;
}

// Production omits future posts. Draft previews include them so editors can
// review scheduled content before its publication time.
const POSTS_QUERY = `*[_type == "post" && channel == $channel && defined(publishedAt) && ($includeFuture || publishedAt <= now())] | order(publishedAt desc) {
  title, "slug": slug.current, excerpt, publishedAt, "updatedAt": _updatedAt, body, markdown,
  "coverRef": coverImage.asset._ref,
  "coverAlt": coverImage.alt,
  "ogImageRef": coalesce(seo.ogImage.asset._ref, coverImage.asset._ref),
  "seoTitle": seo.metaTitle,
  "seoDescription": seo.metaDescription,
  "noIndex": seo.noIndex,
  "authors": authors[]->{ name, url },
  "tags": tags[]->name,
  origin, externalUrl, outlet, commentary,
  startsAt, endsAt, locationName,
  "legacyUrl": migration.legacyUrl,
  aliases,
  "migrationSource": migration.source,
  "albums": albums[]->{ title, "slug": slug.current, date, description,
    "images": images[]{ "ref": asset._ref, alt, caption, credit } }
}`;

// Just enough of a sibling section's posts to know who writes on the host.
const AUTHORS_QUERY = `*[_type == "post" && channel == $channel && defined(publishedAt) && ($includeFuture || publishedAt <= now())] {
  publishedAt, "noIndex": seo.noIndex, "authors": authors[]->{ name }, origin
}`;

const ORG_QUERY = `*[_id == "org"][0]{ name, legalName, sameAs, contactEmail, address,
  "logoRef": logo.asset._ref }`;

function postPlain(blocks: PTBlock[]): string {
  return blocks
    .flatMap((b) =>
      "children" in b && Array.isArray(b.children) ? b.children : [],
    )
    .map((s) =>
      s && typeof s === "object" && "text" in s ? String(s.text) : "",
    )
    .join("");
}

/**
 * Whole minutes at 200 words per minute, the figure most reading-time
 * estimates use. Returns undefined under a minute, where a label would say
 * less than the words it occupies.
 */
export function readingMinutes(plain: string): number | undefined {
  const words = plain.trim().split(/\s+/).filter(Boolean).length;
  if (words < 200) return undefined;
  return Math.round(words / 200);
}

function postBody(p: FetchedPost, channel: Channel): PTBlock[] {
  if (
    channel === "archive" &&
    p.origin === "external" &&
    p.commentary?.length
  ) {
    return p.commentary;
  }
  if (p.body?.length) return p.body;
  if (p.markdown?.trim()) return markdownToPost(p.markdown, channel).body;
  if (channel === "archive" && p.origin === "external") {
    const outlet = p.outlet ? ` (${p.outlet})` : "";
    const href = p.externalUrl ?? "#";
    return [
      {
        _type: "block",
        style: "normal",
        markDefs: [{ _type: "link", _key: "l", href }],
        children: [
          { _type: "span", text: "Originally published", marks: [] },
          { _type: "span", text: outlet, marks: [] },
          { _type: "span", text: ": ", marks: [] },
          { _type: "span", text: href, marks: ["l"] },
        ],
      },
    ];
  }
  return [];
}

function postCanonical(p: FetchedPost, channel: Channel): string {
  if (channel === "archive" && p.origin === "external" && p.externalUrl) {
    return p.externalUrl;
  }
  return canonicalFor(channel, p.slug);
}

function isExternalArchive(p: FetchedPost, channel: Channel): boolean {
  return channel === "archive" && p.origin === "external" && Boolean(p.externalUrl);
}

/**
 * The outlet external coverage is credited to: its `outlet` field, or the
 * original's host name. Undefined for first-party posts.
 */
export function outletOf(p: {
  origin?: string;
  outlet?: string;
  externalUrl?: string;
}): string | undefined {
  if (p.origin !== "external") return undefined;
  const named = p.outlet?.trim();
  if (named) return named;
  try {
    return p.externalUrl
      ? new URL(p.externalUrl).hostname.replace(/^www\./, "")
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The name a post is bylined with. Coverage written elsewhere names its
 * outlet, never the author document it was filed under, who did not write
 * it.
 */
function bylineOf(p: FetchedPost): string | undefined {
  if (p.origin === "external") return outletOf(p);
  return p.authors?.map((a) => a.name).join(", ") || undefined;
}

function postText(p: FetchedPost, canonical: string, body: PTBlock[]): string {
  return `${p.title}\n\n${p.publishedAt.slice(0, 10)} — ${canonical}\n\n${p.excerpt}\n\n${postPlain(body)}\n`;
}

/** The UTC calendar month a timestamp falls in, as `YYYY-MM`. */
export function monthKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** `2024-12` → `December 2024`. */
export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** A taxonomy a listing can bake a per-term archive for. */
type ArchiveKind = "tags" | "authors" | "months";

interface ArchiveTerm {
  label: string;
  slug: string;
  posts: FetchedPost[];
}

/**
 * The per-term archives a listing bakes over its posts: one per tag, author
 * and publication month holding an indexable post. Bakes write exactly these,
 * and links check against them, so nothing points at a page never written.
 */
function termArchives(posts: FetchedPost[]): Record<ArchiveKind, ArchiveTerm[]> {
  const termsOf = (
    pick: (p: FetchedPost) => string[],
    slugOf: (label: string) => string = slugify,
  ): ArchiveTerm[] => {
    const byTerm = new Map<string, ArchiveTerm>();
    for (const p of posts) {
      if (p.noIndex) continue;
      for (const label of pick(p)) {
        const trimmed = label.trim();
        if (!trimmed) continue;
        const slug = slugOf(trimmed);
        const term = byTerm.get(slug) ?? { label: trimmed, slug, posts: [] };
        term.posts.push(p);
        byTerm.set(slug, term);
      }
    }
    return [...byTerm.values()].sort((a, b) => a.label.localeCompare(b.label));
  };
  return {
    tags: termsOf((p) => p.tags ?? []),
    // Outlets are not authors: coverage gets no author archive.
    authors: termsOf((p) =>
      p.origin === "external" ? [] : (p.authors?.map((a) => a.name) ?? []),
    ),
    months: termsOf((p) => [monthKey(p.publishedAt)], (key) => key)
      .map((t) => ({ ...t, label: monthLabel(t.slug) }))
      .sort((a, b) => b.slug.localeCompare(a.slug)),
  };
}

/** The listing paths of `archives` under `basePath`, for `kinds`. */
function archivePaths(
  basePath: string,
  archives: Record<ArchiveKind, ArchiveTerm[]>,
  kinds: readonly ArchiveKind[],
): string[] {
  return kinds.flatMap((at) =>
    archives[at].map((term) => `${basePath}/${at}/${term.slug}`),
  );
}

const ARCHIVE_KINDS: readonly ArchiveKind[] = ["tags", "authors", "months"];

export interface IndexEntry {
  title: string;
  url: string;
  date: string;
  excerpt: string;
}

export function indexMarkdown(
  title: string,
  description: string,
  url: string,
  entries: IndexEntry[],
): string {
  const head = `# ${title}\n\n> ${description}\n\n${url}\n`;
  if (!entries.length) return head;
  const lines = entries.map(
    (e) =>
      `- ${e.date.slice(0, 10)} — [${e.title}](${e.url})${e.excerpt ? `: ${e.excerpt}` : ""}`,
  );
  return `${head}\n## Posts\n\n${lines.join("\n")}\n`;
}

export function indexText(
  title: string,
  description: string,
  url: string,
  entries: IndexEntry[],
): string {
  const head = `${title}\n\n${description}\n\n${url}\n`;
  if (!entries.length) return head;
  const lines = entries.map(
    (e) =>
      `${e.date.slice(0, 10)} — ${e.title}\n${e.url}${e.excerpt ? `\n${e.excerpt}` : ""}`,
  );
  return `${head}\n${lines.join("\n\n")}\n`;
}

/**
 * A fetched post filed under its section. A reference to a deleted author
 * document dereferences to null; it names nobody, so it is dropped.
 */
function withChannel(p: FetchedPost, channel: Channel): FetchedPost {
  return {
    ...p,
    channel,
    authors: p.authors?.filter((a) => Boolean(a?.name?.trim())),
  };
}

/**
 * Writes the page whose URL is the directory `dir` under `outDir` so the URL
 * answers without a trailing slash: `<dir>.html` is what Netlify serves at
 * `<dir>`, with a 200 instead of the 301 a bare `<dir>/index.html` draws. The
 * `index.html` stays beside it so an old slash URL still resolves; Netlify
 * 301s it to the slashless one. A site root has only its `index.html`.
 */
export async function writePage(
  outDir: string,
  dir: string,
  html: string,
): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "index.html"), html);
  if (resolve(dir) !== resolve(outDir)) await writeFile(`${dir}.html`, html);
}

export async function bake(opts: BakeOptions): Promise<{ pages: number }> {
  const { channel, chrome, outDir, host } = opts;
  const basePath = CHANNEL_BASEPATH[channel];
  const site = siteMetaFor(channel);
  const perspective = opts.perspective ?? "published";
  const client: SanityClient = createClient({
    projectId: opts.projectId,
    dataset: opts.dataset,
    apiVersion: "2026-02-01",
    useCdn: perspective === "published" && !opts.token && !opts.apiHost,
    token: opts.token,
    perspective,
    ...(opts.apiHost
      ? { apiHost: opts.apiHost, useProjectHostname: false }
      : {}),
  });

  const aggregated = !!opts.aggregateOf;
  const postChannel = (p: FetchedPost): Channel => p.channel ?? channel;
  const postBase = (p: FetchedPost): string => CHANNEL_BASEPATH[postChannel(p)];

  let posts: FetchedPost[];
  try {
    const fetches = (opts.aggregateOf ?? [channel]).map(async (c) =>
      (await client.fetch<FetchedPost[]>(POSTS_QUERY, {
        channel: c,
        includeFuture: perspective === "drafts",
      })).map((p) => withChannel(p, c)),
    );
    posts = (await Promise.all(fetches)).flat();
    if (aggregated)
      posts.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  } catch (err) {
    throw new BakeRefused(`${readFailureMessage(err)} — refusing to bake`);
  }
  // Every post on the host, for the Author control: the pooled bake already
  // holds them; a section of a pooled host reads its siblings' bylines.
  let hostPosts = posts;
  if (opts.hostPooled && !aggregated) {
    try {
      const siblings = HOST_SECTIONS[CHANNEL_HOST[channel]].filter(
        (c) => c !== channel,
      );
      hostPosts = [
        ...posts,
        ...(
          await Promise.all(
            siblings.map(async (c) =>
              (await client.fetch<FetchedPost[]>(AUTHORS_QUERY, {
                channel: c,
                includeFuture: perspective === "drafts",
              })).map((p) => withChannel(p, c)),
            ),
          )
        ).flat(),
      ];
    } catch (err) {
      throw new BakeRefused(`${readFailureMessage(err)} — refusing to bake`);
    }
  }
  const orgDoc = await client.fetch<(OrgInput & { logoRef?: string }) | null>(
    ORG_QUERY,
  );
  const img = (ref: string | undefined, params: string): string | undefined =>
    ref ? cdnUrl(opts.projectId, opts.dataset, ref, params) : undefined;
  const orgLd = orgDoc
    ? organization({ ...orgDoc, logoUrl: img(orgDoc.logoRef, "w=512") })
    : undefined;
  const withOrg = (ld: object): object[] => (orgLd ? [ld, orgLd] : [ld]);

  const meta = { channel, title: host.title, description: host.description };
  // A feed item is bylined like its page: coverage names its outlet.
  const feedPost = (p: FetchedPost) => {
    const outlet = outletOf(p);
    return {
      ...p,
      channel: postChannel(p),
      authors:
        p.origin === "external" ? (outlet ? [{ name: outlet }] : []) : p.authors,
    };
  };
  const feedPosts = posts
    .filter((p) => !p.noIndex && !isExternalArchive(p, postChannel(p)))
    .map(feedPost);
  const sitemapEntries: SitemapEntry[] = [
    { loc: indexUrl(channel) },
    // Aggregates only list their own pages — posts live in section sitemaps.
    ...(aggregated
      ? []
      : posts
          .filter((p) => !p.noIndex && !isExternalArchive(p, postChannel(p)))
          .map((p) => ({
            loc: canonicalFor(postChannel(p), p.slug),
            lastmod: p.updatedAt ?? p.publishedAt,
          }))),
  ];

  const dir = join(outDir, ...basePath.split("/").filter(Boolean));
  await mkdir(dir, { recursive: true });

  // Assets carry a content fingerprint, so a stylesheet or script change
  // reaches readers holding a cached copy instead of waiting for expiry.
  const css = (
    await Promise.all(opts.stylesheets.map((f) => readFile(f, "utf8")))
  ).join("\n");
  const stamp = (path: string, content: string): string =>
    `${path}?v=${createHash("sha256").update(content).digest("hex").slice(0, 8)}`;
  const chromeStamped: Chrome = {
    ...chrome,
    stylesheet: stamp(chrome.stylesheet, css),
  };

  const cards = new Map<string, LinkCard>();
  for (const p of posts) {
    const card: LinkCard = {
      title: p.title,
      description: p.excerpt,
      imageUrl: img(p.coverRef, "w=640&auto=format"),
    };
    cards.set(canonicalFor(postChannel(p), p.slug), card);
    cards.set(`${postBase(p)}/${p.slug}`, card);
  }

  // This listing's own archives — months and authors on an aggregate — and,
  // for an aggregate, the ones each pooled section bakes over the same posts.
  // A section of a pooled host can also link the host's pooled author
  // archives, which the aggregate bakes over every section's posts.
  const archives = termArchives(posts);
  const ownKinds: readonly ArchiveKind[] = aggregated
    ? ["months", "authors"]
    : ARCHIVE_KINDS;
  const pooledBase =
    CHANNEL_BASEPATH[HOST_AGGREGATE[CHANNEL_HOST[channel]]];
  const hostAuthors = termArchives(hostPosts).authors;
  const bakedArchives = new Set([
    ...archivePaths(basePath, archives, ownKinds),
    ...(opts.aggregateOf ?? []).flatMap((c) =>
      archivePaths(
        CHANNEL_BASEPATH[c],
        termArchives(posts.filter((p) => postChannel(p) === c)),
        ARCHIVE_KINDS,
      ),
    ),
    ...(opts.hostPooled && !aggregated
      ? hostAuthors.map((t) => `${pooledBase}/authors/${t.slug}`)
      : []),
  ]);
  // Dates and authors link to the post's section archive when that archive
  // is baked, an author to the pooled one otherwise, and render unlinked
  // when neither is.
  const baked = (href: string): string | undefined =>
    bakedArchives.has(href) ? href : undefined;
  const monthHrefFor = (p: FetchedPost): string | undefined =>
    baked(`${postBase(p)}/months/${monthKey(p.publishedAt)}`);
  const authorHrefFor = (p: FetchedPost): string | undefined => {
    const name = p.authors?.[0]?.name?.trim();
    if (!name || p.origin === "external") return undefined;
    const slug = slugify(name);
    return (
      baked(`${postBase(p)}/authors/${slug}`) ??
      baked(`${pooledBase}/authors/${slug}`)
    );
  };
  // The Author control lists every author on the host with an archive. A
  // pick keeps this listing's section when the author has posts in it and
  // otherwise drops it for the pooled archive, so it never opens an empty
  // page.
  const authorNav = (current?: string, allHref = indexPath(channel)): string =>
    authorSel(
      hostAuthors.flatMap((t) => {
        const href =
          baked(`${basePath}/authors/${t.slug}`) ??
          baked(`${pooledBase}/authors/${t.slug}`);
        return href ? [{ label: t.label, href }] : [];
      }),
      allHref,
      current,
    );
  // The date control offers this listing's own month archives — the
  // section's, or the pooled ones on an aggregate.
  const dateNav = (current?: string): string =>
    dateSel(
      archives.months.map((t) => ({
        key: t.slug,
        href: `${basePath}/months/${t.slug}`,
      })),
      indexPath(channel),
      current,
    );

  // The card's category is the section it lives under — the index is shared
  // between channels, so the filter dropdown groups by section, not tag.
  const navPosts: NavPost[] = posts.map((p) => ({
    title: p.title,
    url: `${postBase(p)}/${p.slug}`,
    date: p.publishedAt,
    category: CHANNEL_LABEL[postChannel(p)],
    categoryHref: indexUrl(postChannel(p)),
    authorHref: authorHrefFor(p),
    monthHref: monthHrefFor(p),
    excerpt: p.excerpt,
    imageUrl: img(p.coverRef, "w=1200&auto=format"),
    author: bylineOf(p),
  }));
  // One row of section links heads every masthead — every listing and post
  // offers the host's full section set, the one shown marked.
  const siblings = HOST_SECTIONS[CHANNEL_HOST[channel]];
  const sharedCats = {
    cats: siblings.map((c) => ({
      label: CHANNEL_LABEL[c],
      href: indexPath(c),
    })),
    current: aggregated ? "" : CHANNEL_LABEL[channel],
    allHref: indexPath(HOST_AGGREGATE[CHANNEL_HOST[channel]]),
  };
  const sectionNav = sectionRow(sharedCats);
  const navScript = `<script src="${stamp(`${basePath}/nav.js`, NAV_JS)}" defer></script>`;
  const linkCard = (href: string): LinkCard | undefined =>
    cards.get(href.replace(/\/$/, ""));
  const needsLightbox =
    channel === "events" && posts.some((p) => (p.albums?.length ?? 0) > 0);
  const galleryScript = needsLightbox
    ? `\n<script src="${stamp(`${basePath}/gallery.js`, LIGHTBOX_JS)}" defer></script>`
    : "";

  const imgUrl = (b: {
    asset?: { _ref?: string; url?: string };
  }): string | undefined =>
    (b.asset?._ref ? img(b.asset._ref, "w=1600&auto=format") : undefined) ??
    b.asset?.url;

  // Prose is 560px, so a phone should not download a 1600px original.
  const IMAGE_WIDTHS = [640, 960, 1280, 1600];
  const imgSrcSet = (b: {
    asset?: { _ref?: string; url?: string };
  }): string | undefined => {
    const ref = b.asset?._ref;
    if (!ref) return undefined;
    const candidates = IMAGE_WIDTHS.flatMap((w) => {
      const url = img(ref, `w=${w}&auto=format`);
      return url ? [`${url} ${w}w`] : [];
    });
    return candidates.length ? candidates.join(", ") : undefined;
  };

  // Aggregates bake no post pages — each post already lives in its section.
  for (const p of aggregated ? [] : posts) {
    const pageUrl = canonicalFor(postChannel(p), p.slug);
    const canonical = postCanonical(p, postChannel(p));
    const body = postBody(p, postChannel(p));
    const plain = postPlain(body);
    const bodyHtml = portableTextToHtml(body, {
      imageUrl: imgUrl,
      imageSrcSet: imgSrcSet,
      videoUrl: (b) =>
        (b.file?.asset?._ref
          ? fileUrl(opts.projectId, opts.dataset, b.file.asset._ref)
          : undefined) ?? b.file?.asset?.url,
      linkCard,
    });
    // The cover leads the page unless the body already shows that image —
    // imported posts often open on it, and it would print twice.
    const heroBlock =
      p.coverRef && !bodyShowsImage(body, p.coverRef)
        ? { asset: { _ref: p.coverRef } }
        : undefined;
    const heroSrc = heroBlock ? imgUrl(heroBlock) : undefined;
    const heroDims = imageDims(p.coverRef);
    const hero =
      heroBlock && heroSrc
        ? `${figureHtml({ src: heroSrc, srcset: imgSrcSet(heroBlock), alt: p.coverAlt, width: heroDims?.w, height: heroDims?.h, lead: true })}\n<hr class="nav-rule">`
        : "";
    const bodyWithHero = hero ? `${hero}\n${bodyHtml}` : bodyHtml;
    const galleries =
      channel === "events"
        ? (p.albums ?? [])
            .map((a) =>
              galleryHtml(
                a.title,
                a.images.flatMap((i) => {
                  const url = img(i.ref, "w=800&auto=format");
                  const fullUrl = img(i.ref, "w=2400&auto=format");
                  const dims = imageDims(i.ref);
                  return url && fullUrl
                    ? [
                        {
                          url,
                          fullUrl,
                          alt: i.alt ?? "",
                          caption: i.caption,
                          credit: i.credit,
                          width: dims?.w,
                          height: dims?.h,
                        },
                      ]
                    : [];
                }),
              ),
            )
            .join("\n")
        : "";
    const galleryLd =
      channel === "events"
        ? (p.albums ?? []).map((a) =>
            imageGallery({
              title: a.title,
              description: a.description,
              pageUrl,
              images: a.images.flatMap((i) => {
                const url = img(i.ref, "w=2400&auto=format");
                return url
                  ? [
                      {
                        url,
                        alt: i.alt ?? "",
                        caption: i.caption,
                        credit: i.credit,
                      },
                    ]
                  : [];
              }),
            }),
          )
        : [];
    const eventLd =
      channel === "events" && p.startsAt
        ? [
            eventJsonLd({
              slug: p.slug,
              title: p.title,
              summary: p.excerpt,
              startsAt: p.startsAt,
              endsAt: p.endsAt,
              locationName: p.locationName,
              imageUrl: img(p.coverRef, "w=1200&auto=format"),
            }),
          ]
        : [];
    const page = htmlPage({
      title: p.seoTitle?.trim() || `${p.title} — ${host.title}`,
      description: p.seoDescription?.trim() || p.excerpt,
      canonical,
      ogImage:
        img(p.ogImageRef, "w=1200&h=630&fit=crop&auto=format") ??
        img(p.coverRef, "w=1200&auto=format"),
      noindex: p.noIndex === true,
      channel,
      author: bylineOf(p),
      publishedTime: p.publishedAt,
      modifiedTime: p.updatedAt ?? p.publishedAt,
      alternates: [
        {
          type: "text/markdown",
          title: `${p.title} (Markdown)`,
          href: `${basePath}/${p.slug}.md`,
        },
        {
          type: "text/plain",
          title: `${p.title} (plain text)`,
          href: `${basePath}/${p.slug}.txt`,
        },
      ],
      jsonld: [
        ...withOrg(
          blogPosting({
            ...p,
            // An outlet is an organization, not one of the post's people.
            authors: p.origin === "external" ? undefined : p.authors,
            channel,
            canonicalUrl: canonical,
            excerpt: p.seoDescription?.trim() || p.excerpt,
            coverImageUrl:
              img(p.ogImageRef, "w=1200&h=630&fit=crop&auto=format") ??
              img(p.coverRef, "w=1200&auto=format"),
          }),
        ),
        breadcrumbs(pageUrl, [
          { name: site.name, url: `${site.origin}/` },
          { name: host.title, url: indexUrl(channel) },
          { name: p.title, url: pageUrl },
        ]),
        ...eventLd,
        ...galleryLd,
      ],
      headExtra: `${feedLinks(meta)}${galleryScript}`,
      chrome: chromeStamped,
      leftRail: leftRail(
        navPosts,
        host.title,
        basePath,
        `${basePath}/${p.slug}`,
        sharedCats,
      ),
      tocHtml: tocBox(tocItems(extractHeadings(body)), footnoteCount(body)),
      citeHtml: citeBox({
        canonical: pageUrl,
        mdHref: `${basePath}/${p.slug}.md`,
        txtHref: `${basePath}/${p.slug}.txt`,
        minutes: readingMinutes(plain),
        words: plain.trim().split(/\s+/).filter(Boolean).length,
      }),
      bodyEnd: navScript,
      mainHtml: articleHtml({
        title: p.title,
        publishedAt: p.publishedAt,
        byline: bylineOf(p),
        authorHref: authorHrefFor(p),
        canonical: pageUrl,
        category: CHANNEL_LABEL[channel],
        categoryHref: indexPath(channel),
        monthHref: monthHrefFor(p),
        bodyHtml: galleries ? `${bodyWithHero}\n${galleries}` : bodyWithHero,
        metaHtml: adjacentHtml(navPosts, `${basePath}/${p.slug}`),
        mdHref: `${basePath}/${p.slug}.md`,
        txtHref: `${basePath}/${p.slug}.txt`,
        readingMinutes: readingMinutes(plain),
        sectionNav,
      }),
    });
    await writePage(outDir, join(dir, p.slug), page);
    await writeFile(
      join(dir, `${p.slug}.md`),
      p.body?.length || p.commentary?.length
        ? postToMarkdownFile({
            title: p.title,
            slug: p.slug,
            channel,
            publishedAt: p.publishedAt,
            excerpt: p.excerpt,
            canonical: pageUrl,
            author: bylineOf(p),
            tags: p.tags,
            body,
            assetUrl: (a) =>
              a._ref
                ? (img(a._ref, "auto=format") ??
                  fileUrl(opts.projectId, opts.dataset, a._ref))
                : a.url,
          })
        : (p.markdown ?? "").replace(/\s*$/, "\n"),
    );
    await writeFile(join(dir, `${p.slug}.txt`), postText(p, pageUrl, body));
  }

  const PAGE_SIZE = 20;
  const listingSitemap: SitemapEntry[] = [];

  /**
   * Writes one listing — the section index, a tag archive, an author archive —
   * paginated so a long list never becomes one enormous page. Page 1 lives at
   * the listing root; later pages at `page/N/`.
   */
  const writeListing = async (listing: {
    /** Path under the section, "" for the section index. */
    at: string;
    title: string;
    description: string;
    posts: NavPost[];
    trail: { name: string; url: string }[];
    alternates?: { type: string; title: string; href: string }[];
    feed?: boolean;
    filter?: { tag?: string; author?: string; month?: string };
    /** The date control; omitted where picking a month would drop a filter. */
    dateNav?: string;
    /** The author control. */
    authorNav: string;
  }): Promise<void> => {
    const root = listing.at ? `${basePath}/${listing.at}` : basePath;
    const rootDir = join(
      outDir,
      ...root.split("/").filter(Boolean),
    );
    const pages = Math.max(1, Math.ceil(listing.posts.length / PAGE_SIZE));
    const card = (p: NavPost): IndexCard => ({
      title: p.title,
      url: p.url,
      date: p.date,
      category: p.category,
      excerpt: p.excerpt ?? "",
      imageUrl: p.imageUrl,
      author: p.author,
      authorHref: p.authorHref,
      categoryHref: p.categoryHref,
      monthHref: p.monthHref,
    });
    for (let page = 1; page <= pages; page += 1) {
      const slice = listing.posts.slice(
        (page - 1) * PAGE_SIZE,
        page * PAGE_SIZE,
      );
      const path = page === 1 ? root : `${root}/page/${page}`;
      const canonical = `${CHANNEL_ORIGIN[channel]}${path}`;
      const prevHref =
        page === 2 ? root || "/" : page > 2 ? `${root}/page/${page - 1}` : undefined;
      const nextHref = page < pages ? `${root}/page/${page + 1}` : undefined;
      const relLinks = [
        prevHref
          ? `<link rel="prev" href="${CHANNEL_ORIGIN[channel]}${prevHref}">`
          : "",
        nextHref
          ? `<link rel="next" href="${CHANNEL_ORIGIN[channel]}${nextHref}">`
          : "",
      ].join("");
      const title =
        page === 1 ? listing.title : `${listing.title} — page ${page}`;
      const pageDir =
        page === 1 ? rootDir : join(rootDir, "page", String(page));
      await writePage(
        outDir,
        pageDir,
        htmlPage({
          title,
          description: listing.description,
          canonical,
          channel,
          alternates: page === 1 ? listing.alternates : undefined,
          jsonld: [
            ...withOrg({
              "@context": "https://schema.org",
              "@type": "Blog",
              "@id": `${canonical}#blog`,
              name: title,
              description: listing.description,
              url: canonical,
            }),
            breadcrumbs(canonical, listing.trail),
          ],
          headExtra: `${feedLinks(meta)}${relLinks}`,
          chrome: chromeStamped,
          layoutClass: "is-index",
          leftRail: emptyRail(),
          citeHtml: filterBox(`${listing.authorNav}${listing.dateNav ?? ""}`),
          bodyEnd: navScript,
          mainHtml: indexMain(
            slice.map(card),
            { page, pages, prevHref, nextHref },
            {
              ...listing.filter,
              section: aggregated ? undefined : CHANNEL_LABEL[channel],
              index: pages > 1 ? `${root}/search.json` : undefined,
            },
            sectionNav,
          ),
        }),
      );
      listingSitemap.push({ loc: canonical });
    }
    // A listing of more than one page bakes every card with the text search
    // matches on, so search reaches the posts its other pages hold.
    if (pages > 1)
      await writeFile(
        join(rootDir, "search.json"),
        JSON.stringify(
          listing.posts.map((p) => [
            [p.title, p.excerpt, p.author, p.category].filter(Boolean).join(" "),
            cardHtml(card(p)),
          ]),
        ),
      );
    if (listing.feed)
      await writeFile(
        join(rootDir, "rss.xml"),
        rss(
          { channel, title: listing.title, description: listing.description },
          listing.posts.flatMap((n) => {
            const post = posts.find((p) => `${basePath}/${p.slug}` === n.url);
            return post ? [feedPost(post)] : [];
          }),
        ),
      );
  };

  await writeListing({
    at: "",
    title: host.title,
    description: host.description,
    posts: navPosts,
    dateNav: dateNav(),
    authorNav: authorNav(),
    trail: [
      { name: site.name, url: `${site.origin}/` },
      { name: host.title, url: indexUrl(channel) },
    ],
    alternates: [
      {
        type: "text/markdown",
        title: `${host.title} (Markdown)`,
        href: `${basePath}/index.md`,
      },
      {
        type: "text/plain",
        title: `${host.title} (plain text)`,
        href: `${basePath}/index.txt`,
      },
    ],
  });

  // Tags, authors and publication months each get a crawlable archive per
  // term, and a directory page lists the terms. Aggregates bake the month
  // and author archives, pooled across their sections — tag archives live
  // on the sections.
  const navOf = new Map(posts.map((p, i) => [p, navPosts[i]]));
  const termsFor = (at: ArchiveKind) =>
    archives[at].map((t) => ({
      ...t,
      posts: t.posts.map((p) => navOf.get(p) as NavPost),
    }));

  const taxonomies: {
    at: ArchiveKind;
    heading: string;
    noun: string;
    terms: { label: string; slug: string; posts: NavPost[] }[];
    filter: (label: string) => { tag?: string; author?: string; month?: string };
    describe: (label: string) => string;
    feed: boolean;
    /** The date control for a term's archive, if it offers one. */
    dateNav?: (slug: string) => string;
  }[] = [
    {
      at: "tags",
      heading: `${host.title} — Tags`,
      noun: "Tag",
      terms: termsFor("tags"),
      filter: (tag) => ({ tag }),
      describe: (tag) => `Posts tagged ${tag} in ${host.title}.`,
      feed: true,
    },
    {
      at: "authors",
      heading: `${host.title} — Authors`,
      noun: "Author",
      terms: termsFor("authors"),
      filter: (author) => ({ author }),
      describe: (author) => `Posts by ${author} in ${host.title}.`,
      // A pooled feed would repeat the sections' author feeds.
      feed: !aggregated,
    },
    {
      at: "months",
      heading: `${host.title} — Months`,
      noun: "Month",
      terms: termsFor("months"),
      filter: (month) => ({ month }),
      describe: (month) => `Posts from ${month} in ${host.title}.`,
      // A closed month never gains posts, so its feed would never update.
      feed: false,
      dateNav,
    },
  ];

  for (const taxonomy of taxonomies.filter((t) => ownKinds.includes(t.at))) {
    if (taxonomy.terms.length === 0) continue;
    for (const term of taxonomy.terms)
      await writeListing({
        at: `${taxonomy.at}/${term.slug}`,
        filter: taxonomy.filter(term.label),
        title: `${term.label} — ${host.title}`,
        description: taxonomy.describe(term.label),
        posts: term.posts,
        trail: [
          { name: site.name, url: `${site.origin}/` },
          { name: host.title, url: indexUrl(channel) },
          {
            name: `${taxonomy.noun}s`,
            url: `${CHANNEL_ORIGIN[channel]}${basePath}/${taxonomy.at}`,
          },
          {
            name: term.label,
            url: `${CHANNEL_ORIGIN[channel]}${basePath}/${taxonomy.at}/${term.slug}`,
          },
        ],
        feed: taxonomy.feed,
        dateNav: taxonomy.dateNav?.(term.slug),
        // On an author's archive the control names them, and "All authors"
        // returns to the index; elsewhere it leaves the listing as it is.
        authorNav:
          taxonomy.at === "authors"
            ? authorNav(term.label)
            : authorNav(undefined, `${basePath}/${taxonomy.at}/${term.slug}`),
      });

    const dirUrl = `${CHANNEL_ORIGIN[channel]}${basePath}/${taxonomy.at}`;
    const dirPath = join(
      outDir,
      ...`${basePath}/${taxonomy.at}`.split("/").filter(Boolean),
    );
    await writePage(
      outDir,
      dirPath,
      htmlPage({
        title: taxonomy.heading,
        description: `Every ${taxonomy.noun.toLowerCase()} in ${host.title}, with post counts.`,
        canonical: dirUrl,
        channel,
        jsonld: [
          ...withOrg({
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            "@id": `${dirUrl}#collection`,
            name: taxonomy.heading,
            url: dirUrl,
          }),
          breadcrumbs(dirUrl, [
            { name: site.name, url: `${site.origin}/` },
            { name: host.title, url: indexUrl(channel) },
            { name: `${taxonomy.noun}s`, url: dirUrl },
          ]),
        ],
        headExtra: feedLinks(meta),
        chrome: chromeStamped,
        leftRail: emptyRail(),
        mainHtml: termIndexMain(
          taxonomy.noun,
          taxonomy.terms.map((t) => ({
            label: t.label,
            href: `${basePath}/${taxonomy.at}/${t.slug}`,
            count: t.posts.length,
          })),
          basePath,
          sectionNav,
        ),
      }),
    );
    listingSitemap.push({ loc: dirUrl });
  }

  const indexEntries: IndexEntry[] = posts
    .filter((p) => !p.noIndex)
    .map((p) => ({
      title: p.title,
      url: postCanonical(p, postChannel(p)),
      date: p.publishedAt,
      excerpt: p.excerpt ?? "",
    }));
  await writeFile(
    join(dir, "index.md"),
    indexMarkdown(host.title, host.description, indexUrl(channel), indexEntries),
  );
  await writeFile(
    join(dir, "index.txt"),
    indexText(host.title, host.description, indexUrl(channel), indexEntries),
  );

  await writeFile(join(dir, "blog.css"), css);
  await writeFile(join(dir, "nav.js"), NAV_JS);
  if (needsLightbox) await writeFile(join(dir, "gallery.js"), LIGHTBOX_JS);

  await writeFile(join(dir, "rss.xml"), rss(meta, feedPosts));
  await writeFile(join(dir, "atom.xml"), atom(meta, feedPosts));
  await writeFile(
    join(dir, "sitemap.xml"),
    sitemap(
      [...new Map(
        [...sitemapEntries, ...listingSitemap].map((e) => [e.loc, e]),
      ).values()],
    ),
  );
  await writeFile(
    join(dir, "404.html"),
    notFoundHtml(chromeStamped, basePath, {
      sectionTitle: host.title,
      channel,
      recent: navPosts.map((p) => ({
        title: p.title,
        url: p.url,
        date: p.date,
        monthHref: p.monthHref,
      })),
    }),
  );
  await writeFile(
    join(dir, "llms.txt"),
    llmsTxt({
      hostTitle: host.title,
      lead: host.lead,
      channel,
      channelLabel: host.title,
      whenToUse: host.whenToUse,
      posts: feedPosts,
      citeElsewhere: host.citeElsewhere,
    }),
  );

  await writeChannelRedirects(outDir, channel, basePath, posts, aggregated);


  return { pages: posts.length + 1 };
}

/**
 * One `_redirects` block per section: 301s for every path a post used to live
 * at and a section-scoped 404 so a bad URL
 * under `/updates` lands on the Updates 404 rather than the corporate one.
 */
async function writeChannelRedirects(
  outDir: string,
  channel: Channel,
  basePath: string,
  posts: FetchedPost[],
  aggregated = false,
): Promise<void> {
  const rules: RedirectRule[] = [];

  // Every imported post keeps its legacy host URL as a 301 → its current
  // canonical. Emitted in the post's own section block so a post that moved
  // channels (e.g. Ghost → thought) still gets its rule. Ghost posts without
  // a recorded legacyUrl fall back to the slug-derived Ghost path.
  if (!aggregated) {
    for (const p of posts) {
      const fallback = legacyRedirect(p.channel ?? channel, p.slug);
      const from = p.legacyUrl
        ? ghostFromUrl(p.legacyUrl)
        : p.migrationSource === "ghost"
          ? fallback.from
          : null;
      if (!from) continue;
      rules.push({ from, to: fallback.to, force: true });
    }
  }

  // Post-level aliases live on the section the post is in — aggregates only
  // need their own 404.
  if (!aggregated) rules.push(...aliasRules(basePath, posts));

  // At a site root the section 404 is the site-wide catch-all, which the
  // file already ends on.
  if (basePath)
    rules.push({ from: `${basePath}/*`, to: `${basePath}/404.html`, status: 404 });

  const redirectsPath = join(outDir, "_redirects");
  let existing = "";
  try {
    existing = await readFile(redirectsPath, "utf8");
  } catch {
    existing = "/*    /404.html    404\n";
  }
  await writeFile(
    redirectsPath,
    mergeRedirectBlock(existing, `redirects:${channel}`, rules),
  );
}
