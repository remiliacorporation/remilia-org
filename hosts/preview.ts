/**
 * Visual preview without Sanity content: renders a fixture post (modeled on
 * the live Ghost post "RemiliaNET Alpha v0.8.1") through the real renderer
 * + the org chrome, with left rail, ToC, sidenotes, and interlinks.
 *   node --import tsx hosts/preview.ts org /tmp/press-preview
 */
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  articleHtml,
  adjacentHtml,
  citeBox,
  extractHeadings,
  htmlPage,
  indexMain,
  leftRail,
  emptyRail,
  filterBar,
  NAV_JS,
  portableTextToHtml,
  tocBox,
  tocItems,
  footnoteCount,
  type NavPost,
  type PTBlock,
} from "@remilia/renderer";
import { blogPosting, canonicalFor, feedLinks, indexUrl } from "@remilia/seo";
import { chrome, host } from "./org/chrome";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = process.argv[3] ?? "/tmp/press-preview";

const p = (text: string): PTBlock => ({ _type: "block", children: [{ _type: "span", text }] });
const BODY: PTBlock[] = [
  { _type: "image", alt: "HIKKI PUNKS EXIT SOCIETY lookbook", caption: "HIKKI PUNKS EXIT SOCIETY, photographed by Shoichi Aoki", asset: { _ref: "hikki-cover" } },
  {
    _type: "block",
    children: [
      { _type: "span", text: "One of Remilia's biggest strengths is the creativity and initiative shown by its community. As RemiNET develops further, we felt it was time to support the community members who tinker with our platform" },
      { _type: "span", text: ", per the original roadmap", marks: ["f1"] },
      { _type: "span", text: "." },
    ],
    markDefs: [{ _key: "f1", _type: "footnote", text: "The developer platform was slated for the v0.8 line in the 2026 roadmap; this ships it a cycle early." }],
  },
  { _type: "block", style: "h2", children: [{ _type: "span", text: "Public API and Developer Portal" }] },
  p("RemiliaNET now provides a public API for developers building applications, backends, bots, scripts, and other integrations around the network."),
  {
    _type: "block",
    children: [
      { _type: "span", text: "The initial surface covers public profiles, account statistics, notifications, Beetle Game state, pokes, and global chat" },
      { _type: "span", text: ", each behind an explicit scope", marks: ["f2"] },
      { _type: "span", text: "." },
    ],
    markDefs: [{ _key: "f2", _type: "footnote", text: "Scopes are granted per application; an app only ever holds the permissions its integration declared at registration." }],
  },
  { _type: "block", style: "h3", children: [{ _type: "span", text: "Application types" }] },
  {
    _type: "block",
    children: [
      { _type: "span", text: "Two types are supported — see the " },
      { _type: "span", text: "developer portal", marks: ["l1"] },
      { _type: "span", text: " or the external " },
      { _type: "span", text: "OAuth 2.1 spec", marks: ["l2"] },
      { _type: "span", text: ". Login clients are for " },
      { _type: "span", text: "user-delegated", marks: ["em"] },
      { _type: "span", text: " actions" },
      { _type: "span", text: ", as first noted at launch", marks: ["l3"] },
      { _type: "span", text: "." },
    ],
    markDefs: [
      { _key: "l1", _type: "link", href: "https://www.remilia.net/developers" },
      { _key: "l2", _type: "link", href: "https://oauth.net/2.1/" },
      { _key: "l3", _type: "link", href: "https://remilia.org/press/remilianet-alpha-v0-8-1" },
    ],
  },
  { _type: "block", style: "h3", children: [{ _type: "span", text: "Credentials" }] },
  p("Credentials are issued through the portal and can be rotated at any time."),
  { _type: "image", alt: "Remilia Atelier pressbook spread", caption: "Remilia Atelier pressbook, Elena Velez", asset: { _ref: "atelier" } },
  { _type: "image", alt: "Hikkikimori look", caption: "HIKKIKIMORI CONDITION, photographed by Shoichi Aoki", asset: { _ref: "hikkikimori" } },
  { _type: "block", style: "h2", children: [{ _type: "span", text: "Fixes and Improvements" }] },
  { _type: "block", listItem: "bullet", children: [{ _type: "span", text: 'Fixed users occasionally appearing as "unknown" in global chat.' }] },
  { _type: "block", listItem: "bullet", children: [{ _type: "span", text: "Announcement images now expand to full-screen on hover." }] },
  { _type: "block", listItem: "bullet", children: [{ _type: "span", text: "Profile trophy counts now include all trophies owned." }] },
  { _type: "block", style: "blockquote", children: [{ _type: "span", text: "We'll see you on RemiNET." }] },
  { _type: "image", alt: "HIKKI PUNKS montage", caption: "HIKKI PUNKS EXIT SOCIETY lookbook montage", asset: { _ref: "montage" } },
  { _type: "image", alt: "RemiliaNET developer portal", caption: "RemiliaNET developer portal (UI screen)", asset: { _ref: "portal" } },
];

