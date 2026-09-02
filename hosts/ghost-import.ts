
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { markdownToPost, slugify } from "@remilia/renderer";
import { type Channel, isChannel } from "@remilia/seo";

const ORIGIN = "https://blog.remilia.org";

function decode(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function stripTags(html: string): string {
  return decode(html.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

export function fullImageUrl(url: string): string {
  return url.replace(/\/size\/w\d+\
}

function imgMarkdown(tag: string): string {
  const src = /src="([^"]+)"/.exec(tag)?.[1];
  if (!src || /kg-bookmark-icon|kg-bookmark-thumbnail/.test(tag)) return "";
  const alt = /alt="([^"]*)"/.exec(tag)?.[1] ?? "";
  return `![${decode(alt)}](${fullImageUrl(src)})`;
}

export function ghostHtmlToMarkdown(html: string): string {
  let h = html.replace(/\r/g, "");
  h = h.replace(/<script[\s\S]*?<\/script>/gi, "");
  h = h.replace(/<figure class="kg-card kg-bookmark-card[\s\S]*?<\/figure>/gi, (fig) => {
    const href = /href="([^"]+)"/.exec(fig)?.[1] ?? "";
    const title = /kg-bookmark-title">([\s\S]*?)<\//.exec(fig)?.[1] ?? href;
    return href ? `\n\n[${stripTags(title)}](${href})\n\n` : "";
  });
  h = h.replace(/<figure class="kg-card kg-embed-card[\s\S]*?<\/figure>/gi, (fig) => {
    const src = /<iframe[^>]+src="([^"]+)"/.exec(fig)?.[1];
    return src ? `\n\n${src}\n\n` : "";
  });
  h = h.replace(/<figure class="kg-card kg-video-card[\s\S]*?<\/figure>/gi, (fig) => {
    const src = /<video[^>]+src="([^"]+)"/.exec(fig)?.[1];
    const poster = /url\('([^']+)'\)/.exec(fig)?.[1];
    const bits = [poster ? `![](${fullImageUrl(poster)})` : "", src ?? ""].filter(Boolean);
    return bits.length ? `\n\n${bits.join("\n\n")}\n\n` : "";
  });
  h = h.replace(/<figure class="kg-card kg-gallery-card[\s\S]*?<\/figure>/gi, (fig) => {
    const imgs = [...fig.matchAll(/<img\b[^>]*>/gi)].map((m) => imgMarkdown(m[0])).filter(Boolean);
    return imgs.length ? `\n\n${imgs.join("\n\n")}\n\n` : "";
  });
  h = h.replace(/<figure[^>]*>[\s\S]*?<\/figure>/gi, (fig) => {
    const img = /<img\b[^>]*>/i.exec(fig)?.[0];
    const cap = /<figcaption[^>]*>([\s\S]*?)<\/figcaption>/i.exec(fig)?.[1];
    if (!img) return "";
    const md = imgMarkdown(img);
    if (!md) return "";
    if (cap && stripTags(cap)) return `\n\n${md.replace(/\)$/, ` "${stripTags(cap)}")`)}\n\n`;
    return `\n\n${md}\n\n`;
  });
  h = h.replace(/<img\b[^>]*>/gi, (tag) => {
    const md = imgMarkdown(tag);
    return md ? `\n\n${md}\n\n` : "";
  });
  h = h.replace(/<iframe[^>]+src="([^"]+)"[^>]*>[\s\S]*?<\/iframe>/gi, (_, src) => `\n\n${src}\n\n`);
  h = h.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_, t) => `\n\n## ${stripTags(t)}\n\n`);
  h = h.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_, t) => `\n\n### ${stripTags(t)}\n\n`);
  h = h.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, (_, t) => `\n\n#### ${stripTags(t)}\n\n`);
  h = h.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, t) => `\n\n> ${stripTags(t)}\n\n`);
  h = h.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, t) => `\n- ${inline(t)}\n`);
  h = h.replace(/<\/?(ul|ol)[^>]*>/gi, "\n");
  h = h.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_, t) => `\n\n${inline(t)}\n\n`);
  h = h.replace(/<br\s*\/?>/gi, "\n");
  h = h.replace(/<hr[^>]*>/gi, "\n\n");
  h = h.replace(/<[^>]+>/g, "");
  return decode(h).replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

