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
  HOST_SECTIONS,
  atom,
  breadcrumbs,
  canonicalFor,
  feedLinks,
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
import { postToMarkdownFile } from "./md";
import {
  htmlPage,
  notFoundHtml,
  indexMain,
  cardHtml,
  type IndexCard,
  termIndexMain,
  type Chrome,
} from "./page";
import { NAV_JS, type NavPost } from "./nav";
import { bylineOf, outletOf, postPlain } from "./post";
import type { PTBlock } from "./pt";
import { LIGHTBOX_JS } from "./gallery";
import {
  AUTHORS_QUERY,
  POSTS_QUERY,
  type ArchiveKind,
  type FetchedPost,
  cdnUrl,
  fileUrl,
  isExternalArchive,
  postBody,
  postCanonical,
  sectionPages,
  withChannel,
} from "./section";
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

const ORG_QUERY = `*[_id == "org"][0]{ name, legalName, sameAs, contactEmail, address,
  "logoRef": logo.asset._ref }`;

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
  const navScript = `<script src="${stamp(`${basePath}/nav.js`, NAV_JS)}" defer></script>`;
  const needsLightbox =
    channel === "events" && posts.some((p) => (p.albums?.length ?? 0) > 0);
  const galleryScript = needsLightbox
    ? `\n<script src="${stamp(`${basePath}/gallery.js`, LIGHTBOX_JS)}" defer></script>`
    : "";

  const {
    meta,
    withOrg,
    archives,
    ownKinds,
    navPosts,
    sectionNav,
    rail,
    authorNav,
    postPage,
  } = sectionPages({
    channel,
    host,
    projectId: opts.projectId,
    dataset: opts.dataset,
    posts,
    hostPosts,
    aggregateOf: opts.aggregateOf,
    hostPooled: opts.hostPooled,
    chrome: chromeStamped,
    navScript,
    galleryScript,
    orgLd,
  });

  // Aggregates bake no post pages — each post already lives in its section.
  for (const p of aggregated ? [] : posts) {
    const pageUrl = canonicalFor(postChannel(p), p.slug);
    const body = postBody(p, postChannel(p));
    await writePage(outDir, join(dir, p.slug), postPage(p));
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
          leftRail: rail(undefined, listing.authorNav),
          sectionNav,
          bodyEnd: navScript,
          mainHtml: indexMain(
            slice.map(card),
            { page, pages, prevHref, nextHref },
            {
              ...listing.filter,
              section: aggregated ? undefined : CHANNEL_LABEL[channel],
              index: pages > 1 ? `${root}/search.json` : undefined,
            },
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
        leftRail: rail(),
        sectionNav,
        bodyEnd: navScript,
        mainHtml: termIndexMain(
          taxonomy.noun,
          taxonomy.terms.map((t) => ({
            label: t.label,
            href: `${basePath}/${taxonomy.at}/${t.slug}`,
            count: t.posts.length,
          })),
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
      bodyEnd: navScript,
      leftRail: rail(),
      sectionNav,
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

  // A listing shrinks when posts move or are unpublished, and a page past
  // its new end was a real URL once: it lands on the listing's first page.
  // Unforced, so every page that exists still answers itself.
  rules.push(
    { from: `${basePath}/page/:n`, to: basePath || "/" },
    ...["tags", "authors", "months"].map((kind) => ({
      from: `${basePath}/${kind}/:term/page/:n`,
      to: `${basePath}/${kind}/:term`,
    })),
  );

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
