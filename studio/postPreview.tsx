// The post's Preview tab: the draft (or the published post, when there is no
// draft) as the bake writes its page, by the bake's own page function, with
// the site's stylesheet and scripts, in a frame as wide as the pane.
//
// The frame is sandboxed without same-origin access: its page cannot reach
// the Studio, its session, or its storage. It talks to the Studio only by
// postMessage (see `bridge`). The draft never leaves the browser: the only
// reads are the section's published posts and the documents the draft
// references, by id.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useClient, type SanityDocument } from "sanity";
import {
  AUTHORS_QUERY,
  POSTS_QUERY,
  sectionPages,
  withChannel,
  type FetchedPost,
} from "../packages/renderer/src/section";
import { safeHref } from "../packages/renderer/src/html";
import type { PTBlock } from "../packages/renderer/src/pt";
import { NAV_JS } from "../packages/renderer/src/nav";
import { LIGHTBOX_JS } from "../packages/renderer/src/gallery";
import {
  CHANNEL_HOST,
  CHANNEL_ORIGIN,
  HOST_SECTIONS,
  type Channel,
} from "../packages/seo/src/index";
import { chromeFor, hostFor } from "../hosts/core/sections";
import { BLOG_CSS, frameChannel } from "./pageFrame";
import emblemUrl from "../deploy/assets/emblem.svg?url";

// Inlined: a frame with no origin of its own can load no font from the
// Studio, and the site sends no CORS headers.
const fonts = import.meta.glob<string>("../deploy/assets/fonts/*", {
  query: "?inline",
  import: "default",
  eager: true,
});

const dataUrl = (text: string, type: string) =>
  `data:${type};charset=utf-8,${encodeURIComponent(text)}`;

/** The bake's blog.css, nav.js and gallery.js, as data the frame can load. */
let assets: { css: string; nav: string; gallery: string } | undefined;
function siteAssets(): NonNullable<typeof assets> {
  assets ??= {
    css: dataUrl(
      BLOG_CSS.replace(
        /url\("\/assets\/fonts\/([^"]+)"\)/g,
        (rule, name) => {
          const url = fonts[`../deploy/assets/fonts/${name}`];
          return url ? `url("${url}")` : rule;
        },
      ),
      "text/css",
    ),
    nav: dataUrl(NAV_JS, "text/javascript"),
    gallery: dataUrl(LIGHTBOX_JS, "text/javascript"),
  };
  return assets;
}

// The section's other posts carry only what their rail rows and link cards
// show; the edited post comes from the form.
const LISTED_QUERY = `${POSTS_QUERY}{ ..., "body": null, "markdown": null, "commentary": null, "albums": null }`;

interface Section {
  channel: Channel;
  posts: FetchedPost[];
  siblings: FetchedPost[];
}

/** The host's published posts, as the bake reads them (no future posts). */
function useSection(channel: Channel, onError: (e: string | null) => void) {
  const client = useClient({ apiVersion: "2026-02-01" });
  const [section, setSection] = useState<Section | null>(null);
  useEffect(() => {
    let cancelled = false;
    const read = client.withConfig({ perspective: "published" });
    const others = HOST_SECTIONS[CHANNEL_HOST[channel]].filter(
      (c) => c !== channel,
    );
    const params = (c: Channel) => ({ channel: c, includeFuture: false });
    Promise.all([
      read.fetch<FetchedPost[]>(LISTED_QUERY, params(channel)),
      ...others.map(async (c) =>
        (await read.fetch<FetchedPost[]>(AUTHORS_QUERY, params(c))).map((p) =>
          withChannel(p, c),
        ),
      ),
    ])
      .then(([posts, ...siblings]) => {
        if (cancelled) return;
        onError(null);
        setSection({
          channel,
          posts: posts.map((p) => withChannel(p, channel)),
          siblings: siblings.flat(),
        });
      })
      .catch(() => {
        if (!cancelled) onError("The section's posts could not be read.");
      });
    return () => {
      cancelled = true;
    };
  }, [client, channel, onError]);
  return section?.channel === channel ? section : null;
}

interface Ref {
  _ref?: string;
}

/** The post document's fields that POST_PROJECTION reads. */
interface PostDoc {
  _id?: string;
  _updatedAt?: string;
  title?: string;
  slug?: { current?: string };
  excerpt?: string;
  publishedAt?: string;
  body?: PTBlock[];
  markdown?: string;
  coverImage?: { asset?: Ref; alt?: string };
  seo?: {
    ogImage?: { asset?: Ref };
    metaTitle?: string;
    metaDescription?: string;
    noIndex?: boolean;
  };
  authors?: Ref[];
  tags?: Ref[];
  albums?: Ref[];
  origin?: FetchedPost["origin"];
  externalUrl?: string;
  outlet?: string;
  commentary?: PTBlock[];
  startsAt?: string;
  endsAt?: string;
  locationName?: string;
  migration?: { legacyUrl?: string; source?: string };
  aliases?: string[];
}

