// The parts of a post page that follow the post being edited and its
// section's other posts. Every part is the renderer's own function over the
// values the bake would pass it, so the frame cannot drift from the site.
import {
  adjacentHtml,
  articleHtml,
  bylineHtml,
  citeBox,
  tocBox,
} from "../packages/renderer/src/page";
import {
  hostCats,
  leftRail,
  type NavPost,
} from "../packages/renderer/src/nav";
import {
  extractHeadings,
  footnoteCount,
  slugify,
  tocItems,
  type PTBlock,
} from "../packages/renderer/src/pt";
import {
  PUBLISHED_POSTS,
  bylineOf,
  monthKey,
  postPlain,
  readingMinutes,
} from "../packages/renderer/src/post";
import {
  CHANNEL_BASEPATH,
  CHANNEL_LABEL,
  canonicalFor,
  indexPath,
  indexUrl,
  type Channel,
} from "../packages/seo/src/index";

/**
 * The section's published posts, as the bake reads them (same filter and
 * order), with only the fields the rail, the byline, and the adjacent links
 * use.
 */
export const FRAME_POSTS_QUERY = `${PUBLISHED_POSTS} | order(publishedAt desc) {
  _id, title, "slug": slug.current, excerpt, publishedAt,
  "noIndex": seo.noIndex, "authors": authors[]->{ name },
  origin, externalUrl, outlet
}`;

/** One row of `FRAME_POSTS_QUERY`. */
export interface FrameRow {
  _id: string;
  title?: string;
  slug?: string;
  excerpt?: string;
  publishedAt: string;
  noIndex?: boolean;
  authors?: ({ name?: string } | null)[] | null;
  origin?: string;
  externalUrl?: string;
  outlet?: string;
}

/** The post in the editor, from its form value. */
export interface FramePost {
  /** The published document's id (no `drafts.` prefix). */
  id: string;
  title: string;
  slug: string;
  publishedAt: string;
  excerpt: string;
  /** Author names in the post's order. */
  authors: string[];
  origin?: string;
  outlet?: string;
  externalUrl?: string;
  noIndex?: boolean;
  /** The blocks the page shows: the body, or the commentary on coverage. */
  body: PTBlock[];
}

export interface FrameParts {
  byline: string;
  /** The right rail's post list. */
  rail: string;
  /** The contents box; empty under three headings, as on the site. */
  toc: string;
  cite: string;
  /**
   * The masthead's tools row, which narrow pages show in place of the left
   * rail: reading time, the contents toggle, and the copy buttons.
   */
  mastTools: string;
  /** Previous and next links; empty when the post has no neighbors. */
  adjacent: string;
}

interface Listed {
  id: string;
  title: string;
  slug: string;
  publishedAt: string;
  excerpt: string;
  authors: { name: string }[];
  origin?: string;
  outlet?: string;
  externalUrl?: string;
  noIndex?: boolean;
}

/**
 * A form value's blocks, less anything half-made: the renderer reads every
 * text block's children, and the editor can hold a block before it has any.
 */
export function frameBody(value: unknown): PTBlock[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (b): b is PTBlock =>
      Boolean(b) &&
      typeof b === "object" &&
      typeof b._type === "string" &&
      (b._type !== "block" || Array.isArray(b.children)),
  );
}

function dated(iso: string): boolean {
  return Boolean(iso) && !Number.isNaN(new Date(iso).getTime());
}

/**
 * The section's posts with the edited post standing in for its published
 * version, so the rail and the adjacent links show it as it would publish.
 * A post with no slug or date is not listed, as the bake would not list it.
 */
function listed(rows: FrameRow[], post: FramePost): Listed[] {
  const others = rows.flatMap((r): Listed[] =>
    r._id === post.id || !r.slug || !dated(r.publishedAt)
      ? []
      : [
          {
            id: r._id,
            title: r.title ?? "",
            slug: r.slug,
            publishedAt: r.publishedAt,
            excerpt: r.excerpt ?? "",
            // A reference to a deleted author names nobody.
            authors: (r.authors ?? []).flatMap((a) =>
              a?.name?.trim() ? [{ name: a.name }] : [],
            ),
            origin: r.origin,
            outlet: r.outlet,
            externalUrl: r.externalUrl,
            noIndex: r.noIndex,
          },
        ],
  );
  if (!post.slug || !dated(post.publishedAt)) return others;
  const mine: Listed = {
    ...post,
    authors: post.authors.map((name) => ({ name })),
  };
  return [mine, ...others].sort((a, b) =>
    b.publishedAt.localeCompare(a.publishedAt),
  );
}

export function frameParts(
  channel: Channel,
  rows: FrameRow[],
  post: FramePost,
): FrameParts {
  const base = CHANNEL_BASEPATH[channel];
  const posts = listed(rows, post);

  // The section bakes a month archive for every indexable post's month and
  // an author archive for every author of an indexable first-party post;
  // dates and names link only to an archive that exists.
  const indexable = posts.filter((p) => !p.noIndex);
  const months = new Set(indexable.map((p) => monthKey(p.publishedAt)));
  const authors = new Set(
    indexable.flatMap((p) =>
      p.origin === "external" ? [] : p.authors.map((a) => slugify(a.name.trim())),
    ),
  );
  const monthHref = (iso: string): string | undefined =>
    dated(iso) && months.has(monthKey(iso))
      ? `${base}/months/${monthKey(iso)}`
      : undefined;
  const first = post.authors[0]?.trim();
  const authorHref =
    first && post.origin !== "external" && authors.has(slugify(first))
      ? `${base}/authors/${slugify(first)}`
      : undefined;

  const navPosts: NavPost[] = posts.map((p) => ({
    title: p.title,
    url: `${base}/${p.slug}`,
    date: p.publishedAt,
    category: CHANNEL_LABEL[channel],
    categoryHref: indexUrl(channel),
    monthHref: monthHref(p.publishedAt),
    excerpt: p.excerpt,
    author: bylineOf(p),
  }));
  const here = `${base}/${post.slug}`;
  const plain = postPlain(post.body);
  const minutes = readingMinutes(plain);
  // The row is part of the masthead articleHtml writes; take it from there.
  const mast = articleHtml({
    title: "",
    publishedAt: "",
    bodyHtml: "",
    mdHref: `${here}.md`,
    txtHref: `${here}.txt`,
    readingMinutes: minutes,
  });

  return {
    byline: bylineHtml({
      publishedAt: post.publishedAt,
      byline: bylineOf({
        ...post,
        authors: post.authors.map((name) => ({ name })),
      }),
      authorHref,
      category: CHANNEL_LABEL[channel],
      categoryHref: indexPath(channel),
      monthHref: monthHref(post.publishedAt),
    }),
    rail: leftRail(navPosts, "", base, here, hostCats(channel)),
    toc: tocBox(
      tocItems(extractHeadings(post.body)),
      footnoteCount(post.body),
    ),
    cite: citeBox({
      canonical: post.slug ? canonicalFor(channel, post.slug) : indexUrl(channel),
      mdHref: `${here}.md`,
      txtHref: `${here}.txt`,
      minutes,
      words: plain.trim().split(/\s+/).filter(Boolean).length,
    }),
    mastTools: /<p class="mast-tools">([\s\S]*?)<\/p>/.exec(mast)?.[1] ?? "",
    adjacent: adjacentHtml(navPosts, here),
  };
}