function inline(html: string): string {
  return decode(
    html
      .replace(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, t) => {
        const label = stripTags(t);
        const path = href.match(/^https?:\/\/blog\.remilia\.org\/([^/?#]+)\/?$/);
        return path ? `[[${path[1]}|${label}]]` : `[${label}](${href})`;
      })
      .replace(/<(strong|b)>([\s\S]*?)<\/\1>/gi, "**$2**")
      .replace(/<(em|i)>([\s\S]*?)<\/\1>/gi, "*$2*")
      .replace(/<code>([\s\S]*?)<\/code>/gi, "`$1`")
      .replace(/<[^>]+>/g, ""),
  ).replace(/\s+/g, " ").trim();
}

function pick(html: string, re: RegExp): string | undefined {
  const m = re.exec(html);
  return m?.[1] ? decode(m[1]) : undefined;
}

function parsePostPage(url: string, html: string): {
  title: string;
  slug: string;
  publishedAt: string;
  excerpt: string;
  author?: string;
  tags: string[];
  cover?: string;
  markdown: string;
} {
  const slug = url.replace(/\/$/, "").split("/").pop() ?? "post";
  const title =
    pick(html, /<h1 class="post__title">([\s\S]*?)<\/h1>/) ??
    pick(html, /property="og:title" content="([^"]+)"/) ??
    slug;
  const excerpt =
    pick(html, /property="og:description" content="([^"]+)"/) ?? title;
  let ld: Record<string, unknown> = {};
  const ldRaw = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)?.[1];
  if (ldRaw) {
    try {
      ld = JSON.parse(ldRaw) as Record<string, unknown>;
    } catch {
      ld = {};
    }
  }
  const publishedAt =
    (typeof ld.datePublished === "string" && ld.datePublished) ||
    pick(html, /datetime="(\d{4}-\d{2}-\d{2})"/)?.concat("T00:00:00.000Z") ||
    "2021-01-01T00:00:00.000Z";
  const authorObj = ld.author;
  const author =
    authorObj && typeof authorObj === "object" && "name" in authorObj && typeof authorObj.name === "string"
      ? authorObj.name
      : undefined;
  const keywords = ld.keywords;
  const tags = Array.isArray(keywords)
    ? keywords.map(String)
    : typeof keywords === "string"
      ? keywords.split(/,\s*/).filter(Boolean)
      : [];
  const cover = pick(html, /property="og:image" content="([^"]+)"/);
  const bodyHtml =
    /<div class="post__content[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/section>/.exec(html)?.[1] ?? "";
  return { title, slug, publishedAt, excerpt, author, tags, cover, markdown: ghostHtmlToMarkdown(bodyHtml) };
}

async function sitemapLocs(path: string): Promise<string[]> {
  const res = await fetch(`${ORIGIN}${path}`);
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  const xml = await res.text();
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}

async function main() {
  const args = process.argv.slice(2);
  const chFlag = args.find((a, i) => args[i - 1] === "--channel");
  const channel: Channel = chFlag && isChannel(chFlag) ? chFlag : "press";
  const outFile = args.find((a, i) => args[i - 1] === "--out") ?? "ghost-posts.ndjson";

  const urls = (await sitemapLocs("/sitemap-posts.xml")).filter((u) => u.startsWith(`${ORIGIN}/`));
  const docs: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  const add = (doc: Record<string, unknown> & { _id: string }) => {
    if (seen.has(doc._id)) return;
    seen.add(doc._id);
    docs.push(doc);
  };

  let failed = 0;
  for (const url of urls) {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn("skip", url, res.status);
      failed += 1;
      continue;
    }
    const page = parsePostPage(url, await res.text());
    const { body } = markdownToPost(page.markdown, channel);
    const bodyWithAssets = body.map((b, i) => {
      if (b._type !== "image") return { ...b, _key: `b${i}` };
      const url = (b as { asset?: { url?: string } }).asset?.url;
      if (!url) return { ...b, _key: `b${i}` };
      const alt = (b as { alt?: string }).alt?.trim() || page.title;
      return {
        _type: "image",
        _key: `b${i}`,
        _sanityAsset: `image@${url}`,
        alt,
        caption: (b as { caption?: string }).caption,
      };
    });
    if (page.author) {
      const id = `author-${slugify(page.author)}`;
      add({
        _id: id,
        _type: "author",
        name: page.author,
        slug: { _type: "slug", current: slugify(page.author) },
      });
    }
    for (const name of page.tags) {
      add({
        _id: `tag-${slugify(name)}`,
        _type: "tag",
        name,
        slug: { _type: "slug", current: slugify(name) },
      });
    }
    const postId = (() => {
      const id = `post-${channel}-${page.slug}`;
      return id.length <= 128 ? id : `post-${channel}-${createHash("sha1").update(page.slug).digest("hex")}`;
    })();
    add({
      _id: postId,
      _type: "post",
      channel,
      title: page.title,
      slug: { _type: "slug", current: page.slug },
      publishedAt: page.publishedAt,
      excerpt: page.excerpt.slice(0, 300),
      body: bodyWithAssets,
      authors: page.author
        ? [{ _type: "reference", _ref: `author-${slugify(page.author)}`, _key: "a0" }]
        : undefined,
      tags: page.tags.map((name, i) => ({
        _type: "reference",
        _ref: `tag-${slugify(name)}`,
        _key: `t${i}`,
      })),
      coverImage: page.cover
        ? { _type: "image", _sanityAsset: `image@${page.cover}`, alt: page.title }
        : undefined,
      migration: { source: "ghost", legacyUrl: url },
    });
    process.stdout.write(".");
  }

  await writeFile(outFile, docs.map((d) => JSON.stringify(d)).join("\n") + "\n");
  const posts = docs.filter((d) => d._type === "post").length;
  console.log(`\nwrote ${docs.length} docs (${posts} posts, ${failed} failed) to ${outFile}`);
  console.log("import: npx sanity dataset import", outFile, "production");
  console.log("channel is", channel, "— retag sections in Studio if needed");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}