/** An author, tag or album, with the fields POST_PROJECTION takes from it. */
interface Referenced {
  _id: string;
  name?: string;
  url?: string;
  title?: string;
  slug?: string;
  date?: string;
  description?: string;
  images?: NonNullable<FetchedPost["albums"]>[number]["images"];
}

const REFS_QUERY = `*[_id in $ids]{ _id, name, url, title, "slug": slug.current, date, description,
  "images": images[]{ "ref": asset._ref, alt, caption, credit } }`;

const refIds = (doc: PostDoc): string[] =>
  [
    ...new Set(
      [...(doc.authors ?? []), ...(doc.tags ?? []), ...(doc.albums ?? [])]
        .map((r) => r?._ref)
        .filter((id): id is string => !!id),
    ),
  ].sort();

/**
 * POST_PROJECTION (packages/renderer/src/section.ts), run here over the form's
 * value, so the draft is shaped as the bake shapes a post. Keep the two in
 * step.
 */
function projectPost(
  d: PostDoc,
  refs: ReadonlyMap<string, Referenced>,
): FetchedPost {
  const deref = (list?: Ref[]) =>
    list
      ?.map((r) => (r?._ref ? refs.get(r._ref) : undefined))
      .filter((r): r is Referenced => !!r);
  return {
    _id: d._id,
    title: d.title ?? "",
    slug: d.slug?.current ?? "",
    excerpt: d.excerpt ?? "",
    publishedAt: d.publishedAt ?? "",
    updatedAt: d._updatedAt,
    body: d.body ?? [],
    markdown: d.markdown,
    coverRef: d.coverImage?.asset?._ref,
    coverAlt: d.coverImage?.alt,
    ogImageRef: d.seo?.ogImage?.asset?._ref ?? d.coverImage?.asset?._ref,
    seoTitle: d.seo?.metaTitle,
    seoDescription: d.seo?.metaDescription,
    noIndex: d.seo?.noIndex,
    authors: deref(d.authors)?.map((a) => ({ name: a.name ?? "", url: a.url })),
    tags: deref(d.tags)?.map((t) => t.name ?? ""),
    origin: d.origin,
    externalUrl: d.externalUrl,
    outlet: d.outlet,
    commentary: d.commentary,
    startsAt: d.startsAt,
    endsAt: d.endsAt,
    locationName: d.locationName,
    legacyUrl: d.migration?.legacyUrl,
    aliases: d.aliases,
    migrationSource: d.migration?.source,
    albums: deref(d.albums)?.map((a) => ({
      title: a.title ?? "",
      slug: a.slug ?? "",
      date: a.date,
      description: a.description,
      images: a.images ?? [],
    })),
  };
}

/**
 * The document in the bake's shape, a moment after typing stops. Only the
 * ids it references are sent, and only when that set changes; its text stays
 * here. Until they are read the last shape stays.
 */
function useShownPost(
  doc: Partial<SanityDocument>,
  onError: (e: string | null) => void,
): FetchedPost | null {
  const client = useClient({ apiVersion: "2026-02-01" });
  const [settled, setSettled] = useState(doc as PostDoc);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(doc as PostDoc), 250);
    return () => clearTimeout(timer);
  }, [doc]);
  const ids = refIds(settled).join(",");
  const cache = useRef(new Map<string, Referenced>());
  const [readIds, setReadIds] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const wanted = ids ? ids.split(",") : [];
    const missing = wanted.filter((id) => !cache.current.has(id));
    if (!missing.length) {
      setReadIds(ids);
      return;
    }
    client
      .withConfig({ perspective: "published" })
      .fetch<Referenced[]>(REFS_QUERY, { ids: missing })
      .then((found) => {
        if (cancelled) return;
        for (const r of found) cache.current.set(r._id, r);
        onError(null);
        setReadIds(ids);
      })
      .catch(() => {
        if (!cancelled)
          onError("The post's authors, tags, or albums could not be read.");
      });
    return () => {
      cancelled = true;
    };
  }, [client, ids, onError]);
  const last = useRef<FetchedPost | null>(null);
  return useMemo(() => {
    if (readIds === ids) last.current = projectPost(settled, cache.current);
    return last.current;
  }, [settled, ids, readIds]);
}

