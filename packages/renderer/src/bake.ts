import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient, type SanityClient } from "@sanity/client";
import {
  type Channel,
  CHANNEL_BASEPATH,
  atom,
  blogPosting,
  canonicalFor,
  event as eventJsonLd,
  eventUrl,
  feedLinks,
  imageGallery,
  indexUrl,
  llmsTxt,
  organization,
  rss,
  sitemap,
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
import { articleHtml, htmlPage, notFoundHtml, simpleMain, tocBox, type Chrome } from "./page";
import { leftRail, NAV_JS, type NavPost } from "./nav";
import { galleryHtml, LIGHTBOX_JS } from "./gallery";
import { esc } from "./html";

export interface BakeOptions {
  channel: Channel;
  chrome: Chrome;
  outDir: string;
  projectId: string;
  dataset: string;
  host: {
    title: string;
    description: string;
    lead: string;
    whenToUse: string[];
    citeElsewhere: { label: string; url: string }[];
  };
  /** Hand-authored pages already on the host (for the merged sitemap). */
  extraSitemapUrls?: SitemapEntry[];
  /**
   * CSS files concatenated (in order) into `<basePath>/blog.css` —
   * conventionally [hosts/core/blog-core.css, hosts/<host>/theme.css].
   */
  stylesheets: string[];
}

interface FetchedPost {
  title: string;
  slug: string;
  excerpt: string;
  publishedAt: string;
  updatedAt?: string;
  body: PTBlock[];
  coverRef?: string;
  authors?: { name: string; url?: string }[];
  tags?: string[];
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

interface FetchedEvent {
  title: string;
  slug: string;
  summary: string;
  startsAt: string;
  endsAt?: string;
  locationName?: string;
  url?: string;
  imageRef?: string;
  body?: PTBlock[];
  albums?: FetchedAlbum[];
}

/** image-<id>-<WxH>-<fmt> asset ref → CDN URL with params. */
export function cdnUrl(projectId: string, dataset: string, ref: string, params: string): string | undefined {
  const m = /^image-([a-f0-9]+)-(\d+x\d+)-(\w+)$/.exec(ref);
  if (!m) return undefined;
  return `https://cdn.sanity.io/images/${projectId}/${dataset}/${m[1]}-${m[2]}.${m[3]}?${params}`;
}

const POSTS_QUERY = `*[_type == "post" && channel == $channel && defined(publishedAt) && !(_id in path("drafts.**"))] | order(publishedAt desc) {
  title, "slug": slug.current, excerpt, publishedAt, "updatedAt": _updatedAt, body,
  "coverRef": coverImage.asset._ref,
  "authors": authors[]->{ name, url },
  "tags": tags[]->name
}`;

const EVENTS_QUERY = `*[_type == "event" && !(_id in path("drafts.**"))] | order(startsAt desc) {
  title, "slug": slug.current, summary, startsAt, endsAt, locationName, url,
  "imageRef": image.asset._ref, body,
  "albums": albums[]->{ title, "slug": slug.current, date, description,
    "images": images[]{ "ref": asset._ref, alt, caption, credit } }
}`;

const ORG_QUERY = `*[_id == "org"][0]{ name, legalName, sameAs, contactEmail, address,
  "logoRef": logo.asset._ref }`;

/** Naive markdown sibling for text/markdown negotiation. */
function postMarkdown(p: FetchedPost, canonical: string): string {
  const text = p.body
    .flatMap((b) => ("children" in b && Array.isArray(b.children) ? b.children : []))
    .map((s) => (s && typeof s === "object" && "text" in s ? String(s.text) : ""))
    .join("");
  return `# ${p.title}\n\n${p.publishedAt.slice(0, 10)} — ${canonical}\n\n> ${p.excerpt}\n\n${text}\n`;
}

export async function bake(opts: BakeOptions): Promise<{ pages: number }> {
  const { channel, chrome, outDir, host } = opts;
  const basePath = CHANNEL_BASEPATH[channel];
  const client: SanityClient = createClient({
    projectId: opts.projectId,
    dataset: opts.dataset,
    apiVersion: "2026-02-01",
    useCdn: true,
  });

  const posts = await client.fetch<FetchedPost[]>(POSTS_QUERY, { channel });
  const orgDoc = await client.fetch<(OrgInput & { logoRef?: string }) | null>(ORG_QUERY);
  const img = (ref: string | undefined, params: string): string | undefined =>
    ref ? cdnUrl(opts.projectId, opts.dataset, ref, params) : undefined;
  const orgLd = orgDoc
    ? organization({ ...orgDoc, logoUrl: img(orgDoc.logoRef, "w=512") })
    : undefined;
  const withOrg = (ld: object): object[] => (orgLd ? [ld, orgLd] : [ld]);

  const meta = { channel, title: host.title, description: host.description };
  const feedPosts = posts.map((p) => ({ ...p, channel }));
  const sitemapEntries: SitemapEntry[] = [
    ...(opts.extraSitemapUrls ?? []),
    { loc: indexUrl(channel) },
    ...posts.map((p) => ({ loc: canonicalFor(channel, p.slug), lastmod: p.updatedAt ?? p.publishedAt })),
  ];

  const dir = join(outDir, ...basePath.split("/").filter(Boolean));
  await mkdir(dir, { recursive: true });

  // Interlink hover cards: canonical AND path-relative URLs of every post
  // on this channel resolve to the same social-card data the target
  // page advertises.
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

  // Left rail: all posts on this channel (date-sorted; category = first tag).
  const navPosts: NavPost[] = posts.map((p) => ({
    title: p.title,
    url: `${basePath}/${p.slug}`,
    date: p.publishedAt,
    category: p.tags?.[0] ?? "Uncategorized",
  }));
  const rail = leftRail(navPosts, host.title, basePath);
  const navScript = `<script src="${basePath}/nav.js" defer></script>`;
  const linkCard = (href: string): LinkCard | undefined => cards.get(href.replace(/\/$/, ""));

  // Posts
  for (const p of posts) {
    const canonical = canonicalFor(channel, p.slug);
    const bodyHtml = portableTextToHtml(p.body, {
      imageUrl: (b) => img(b.asset?._ref, "w=1600&auto=format"),
      linkCard,
    });
    const page = htmlPage({
      title: `${p.title} — ${host.title}`,
      description: p.excerpt,
      canonical,
      jsonld: withOrg(blogPosting({ ...p, channel, coverImageUrl: img(p.coverRef, "w=1200&auto=format") })),
      headExtra: feedLinks(meta),
      chrome,
      leftRail: rail,
      tocHtml: tocBox(tocItems(extractHeadings(p.body)), footnoteCount(p.body)),
      bodyEnd: navScript,
      mainHtml: articleHtml({
        title: p.title,
        publishedAt: p.publishedAt,
        byline: p.authors?.map((a) => a.name).join(", "),
        category: p.tags?.[0],
        categoryHref: p.tags?.[0] ? `${basePath}/?cat=${encodeURIComponent(p.tags[0])}` : undefined,
        bodyHtml,
        metaHtml: `${p.tags?.length ? `Tags: ${p.tags.map((t) => esc(t)).join(", ")}<br>` : ""}Permalink: <i>${esc(canonical)}</i>`,
      }),
    });
    await mkdir(join(dir, p.slug), { recursive: true });
    await writeFile(join(dir, p.slug, "index.html"), page);
    await writeFile(join(dir, `${p.slug}.md`), postMarkdown(p, canonical));
  }

  // Index
  const listing = posts
    .map(
      (p) =>
        `<li><a href="${basePath}/${esc(p.slug)}"><h2>${esc(p.title)}</h2></a> <time datetime="${esc(p.publishedAt)}">${p.publishedAt.slice(0, 10)}</time><p>${esc(p.excerpt)}</p></li>`,
    )
    .join("\n");
  await writeFile(
    join(dir, "index.html"),
    htmlPage({
      title: host.title,
      description: host.description,
      canonical: indexUrl(channel),
      jsonld: withOrg({ "@context": "https://schema.org", "@type": "Blog", "@id": `${indexUrl(channel)}#blog`, name: host.title, description: host.description }),
      headExtra: feedLinks(meta),
      chrome,
      leftRail: rail,
      bodyEnd: navScript,
      mainHtml: simpleMain(`<h1>${esc(host.title)}</h1>\n<ul class="post-list">\n${listing}\n</ul>`),
    }),
  );

  // Events + albums (studio only)
  let eventPages = 0;
  if (channel === "studio") {
    const events = await client.fetch<FetchedEvent[]>(EVENTS_QUERY);
    for (const ev of events) {
      const canonical = eventUrl(ev.slug);
      const galleries = (ev.albums ?? [])
        .map((a) =>
          galleryHtml(
            a.title,
            a.images.flatMap((i) => {
              const url = img(i.ref, "w=800&auto=format");
              const fullUrl = img(i.ref, "w=2400&auto=format");
              return url && fullUrl ? [{ url, fullUrl, alt: i.alt ?? "", caption: i.caption, credit: i.credit }] : [];
            }),
          ),
        )
        .join("\n");
      const galleryLd = (ev.albums ?? []).map((a) =>
        imageGallery({
          title: a.title,
          description: a.description,
          pageUrl: canonical,
          images: a.images.flatMap((i) => {
            const url = img(i.ref, "w=2400&auto=format");
            return url ? [{ url, alt: i.alt ?? "", caption: i.caption, credit: i.credit }] : [];
          }),
        }),
      );
      const bodyHtml = ev.body
        ? portableTextToHtml(ev.body, { imageUrl: (b) => img(b.asset?._ref, "w=1600&auto=format") })
        : "";
      const page = htmlPage({
        title: `${ev.title} — ${host.title}`,
        description: ev.summary,
        canonical,
        jsonld: [...withOrg(eventJsonLd({ ...ev, imageUrl: img(ev.imageRef, "w=1200&auto=format") })), ...galleryLd],
        headExtra: `${feedLinks(meta)}\n<script src="${basePath}/gallery.js" defer></script>`,
        chrome,
        leftRail: rail,
        bodyEnd: navScript,
        mainHtml: simpleMain(`<header><h1>${esc(ev.title)}</h1><p><time datetime="${esc(ev.startsAt)}">${ev.startsAt.slice(0, 10)}</time>${ev.locationName ? ` — ${esc(ev.locationName)}` : ""}</p></header>\n<div class="prose">\n${bodyHtml}\n</div>\n${galleries}`),
      });
      await mkdir(join(dir, "events", ev.slug), { recursive: true });
      await writeFile(join(dir, "events", ev.slug, "index.html"), page);
      sitemapEntries.push({ loc: canonical, lastmod: ev.startsAt });
      eventPages++;
    }
    if (events.length > 0) {
      const evListing = events
        .map(
          (ev) =>
            `<li><a href="${basePath}/events/${esc(ev.slug)}"><h2>${esc(ev.title)}</h2></a> <time datetime="${esc(ev.startsAt)}">${ev.startsAt.slice(0, 10)}</time><p>${esc(ev.summary)}</p></li>`,
        )
        .join("\n");
      await mkdir(join(dir, "events"), { recursive: true });
      await writeFile(
        join(dir, "events", "index.html"),
        htmlPage({
          title: `Events — ${host.title}`,
          description: `Events from ${host.title}.`,
          canonical: `${indexUrl(channel)}/events`,

          jsonld: orgLd ? [orgLd] : [],
          headExtra: feedLinks(meta),
          chrome,
          leftRail: rail,
          bodyEnd: navScript,
          mainHtml: simpleMain(`<h1>Events</h1>\n<ul class="post-list">\n${evListing}\n</ul>`),
        }),
      );
      sitemapEntries.push({ loc: `${indexUrl(channel)}/events` });
      await writeFile(join(dir, "gallery.js"), LIGHTBOX_JS);
    }
  }

  // Feeds, sitemap, llms.txt, 404
  const css = await Promise.all(opts.stylesheets.map((f) => readFile(f, "utf8")));
  await writeFile(join(dir, "blog.css"), css.join("\n"));
  await writeFile(join(dir, "nav.js"), NAV_JS);

  await writeFile(join(dir, "rss.xml"), rss(meta, feedPosts));
  await writeFile(join(dir, "atom.xml"), atom(meta, feedPosts));
  await writeFile(join(dir, "sitemap.xml"), sitemap(sitemapEntries));
  await writeFile(join(dir, "404.html"), notFoundHtml(chrome, basePath));
  await writeFile(
    join(outDir, "llms.txt"),
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

  return { pages: posts.length + eventPages + 1 };
}
