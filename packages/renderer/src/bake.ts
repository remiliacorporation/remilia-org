import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient, type SanityClient } from "@sanity/client";
import {
  type Channel,
  CHANNEL_BASEPATH,
  atom,
  blogPosting,
  breadcrumbs,
  canonicalFor,
  event as eventJsonLd,
  feedLinks,
  imageGallery,
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
  portableTextToHtml,
  tocItems,
  footnoteCount,
  type LinkCard,
  type PTBlock,
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
  type Chrome,
} from "./page";
import { leftRail, emptyRail, filterBar, NAV_JS, type NavPost } from "./nav";
import { galleryHtml, LIGHTBOX_JS } from "./gallery";
import { esc } from "./html";
import {
  aliasRules,
  mergeRedirectBlock,
  type RedirectRule,
} from "./redirects";
import {
  BakeRefused,
  EMPTY_BAKE_ESCAPE,
  readFailureMessage,
  refusalFor,
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

  extraSitemapUrls?: SitemapEntry[];

  /**
   * Publish a section that fetched zero posts. Off by default: an empty
   * result is almost always a missing `SANITY_TOKEN` or a broken query, and
   * baking it would replace every published post, feed and sitemap entry
   * with an empty index.
   */
  allowEmpty?: boolean;

  stylesheets: string[];
}

