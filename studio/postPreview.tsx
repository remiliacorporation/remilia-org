// The post's Preview tab: the draft (or the published post, when there is no
// draft) as the bake writes its page, by the bake's own page function, with
// the site's stylesheet and scripts, in a frame as wide as the pane.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useClient, type SanityDocument } from "sanity";
import {
  AUTHORS_QUERY,
  POSTS_QUERY,
  POST_PROJECTION,
  sectionPages,
  withChannel,
  type FetchedPost,
} from "../packages/renderer/src/section";
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

const fonts = import.meta.glob<string>("../deploy/assets/fonts/*", {
  query: "?url",
  import: "default",
  eager: true,
});

/**
 * The bake's blog.css, nav.js and gallery.js, served from the Studio. The
 * sheet's fonts are the Studio's copies: the site sends no CORS headers.
 */
let assets: { css: string; nav: string; gallery: string } | undefined;
function siteAssets(): NonNullable<typeof assets> {
  const blob = (text: string, type: string) =>
    URL.createObjectURL(new Blob([text], { type }));
  assets ??= {
    css: blob(
      BLOG_CSS.replace(/url\("\/assets\/fonts\/([^"]+)"\)/g, (rule, name) => {
        const url = fonts[`../deploy/assets/fonts/${name}`];
        return url ? `url("${new URL(url, location.href).href}")` : rule;
      }),
      "text/css",
    ),
    nav: blob(NAV_JS, "text/javascript"),
    gallery: blob(LIGHTBOX_JS, "text/javascript"),
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
function useSection(channel: Channel): Section | null {
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
        setSection({
          channel,
          posts: posts.map((p) => withChannel(p, channel)),
          siblings: siblings.flat(),
        });
      })
      .catch(() => {
        if (!cancelled) setSection({ channel, posts: [], siblings: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [client, channel]);
  return section?.channel === channel ? section : null;
}

/**
 * The document in the bake's shape: the bake's own projection, run over the
 * form's value, so references resolve as the bake resolves them. It follows
 * the form a moment after typing stops.
 */
function useShownPost(doc: Partial<SanityDocument>): FetchedPost | null {
  const client = useClient({ apiVersion: "2026-02-01" });
  const [post, setPost] = useState<FetchedPost | null>(null);
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      client
        .withConfig({ perspective: "published" })
        .fetch<FetchedPost>(`$doc${POST_PROJECTION}`, { doc })
        .then((p) => {
          if (!cancelled) setPost(p);
        })
        .catch(() => undefined);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [client, doc]);
  return post;
}

/**
 * The page the bake would write for `shown`, among its section's posts. Its
 * own address is its base, as on the site, so a contents link moves within
 * it; the site's paths would otherwise resolve against the Studio's.
 */
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
      title: shown.title ?? "",
      slug: shown.slug ?? "",
      excerpt: shown.excerpt ?? "",
      publishedAt: shown.publishedAt ?? new Date().toISOString(),
    },
    channel,
  );
  // The post stands in for its published version, where the bake lists it.
  const posts = [
    ...section.posts.filter((p) => p._id !== id),
    ...(shown.slug ? [post] : []),
  ].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const { css, nav, gallery } = siteAssets();
  return sectionPages({
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
    // margin. Here nav.js starts once they are in.
    navScript: `<script>Promise.all([...document.fonts].filter((f) => f.family.includes("Alte Haas")).map((f) => f.load())).finally(() => document.body.append(Object.assign(document.createElement("script"), { src: "${nav}" })));</script>`,
    galleryScript:
      channel === "events" && post.albums?.length
        ? `\n<script src="${gallery}" defer></script>`
        : "",
  })
    .postPage(post)
    .replace("<head>", '<head>\n<base href="about:srcdoc">')
    .replaceAll(
      'href="/assets/emblem.svg"',
      `href="${new URL(emblemUrl, location.href).href}"`,
    );
}

/**
 * Shows `html` in a frame. A new page loads behind the shown one and takes
 * its place, at its scroll position, once it has loaded, so typing does not
 * flash the pane. Links open the live site in a new tab.
 */
function Frame(props: { html: string; origin: string }): ReactNode {
  const box = useRef<HTMLDivElement>(null);
  const { html, origin } = props;
  useEffect(() => {
    const root = box.current;
    if (!root || !html) return;
    const next = document.createElement("iframe");
    next.title = "Preview";
    next.className = "blog-preview-frame";
    if (root.firstElementChild) next.style.visibility = "hidden";
    next.addEventListener(
      "load",
      () => {
        if (root.lastElementChild !== next) return next.remove();
        const shown = root.firstElementChild as HTMLIFrameElement | null;
        const win = next.contentWindow;
        if (!win) return;
        if (shown && shown !== next)
          win.scrollTo(0, shown.contentWindow?.scrollY ?? 0);
        win.addEventListener(
          "click",
          (e) => {
            const link = (e.target as Element).closest?.(
              "a[href], button[data-href]",
            );
            const href =
              link?.getAttribute("href") ?? link?.getAttribute("data-href");
            if (!href || href.startsWith("#")) return;
            e.preventDefault();
            e.stopPropagation();
            window.open(new URL(href, `${origin}/`).href, "_blank", "noopener");
          },
          true,
        );
        while (root.firstElementChild !== next)
          root.firstElementChild?.remove();
        next.style.visibility = "";
      },
      { once: true },
    );
    next.srcdoc = html;
    root.append(next);
  }, [html, origin]);
  return <div ref={box} className="blog-preview" />;
}

export function PostPreview(props: {
  document: { displayed: Partial<SanityDocument> };
  documentId: string;
}): ReactNode {
  const doc = props.document.displayed;
  const client = useClient({ apiVersion: "2026-02-01" });
  const channel = frameChannel(doc.channel);
  const section = useSection(channel);
  const shown = useShownPost(doc);
  const html = useMemo(
    () =>
      section && shown
        ? pageHtml(section, shown, props.documentId, client.config())
        : "",
    [section, shown, props.documentId, client],
  );
  return <Frame html={html} origin={CHANNEL_ORIGIN[channel]} />;
}
