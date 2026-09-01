import { type Channel, atomUrl, canonicalFor, indexUrl, rssUrl } from "./urls";

const esc = (s: string): string =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

export interface FeedPost {
  channel: Channel;
  slug: string;
  title: string;
  excerpt: string;
  publishedAt: string;
}

export interface ChannelMeta {
  channel: Channel;
  title: string;
  description: string;
}

export function rss(meta: ChannelMeta, posts: FeedPost[]): string {
  const items = posts
    .map((p) => {
      const url = canonicalFor(p.channel, p.slug);
      return `    <item>
      <title>${esc(p.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <description>${esc(p.excerpt)}</description>
      <pubDate>${new Date(p.publishedAt).toUTCString()}</pubDate>
    </item>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(meta.title)}</title>
    <link>${indexUrl(meta.channel)}</link>
    <atom:link href="${rssUrl(meta.channel)}" rel="self" type="application/rss+xml" />
    <description>${esc(meta.description)}</description>
    <language>en</language>
${items}
  </channel>
</rss>
`;
}

export function atom(meta: ChannelMeta, posts: FeedPost[]): string {
  const updated =
    posts.length > 0
      ? new Date(Math.max(...posts.map((p) => Date.parse(p.publishedAt)))).toISOString()
      : new Date(0).toISOString();
  const entries = posts
    .map((p) => {
      const url = canonicalFor(p.channel, p.slug);
      return `  <entry>
    <title>${esc(p.title)}</title>
    <link rel="alternate" type="text/html" href="${url}"/>
    <id>${url}</id>
    <updated>${new Date(p.publishedAt).toISOString()}</updated>
    <summary>${esc(p.excerpt)}</summary>
  </entry>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${esc(meta.title)}</title>
  <subtitle>${esc(meta.description)}</subtitle>
  <link rel="alternate" type="text/html" href="${indexUrl(meta.channel)}"/>
  <link rel="self" type="application/atom+xml" href="${atomUrl(meta.channel)}"/>
  <id>${indexUrl(meta.channel)}</id>
  <updated>${updated}</updated>
${entries}
</feed>
`;
}

export function feedLinks(meta: ChannelMeta): string {
  return (
    `<link rel="alternate" type="application/rss+xml" title="${esc(meta.title)}" href="${rssUrl(meta.channel)}">\n` +
    `<link rel="alternate" type="application/atom+xml" title="${esc(meta.title)}" href="${atomUrl(meta.channel)}">`
  );
}

export interface SitemapEntry {
  loc: string;
  lastmod?: string;
}

export function sitemap(entries: SitemapEntry[]): string {
  const urls = entries
    .map(
      (e) =>
        `  <url>\n    <loc>${esc(e.loc)}</loc>${
          e.lastmod ? `\n    <lastmod>${e.lastmod.slice(0, 10)}</lastmod>` : ""
        }\n  </url>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

export interface LlmsTxtInput {
  hostTitle: string;
  lead: string;
  channel: Channel;
  channelLabel: string;

  whenToUse: string[];
  posts: FeedPost[];

  citeElsewhere: { label: string; url: string }[];
  maxPosts?: number;
}

export function llmsTxt(input: LlmsTxtInput): string {
  const posts = input.posts
    .slice(0, input.maxPosts ?? 10)
    .map((p) => `- [${p.title}](${canonicalFor(p.channel, p.slug)}): ${p.excerpt}`)
    .join("\n");
  const cites = input.citeElsewhere.map((c) => `- [${c.label}](${c.url})`).join("\n");
  const uses = input.whenToUse.map((u) => `- ${u}`).join("\n");
  return `# ${input.hostTitle}

> ${input.lead}

## When to use this site

${uses}

## ${input.channelLabel}

- [Index](${indexUrl(input.channel)})
- [RSS](${rssUrl(input.channel)})
${posts}

## Cite elsewhere

${cites}
`;
}