const post = {
  channel: "press" as const,
  slug: "remilianet-alpha-v0-8-1",
  title: "RemiliaNET Alpha v0.8.1: Remilia API and Developer Portal",
  excerpt: "RemiliaNET's public API and Developer Portal are now live, giving developers a new way to build apps, bots, and integrations around the network.",
  publishedAt: "2026-08-10T23:44:37.000Z",
  authors: [{ name: "Remilia Jackson" }],
  tags: ["Feature"],
};

// A few sibling posts so the left rail + search have something to show.
const navPosts: NavPost[] = [
  { title: post.title, url: `/press/${post.slug}`, date: post.publishedAt, category: "Feature", excerpt: post.excerpt, imageUrl: "https://storage.ghost.io/c/34/4d/344db379-6ee0-4527-979b-c712c2e2f368/content/images/2026/06/Hikki-Punks-Cover.jpg", author: "Remilia Jackson" },
  { title: "Remilia Q3 Company Update", url: "/press/q3-update", date: "2026-07-02T00:00:00Z", category: "Company", excerpt: "Quarterly notes from the studio.", author: "Remilia Jackson" },
  { title: "Milady Maker Featured in Press", url: "/press/milady-press", date: "2026-06-18T00:00:00Z", category: "Press", excerpt: "Coverage roundup.", author: "Remilia Jackson" },
  { title: "RemiliaNET Public Beta Opens", url: "/press/net-beta", date: "2026-05-30T00:00:00Z", category: "Feature", excerpt: "The network opens to the public.", author: "Remilia Jackson" },
  { title: "New Studio Partnership", url: "/press/studio-partnership", date: "2026-04-11T00:00:00Z", category: "Company", excerpt: "A new collaboration.", author: "Remilia Jackson" },
];

const canonical = canonicalFor(post.channel, post.slug);
const meta = { channel: post.channel, title: host.title, description: host.description };
const rail = leftRail(navPosts, host.title, "/press");
const bodyHtml = portableTextToHtml(BODY, {
  imageUrl: (img) =>
    ({
      "hikki-cover": "https://storage.ghost.io/c/34/4d/344db379-6ee0-4527-979b-c712c2e2f368/content/images/2026/06/Hikki-Punks-Cover.jpg",
      atelier: "https://storage.ghost.io/c/34/4d/344db379-6ee0-4527-979b-c712c2e2f368/content/images/2026/06/Remilia-Atelier-Pressbook-Spread.jpg",
      hikkikimori: "https://storage.ghost.io/c/34/4d/344db379-6ee0-4527-979b-c712c2e2f368/content/images/2026/06/Hikki-Punks-Hikkikimori.jpg",
      montage: "https://storage.ghost.io/c/34/4d/344db379-6ee0-4527-979b-c712c2e2f368/content/images/2026/06/Hikki-Punks-Montage.jpg",
      portal: "https://storage.ghost.io/c/34/4d/344db379-6ee0-4527-979b-c712c2e2f368/content/images/2026/08/image.png",
    } as Record<string, string>)[img.asset?._ref ?? ""] ??
    "https://storage.ghost.io/c/34/4d/344db379-6ee0-4527-979b-c712c2e2f368/content/images/2026/06/Hikki-Punks-Cover.jpg",
  linkCard: (href) =>
    href.includes("/press/remilianet-alpha-v0-8-1")
      ? { title: post.title, description: post.excerpt, imageUrl: "https://storage.ghost.io/c/34/4d/344db379-6ee0-4527-979b-c712c2e2f368/content/images/2026/06/Hikki-Punks-Cover.jpg" }
      : undefined,
});