/** The page the bake would write for `shown`, among its section's posts. */
function pageHtml(
  section: Section,
  shown: FetchedPost,
  id: string,
  config: { projectId?: string; dataset?: string },
): string {
  const { channel } = section;
  // A draft has no date or slug until it is given one; the page shows today
  // and the section's address until then.
  const post = withChannel(
    {
      ...shown,
      publishedAt: shown.publishedAt || new Date().toISOString(),
    },
    channel,
  );
  // The post stands in for its published version, where the bake lists it.
  const posts = [
    ...section.posts.filter((p) => p._id !== id),
    ...(shown.slug ? [post] : []),
  ].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const { css, nav, gallery } = siteAssets();
  return (
    sectionPages({
      channel,
      host: hostFor(channel),
      projectId: config.projectId ?? "8x9419lh",
      dataset: config.dataset ?? "production",
      posts,
      hostPosts: [...posts, ...section.siblings],
      // Every host bakes its pooled index (hosts/*/bake.ts).
      hostPooled: true,
      chrome: { ...chromeFor(channel), stylesheet: css },
      // nav.js lays the notes out from the text as set in the site's font. A
      // page from the site has its fonts by then; a frame starts loading them
      // only when nav.js first measures, and the notes came out in a narrower
      // margin. Here nav.js starts once they are in, or after 1.5 seconds.
      navScript: `<script>Promise.race([Promise.all([...document.fonts].filter((f) => f.family.includes("Alte Haas")).map((f) => f.load())), new Promise((r) => setTimeout(r, 1500))]).finally(() => document.body.append(Object.assign(document.createElement("script"), { src: "${nav}" })));</script>`,
      galleryScript:
        channel === "events" && post.albums?.length
          ? `\n<script src="${gallery}" defer></script>`
          : "",
    })
      .postPage(post)
      // Its own address is its base, so a contents link moves within it.
      .replace("<head>", '<head>\n<base href="about:srcdoc">')
      // A frame of no origin loads a lazy image only once it is in view; a
      // page on the site loads it well ahead, and lays the notes out around
      // it. Here every image loads at once.
      .replaceAll(' loading="lazy"', "")
      .replaceAll(
        'href="/assets/emblem.svg"',
        `href="${new URL(emblemUrl, location.href).href}"`,
      )
  );
}

// What the frame may tell the Studio, and the theme keys it may keep.
const MESSAGE = "remilia-preview";
const THEME_KEYS = new Set(["remilia-hue", "remilia-scheme", "remilia-dots"]);

/**
 * The theme chosen in the preview, kept for the next page in this pane's
 * frames while the Studio is open. It never reaches the Studio's storage.
 */
const theme = new Map<string, string>();

/**
 * The frame's side of the bridge, first in its head. The page's storage is a
 * map seeded with the chosen theme (the frame has no storage of its own);
 * theme changes, scroll position and link clicks go to the Studio.
 */
function bridge(studio: string): string {
  const json = (v: unknown) => JSON.stringify(v).replaceAll("<", "\\u003c");
  return `<script>(() => {
  const send = (m) => parent.postMessage({ ...m, type: ${json(MESSAGE)} }, ${json(studio)});
  const items = new Map(${json([...theme])});
  const store = {
    getItem: (k) => (items.has(k) ? items.get(k) : null),
    setItem: (k, v) => { items.set(k, String(v)); send({ kind: "theme", key: k, value: String(v) }); },
    removeItem: (k) => { items.delete(k); },
    clear: () => items.clear(),
    key: (i) => [...items.keys()][i] ?? null,
    get length() { return items.size; },
  };
  try { Object.defineProperty(window, "localStorage", { value: store, configurable: true }); } catch (e) {}
  addEventListener("message", (e) => {
    if (e.source !== parent || e.origin !== ${json(studio)} || e.data?.type !== ${json(MESSAGE)}) return;
    if (e.data.kind === "scroll" && Number.isFinite(e.data.y)) {
      scrollTo(0, e.data.y);
      send({ kind: "shown" });
    }
  });
  let t;
  addEventListener("scroll", () => {
    clearTimeout(t);
    t = setTimeout(() => send({ kind: "scroll", y: scrollY }), 100);
  }, { passive: true });
  addEventListener("click", (e) => {
    const link = e.target.closest?.("a[href], button[data-href]");
    const href = link?.getAttribute("href") ?? link?.getAttribute("data-href");
    if (!href || href.startsWith("#")) return;
    e.preventDefault();
    e.stopPropagation();
    send({ kind: "open", href });
  }, true);
})();</script>`;
}