interface FetchedPost {
  title: string;
  slug: string;
  excerpt: string;
  publishedAt: string;
  updatedAt?: string;
  body: PTBlock[];
  markdown?: string;
  coverRef?: string;
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

const POSTS_QUERY = `*[_type == "post" && channel == $channel && defined(publishedAt) && !(_id in path("drafts.**"))] | order(publishedAt desc) {
  title, "slug": slug.current, excerpt, publishedAt, "updatedAt": _updatedAt, body, markdown,
  "coverRef": coverImage.asset._ref,
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

function postText(p: FetchedPost, canonical: string, body: PTBlock[]): string {
  return `${p.title}\n\n${p.publishedAt.slice(0, 10)} — ${canonical}\n\n${p.excerpt}\n\n${postPlain(body)}\n`;
}

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

export async function bake(opts: BakeOptions): Promise<{ pages: number }> {
  const { channel, chrome, outDir, host } = opts;
  const basePath = CHANNEL_BASEPATH[channel];
  const site = siteMetaFor(channel);
  const client: SanityClient = createClient({
    projectId: opts.projectId,
    dataset: opts.dataset,
    apiVersion: "2026-02-01",
    useCdn: !opts.token,
    token: opts.token,
    perspective: "published",
  });

  let posts: FetchedPost[];
  try {
    posts = await client.fetch<FetchedPost[]>(POSTS_QUERY, { channel });
  } catch (err) {
    throw new BakeRefused(`${readFailureMessage(err)} — refusing to bake`);
  }
  const refusal = opts.allowEmpty
    ? undefined
    : refusalFor({ token: opts.token, postCount: posts.length, what: channel });
  if (refusal) throw new BakeRefused(`${refusal}, or set ${EMPTY_BAKE_ESCAPE}`);
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
  const feedPosts = posts
    .filter((p) => !p.noIndex && !isExternalArchive(p, channel))
    .map((p) => ({ ...p, channel }));
  const sitemapEntries: SitemapEntry[] = [
    ...(opts.extraSitemapUrls ?? []),
    { loc: indexUrl(channel) },
    ...posts
      .filter((p) => !p.noIndex && !isExternalArchive(p, channel))
      .map((p) => ({
        loc: canonicalFor(channel, p.slug),
        lastmod: p.updatedAt ?? p.publishedAt,
      })),
  ];

  const dir = join(outDir, ...basePath.split("/").filter(Boolean));
  await mkdir(dir, { recursive: true });

  const cards = new Map<string, LinkCard>();
  for (const p of posts) {
    const card: LinkCard = {
      title: p.title,
      description: p.excerpt,
      imageUrl: img(p.coverRef, "w=640&auto=format"),
    };
    cards.set(canonicalFor(channel, p.slug), card);
    cards.set(`${basePath}/${p.slug}`, card);
  }

  const navPosts: NavPost[] = posts.map((p) => ({
    title: p.title,
    url: `${basePath}/${p.slug}`,
    date: p.publishedAt,
    category: p.tags?.[0] ?? "Uncategorized",
    excerpt: p.excerpt,
    imageUrl: img(p.coverRef, "w=1200&auto=format"),
    author: p.authors?.map((a) => a.name).join(", "),
  }));
  const rail = leftRail(navPosts, host.title, basePath);
  const navScript = `<script src="${basePath}/nav.js" defer></script>`;
  const linkCard = (href: string): LinkCard | undefined =>
    cards.get(href.replace(/\/$/, ""));
  const needsLightbox =
    channel === "events" && posts.some((p) => (p.albums?.length ?? 0) > 0);
  const galleryScript = needsLightbox
    ? `\n<script src="${basePath}/gallery.js" defer></script>`
    : "";

  const imgUrl = (b: {
    asset?: { _ref?: string; url?: string };
  }): string | undefined =>
    (b.asset?._ref ? img(b.asset._ref, "w=1600&auto=format") : undefined) ??
    b.asset?.url;

  for (const p of posts) {
    const pageUrl = canonicalFor(channel, p.slug);
    const canonical = postCanonical(p, channel);
    const body = postBody(p, channel);
    const bodyHtml = portableTextToHtml(body, {
      imageUrl: imgUrl,
      linkCard,
    });
    const galleries =
      channel === "events"
        ? (p.albums ?? [])
            .map((a) =>
              galleryHtml(
                a.title,
                a.images.flatMap((i) => {
                  const url = img(i.ref, "w=800&auto=format");
                  const fullUrl = img(i.ref, "w=2400&auto=format");
                  return url && fullUrl
                    ? [
                        {
                          url,
                          fullUrl,
                          alt: i.alt ?? "",
                          caption: i.caption,
                          credit: i.credit,
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
      chrome,
      leftRail: rail,
      tocHtml: tocBox(tocItems(extractHeadings(body)), footnoteCount(body)),
      citeHtml: citeBox({
        canonical: pageUrl,
        mdHref: `${basePath}/${p.slug}.md`,
        txtHref: `${basePath}/${p.slug}.txt`,
      }),
      bodyEnd: navScript,
      mainHtml: articleHtml({
        title: p.title,
        publishedAt: p.publishedAt,
        byline: p.authors?.map((a) => a.name).join(", "),
        authorHref: p.authors?.[0]?.name
          ? `${basePath}/?author=${encodeURIComponent(p.authors.map((a) => a.name).join(", "))}`
          : undefined,
        canonical: pageUrl,
        category: p.tags?.[0] ?? (p.outlet ? p.outlet : undefined),
        categoryHref: p.tags?.[0]
          ? `${basePath}/?cat=${encodeURIComponent(p.tags[0])}`
          : undefined,
        monthHref: `${basePath}/?month=${p.publishedAt.slice(0, 7)}`,
        bodyHtml: galleries ? `${bodyHtml}\n${galleries}` : bodyHtml,
        metaHtml: adjacentHtml(navPosts, `${basePath}/${p.slug}`),
        mdHref: `${basePath}/${p.slug}.md`,
        txtHref: `${basePath}/${p.slug}.txt`,
      }),
    });
    await mkdir(join(dir, p.slug), { recursive: true });
    await writeFile(join(dir, p.slug, "index.html"), page);
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
            author: p.authors?.map((a) => a.name).join(", "),
            tags: p.tags,
            body,
          })
        : (p.markdown ?? "").replace(/\s*$/, "\n"),
    );
    await writeFile(join(dir, `${p.slug}.txt`), postText(p, pageUrl, body));
  }

  await writeFile(
    join(dir, "index.html"),
    htmlPage({
      title: host.title,
      description: host.description,
      canonical: indexUrl(channel),
      channel,
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
      jsonld: [
        ...withOrg({
          "@context": "https://schema.org",
          "@type": "Blog",
          "@id": `${indexUrl(channel)}#blog`,
          name: host.title,
          description: host.description,
          url: indexUrl(channel),
        }),
        breadcrumbs(indexUrl(channel), [
          { name: site.name, url: `${site.origin}/` },
          { name: host.title, url: indexUrl(channel) },
        ]),
      ],
      headExtra: feedLinks(meta),
      chrome,
      layoutClass: "is-index",
      leftRail: emptyRail(),
      bodyEnd: navScript,
      mainHtml: indexMain(
        navPosts.map((p) => ({
          title: p.title,
          url: p.url,
          date: p.date,
          category: p.category,
          excerpt: p.excerpt ?? "",
          imageUrl: p.imageUrl,
          author: p.author,
        })),
        filterBar(navPosts),
        host.title,
      ),
    }),
  );

  const indexEntries: IndexEntry[] = posts
    .filter((p) => !p.noIndex)
    .map((p) => ({
      title: p.title,
      url: postCanonical(p, channel),
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

  const css = await Promise.all(
    opts.stylesheets.map((f) => readFile(f, "utf8")),
  );
  await writeFile(join(dir, "blog.css"), css.join("\n"));
  await writeFile(join(dir, "nav.js"), NAV_JS);
  if (needsLightbox) await writeFile(join(dir, "gallery.js"), LIGHTBOX_JS);

  await writeFile(join(dir, "rss.xml"), rss(meta, feedPosts));
  await writeFile(join(dir, "atom.xml"), atom(meta, feedPosts));
  await writeFile(join(dir, "sitemap.xml"), sitemap(sitemapEntries));
  await writeFile(
    join(dir, "404.html"),
    notFoundHtml(chrome, basePath, {
      sectionTitle: host.title,
      recent: navPosts.map((p) => ({
        title: p.title,
        url: p.url,
        date: p.date,
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

  await writeChannelRedirects(outDir, channel, basePath, posts);


  return { pages: posts.length + 1 };
}

/** Normalize Ghost-style URLs so Netlify host redirects match. */
function ghostFromUrl(url: string): string {
  const u = new URL(url);
  u.hash = "";
  u.search = "";
  let path = u.pathname;
  if (!path.endsWith("/")) path += "/";
  return `${u.origin}${path}`;
}

/**
 * One `_redirects` block per section: 301s for every path a post used to live
 * at, the Ghost host rules for press, and a section-scoped 404 so a bad URL
 * under `/updates` lands on the Updates 404 rather than the corporate one.
 */
async function writeChannelRedirects(
  outDir: string,
  channel: Channel,
  basePath: string,
  posts: FetchedPost[],
): Promise<void> {
  const rules: RedirectRule[] = [];

  if (channel === "press") {
    rules.push(
      {
        from: "https://blog.remilia.org/",
        to: `${indexUrl("press")}/`,
        force: true,
      },
      {
        from: "https://blog.remilia.org",
        to: `${indexUrl("press")}/`,
        force: true,
      },
    );
    for (const p of posts) {
      const fallback = legacyRedirect("press", p.slug);
      const from =
        p.legacyUrl && /^https?:\/\/blog\.remilia\.org\//i.test(p.legacyUrl)
          ? ghostFromUrl(p.legacyUrl)
          : p.migrationSource === "ghost"
            ? fallback.from
            : null;
      if (!from) continue;
      rules.push({ from, to: fallback.to, force: true });
    }
  }

  rules.push(...aliasRules(basePath, posts));

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