await mkdir(join(outDir, "press", post.slug), { recursive: true });
const css = await Promise.all(
  [join(here, "core/blog-core.css"), join(here, "org/theme.css")].map((f) => readFile(f, "utf8")),
);
await writeFile(join(outDir, "press", "blog.css"), css.join("\n"));
await writeFile(join(outDir, "press", "nav.js"), NAV_JS);
await copyFile(join(here, "org/emblem.png"), join(outDir, "press", "emblem.png"));
await copyFile(join(here, "org/emblem.svg"), join(outDir, "press", "emblem.svg"));

await writeFile(
  join(outDir, "press", post.slug, "index.html"),
  htmlPage({
    title: `${post.title} — ${host.title}`,
    description: post.excerpt,
    canonical,
    jsonld: [blogPosting(post)],
    ogImage: "https://storage.ghost.io/c/34/4d/344db379-6ee0-4527-979b-c712c2e2f368/content/images/2026/06/Hikki-Punks-Cover.jpg",
    headExtra: feedLinks(meta),
    chrome,
    leftRail: rail,
    tocHtml: tocBox(tocItems(extractHeadings(BODY)), footnoteCount(BODY)),
    citeHtml: citeBox({
      canonical,
      mdHref: `/press/${post.slug}.md`,
      txtHref: `/press/${post.slug}.txt`,
    }),
    bodyEnd: `<script src="/press/nav.js" defer></script>`,
    mainHtml: articleHtml({
      title: post.title,
      publishedAt: post.publishedAt,
      byline: "Remilia Jackson",
      authorHref: "/press/?author=Remilia%20Jackson",
      canonical,
      category: "Feature",
      categoryHref: "/press/?cat=Feature",
      monthHref: "/press/?month=2026-08",
      bodyHtml,
      metaHtml: adjacentHtml(navPosts, `/press/${post.slug}`),
      mdHref: `/press/${post.slug}.md`,
      txtHref: `/press/${post.slug}.txt`,
    }),
  }),
);
const fixturePlain = BODY.flatMap((b) => ("children" in b && Array.isArray(b.children) ? b.children : []))
  .map((s) => (s && typeof s === "object" && "text" in s ? String(s.text) : ""))
  .join("");
await writeFile(
  join(outDir, "press", `${post.slug}.md`),
  `# ${post.title}\n\n${post.publishedAt.slice(0, 10)} — ${canonical}\n\n> ${post.excerpt}\n\n${fixturePlain}\n`,
);
await writeFile(
  join(outDir, "press", `${post.slug}.txt`),
  `${post.title}\n\n${post.publishedAt.slice(0, 10)} — ${canonical}\n\n${post.excerpt}\n\n${fixturePlain}\n`,
);

await writeFile(
  join(outDir, "press", "index.html"),
  htmlPage({
    title: host.title,
    description: host.description,
    canonical: indexUrl("press"),
    jsonld: [],
    headExtra: feedLinks(meta),
    chrome,
    layoutClass: "is-index",
    leftRail: emptyRail(),
    bodyEnd: `<script src="/press/nav.js" defer></script>`,
    mainHtml: indexMain(
      navPosts.map((n) => ({
        title: n.title,
        url: n.url,
        date: n.date,
        category: n.category,
        excerpt: n.excerpt ?? "",
        imageUrl: n.imageUrl,
        author: n.author,
      })),
      filterBar(navPosts),
    ),
  }),
);
console.log(`preview at ${outDir}/press/${post.slug}/`);

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".xml": "application/xml",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
};

if (process.argv.includes("--serve")) {
  const port = Number(process.env.PORT ?? 8477);
  const root = resolve(outDir);
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    let rel = decodeURIComponent(url.pathname);
    let file = resolve(root, `.${rel}`);
    if (!file.startsWith(root + sep) && file !== root) {
      res.writeHead(403).end();
      return;
    }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    if (!existsSync(file) || statSync(file).isDirectory()) {
      res.writeHead(404, { "content-type": "text/plain" }).end("not found");
      return;
    }
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    createReadStream(file).pipe(res);
  });
  server.listen(port, "0.0.0.0", () => {
    console.log(`http://127.0.0.1:${port}/press/${post.slug}/`);
  });
}