type FrameMessage =
  | { kind: "shown" }
  | { kind: "scroll"; y: number }
  | { kind: "open"; href: string }
  | { kind: "theme"; key: string; value: string };

/** The message, if it is one the frame may send. */
function frameMessage(data: unknown): FrameMessage | null {
  if (!data || typeof data !== "object") return null;
  const m = data as Record<string, unknown>;
  if (m.type !== MESSAGE) return null;
  if (m.kind === "shown") return { kind: "shown" };
  if (m.kind === "scroll" && typeof m.y === "number" && Number.isFinite(m.y))
    return { kind: "scroll", y: m.y };
  if (m.kind === "open" && typeof m.href === "string" && m.href.length < 4096)
    return { kind: "open", href: m.href };
  if (
    m.kind === "theme" &&
    typeof m.key === "string" &&
    THEME_KEYS.has(m.key) &&
    typeof m.value === "string" &&
    /^[a-z0-9-]{1,32}$/.test(m.value)
  )
    return { kind: "theme", key: m.key, value: m.value };
  return null;
}

/** A link from the page, on the live site; null for anything but a web or mail link. */
function liveUrl(href: string, origin: string): string | null {
  if (safeHref(href) !== href) return null;
  try {
    const url = new URL(href, `${origin}/`);
    return ["http:", "https:", "mailto:"].includes(url.protocol)
      ? url.href
      : null;
  } catch {
    return null;
  }
}

/**
 * Shows `html` in a sandboxed frame. A new page loads behind the shown one
 * and takes its place, at its scroll position, once it has loaded, so typing
 * does not flash the pane. Links open the live site in a new tab.
 */
function Frame(props: { html: string; origin: string }): ReactNode {
  const box = useRef<HTMLDivElement>(null);
  const scrollY = useRef(0);
  const { html, origin } = props;
  useEffect(() => {
    const root = box.current;
    if (!root) return;
    const frames = () => [...root.children] as HTMLIFrameElement[];
    const onMessage = (e: MessageEvent) => {
      const frame = frames().find((f) => f.contentWindow === e.source);
      const m = frame && e.origin === "null" ? frameMessage(e.data) : null;
      if (!frame || !m) return;
      const shown = frame === root.firstElementChild;
      if (m.kind === "shown" && frame === root.lastElementChild) {
        for (const f of frames()) if (f !== frame) f.remove();
        frame.style.visibility = "";
      } else if (m.kind === "scroll" && shown) {
        scrollY.current = m.y;
      } else if (m.kind === "open") {
        const url = liveUrl(m.href, origin);
        if (url) window.open(url, "_blank", "noopener");
      } else if (m.kind === "theme") {
        theme.set(m.key, m.value);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [origin]);
  useEffect(() => {
    const root = box.current;
    if (!root || !html) return;
    const next = document.createElement("iframe");
    next.title = "Preview";
    next.className = "blog-preview-frame";
    next.sandbox.add(
      "allow-scripts",
      "allow-popups",
      "allow-popups-to-escape-sandbox",
    );
    next.allow = "clipboard-write *";
    if (root.firstElementChild) next.style.visibility = "hidden";
    next.addEventListener(
      "load",
      () => {
        if (root.lastElementChild !== next) return next.remove();
        // The frame answers "shown" once it has scrolled there.
        next.contentWindow?.postMessage(
          { type: MESSAGE, kind: "scroll", y: scrollY.current },
          "*",
        );
      },
      { once: true },
    );
    next.srcdoc = html.replace(
      "<head>",
      `<head>\n${bridge(window.location.origin)}`,
    );
    root.append(next);
  }, [html]);
  return <div ref={box} className="blog-preview-frames" />;
}

export function PostPreview(props: {
  document: { displayed: Partial<SanityDocument> };
  documentId: string;
}): ReactNode {
  const doc = props.document.displayed;
  const client = useClient({ apiVersion: "2026-02-01" });
  const channel = frameChannel(doc.channel);
  const [sectionError, setSectionError] = useState<string | null>(null);
  const [refsError, setRefsError] = useState<string | null>(null);
  const section = useSection(channel, setSectionError);
  const shown = useShownPost(doc, setRefsError);
  const html = useMemo(
    () =>
      section && shown
        ? pageHtml(section, shown, props.documentId, client.config())
        : "",
    [section, shown, props.documentId, client],
  );
  const error = sectionError ?? refsError;
  return (
    <div className="blog-preview">
      <Frame html={html} origin={CHANNEL_ORIGIN[channel]} />
      {error ? (
        <p className="blog-preview-error" role="status">
          {error}
          {html ? " This is the last version that could be drawn." : ""}
        </p>
      ) : null}
    </div>
  );
}
