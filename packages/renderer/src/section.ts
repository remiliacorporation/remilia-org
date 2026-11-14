// A section's pages from its posts, with no file or network access: the parts
// every page shares (the rails, archive links, link cards) and a post's page.
// The bake writes these pages; the Studio's Preview draws a draft with them.
import {
  type Channel,
  CHANNEL_BASEPATH,
  CHANNEL_HOST,
  CHANNEL_LABEL,
  HOST_AGGREGATE,
  blogPosting,
  isCoverageChannel,
  breadcrumbs,
  canonicalFor,
  event as eventJsonLd,
  feedLinks,
  imageGallery,
  indexPath,
  indexUrl,
  siteMetaFor,
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
import { markdownToPost } from "./md";
import {
  articleHtml,
  citeBox,
  htmlPage,
  tocBox,
  adjacentHtml,
  type Chrome,
} from "./page";
import {
  leftRail,
  authorSel,
  hostCats,
  sectionNav as sectionRow,
  type NavPost,
} from "./nav";
import {
  PUBLISHED_POSTS,
  bylineOf,
  monthKey,
  postTitle,
  postPlain,
  readingMinutes,
} from "./post";
import { lowerFootnotes } from "./footnotes";
import { galleryHtml } from "./gallery";

export interface FetchedPost {
  _id?: string;
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
export function fileUrl(
  projectId: string,
  dataset: string,
  ref: string,
): string | undefined {
  const m = /^file-([a-f0-9]+)-(\w+)$/.exec(ref);
  if (!m) return undefined;
  return `https://cdn.sanity.io/files/${projectId}/${dataset}/${m[1]}.${m[2]}`;
}

/** A post document as the bake reads it (one `FetchedPost`). */
export const POST_PROJECTION = `{
  _id, title, "slug": slug.current, excerpt, publishedAt, "updatedAt": _updatedAt, body, markdown,
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

export const POSTS_QUERY = `${PUBLISHED_POSTS} | order(publishedAt desc) ${POST_PROJECTION}`;

// Just enough of a sibling section's posts to know who writes on the host.
export const AUTHORS_QUERY = `${PUBLISHED_POSTS} {
  publishedAt, "noIndex": seo.noIndex, "authors": authors[]->{ name }, origin
}`;

/** The blocks a post's page shows, with its notes in the renderer's shape. */
export function postBody(p: FetchedPost, channel: Channel): PTBlock[] {
  return lowerFootnotes(shownBlocks(p, channel));
}

function shownBlocks(p: FetchedPost, channel: Channel): PTBlock[] {
  if (
    isCoverageChannel(channel) &&
    p.origin === "external" &&
    p.commentary?.length
  ) {
    return p.commentary;
  }
  if (p.body?.length) return p.body;
  if (p.markdown?.trim()) return markdownToPost(p.markdown, channel).body;
  if (isCoverageChannel(channel) && p.origin === "external") {
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

export function postCanonical(p: FetchedPost, channel: Channel): string {
  if (isCoverageChannel(channel) && p.origin === "external" && p.externalUrl) {
    return p.externalUrl;
  }
  return canonicalFor(channel, p.slug);
}

export function isExternalCoverage(p: FetchedPost, channel: Channel): boolean {
  return isCoverageChannel(channel) && p.origin === "external" && Boolean(p.externalUrl);
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
export type ArchiveKind = "tags" | "authors" | "months";

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

/**
 * A fetched post filed under its section. A reference to a deleted author
 * document dereferences to null; it names nobody, so it is dropped.
 */
export function withChannel(p: FetchedPost, channel: Channel): FetchedPost {
  return {
    ...p,
    channel,
    authors: p.authors?.filter((a) => Boolean(a?.name?.trim())),
  };
}

export interface SectionInput {
  channel: Channel;
  host: { title: string; description: string };
  projectId: string;
  dataset: string;
  /** The listing's posts, newest first, each filed by `withChannel`. */
  posts: FetchedPost[];
  /** Every post on the host, for the Author control (see `BakeOptions`). */
  hostPosts: FetchedPost[];
  aggregateOf?: Channel[];
  /** The sections the host's pooled index lists (see `BakeOptions`). */
  hostPooled?: Channel[];
  chrome: Chrome;
  /** The tag that loads nav.js at the end of every page. */
  navScript: string;
  /** Head markup that loads the lightbox, for a section with albums. */
  galleryScript?: string;
  /** The organization's JSON-LD, added to every page that has its own. */
  orgLd?: object;
}

/** The parts of a section's pages that follow its posts, and a post's page. */
export function sectionPages(o: SectionInput) {
  const { channel, host, posts } = o;
  const basePath = CHANNEL_BASEPATH[channel];
  const site = siteMetaFor(channel);
  const aggregated = !!o.aggregateOf;
  const postChannel = (p: FetchedPost): Channel => p.channel ?? channel;
  const postBase = (p: FetchedPost): string => CHANNEL_BASEPATH[postChannel(p)];
  const img = (ref: string | undefined, params: string): string | undefined =>
    ref ? cdnUrl(o.projectId, o.dataset, ref, params) : undefined;
  const withOrg = (ld: object): object[] => (o.orgLd ? [ld, o.orgLd] : [ld]);
  const meta = { channel, title: host.title, description: host.description };

  const cards = new Map<string, LinkCard>();
  for (const p of posts) {
    const coverDims = imageDims(p.coverRef);
    const card: LinkCard = {
      title: p.title,
      description: p.excerpt,
      imageUrl: img(p.coverRef, "w=640&auto=format"),
      imageWidth: coverDims?.w,
      imageHeight: coverDims?.h,
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
  const hostAuthors = termArchives(o.hostPosts).authors;
  // Authors the pooled index bakes an archive for: those with a post in a
  // pooled section. A section left out of the pool (org Press) links only
  // its own author archives.
  const pooledAuthors = o.hostPooled
    ? termArchives(
        o.hostPosts.filter((p) => o.hostPooled?.includes(postChannel(p))),
      ).authors
    : [];
  const bakedArchives = new Set([
    ...archivePaths(basePath, archives, ownKinds),
    ...(o.aggregateOf ?? []).flatMap((c) =>
      archivePaths(
        CHANNEL_BASEPATH[c],
        termArchives(posts.filter((p) => postChannel(p) === c)),
        ARCHIVE_KINDS,
      ),
    ),
    ...(o.hostPooled && !aggregated
      ? pooledAuthors.map((t) => `${pooledBase}/authors/${t.slug}`)
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
  const sharedCats = hostCats(channel, aggregated);
  const sectionNav = sectionRow(sharedCats);
  // The search box is the same on every page: the search with the author
  // control on its line, and the section's posts. It closes the right rail;
  // the section links are the left rail's box.
  const rail = (currentUrl?: string, author = authorNav()): string =>
    leftRail(navPosts, host.title, basePath, currentUrl, sharedCats, author);
  const linkCard = (href: string): LinkCard | undefined =>
    cards.get(href.replace(/\/$/, ""));

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

  /** A post's page, as the bake writes it at `<section>/<slug>`. */
  const postPage = (p: FetchedPost): string => {
    const pageUrl = canonicalFor(postChannel(p), p.slug);
    const canonical = postCanonical(p, postChannel(p));
    const body = postBody(p, postChannel(p));
    const plain = postPlain(body);
    const bodyHtml = portableTextToHtml(body, {
      imageUrl: imgUrl,
      imageSrcSet: imgSrcSet,
      videoUrl: (b) =>
        (b.file?.asset?._ref
          ? fileUrl(o.projectId, o.dataset, b.file.asset._ref)
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
    return htmlPage({
      title: p.seoTitle?.trim() || postTitle(p),
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
      headExtra: `${feedLinks(meta)}${o.galleryScript ?? ""}`,
      chrome: o.chrome,
      leftRail: rail(`${basePath}/${p.slug}`),
      sectionNav,
      tocHtml: tocBox(tocItems(extractHeadings(body)), footnoteCount(body)),
      readHtml: citeBox({
        canonical: pageUrl,
        mdHref: `${basePath}/${p.slug}.md`,
        txtHref: `${basePath}/${p.slug}.txt`,
        minutes: readingMinutes(plain),
        words: plain.trim().split(/\s+/).filter(Boolean).length,
      }),
      bodyEnd: o.navScript,
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
      }),
    });
  };

  return {
    meta,
    withOrg,
    archives,
    ownKinds,
    navPosts,
    sectionNav,
    rail,
    authorNav,
    postPage,
  };
}
