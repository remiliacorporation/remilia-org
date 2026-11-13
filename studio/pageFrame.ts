// The blog page around the post editor: the renderer's own markup and the
// blog's own stylesheet, so the Studio shows a post the way the site does.
import { articleHtml, htmlPage } from "../packages/renderer/src/page";
import { emptyRail, hostCats, sectionNav } from "../packages/renderer/src/nav";
import { scopeBlogCss } from "../packages/renderer/src/embed";
import { siteMetaFor } from "../packages/seo/src/index";
import { BLOG_SHEETS, chromeFor } from "../hosts/core/sections";
import { CHANNELS, type Channel } from "../lib/access";
import emblemUrl from "../deploy/assets/emblem.svg?url";

const sheets = import.meta.glob<string>("../hosts/core/**/*.css", {
  query: "?raw",
  import: "default",
  eager: true,
});

/** The frame element; the blog sheet's `html`/`body` rules land on it. */
export const FRAME_CLASS = "blog-page";

/** Where the blog sheet stops: the editor and anything Sanity UI renders. */
const LIMIT = ".blog-pt, [data-ui]";

/** The blog's stylesheet, as the bake writes it to blog.css. */
export const BLOG_CSS = [
  sheets["../hosts/core/theme.css"],
  ...BLOG_SHEETS.map((n) => sheets[`../hosts/core/blog/${n}.css`]),
].join("\n");

export const PAGE_CSS = scopeBlogCss(BLOG_CSS, {
  root: `.${FRAME_CLASS}`,
  limit: LIMIT,
  container: FRAME_CLASS,
});

/** The post's section, or Press (the default chrome) while it has none. */
export function frameChannel(channel: unknown): Channel {
  const hit = CHANNELS.find((c) => c.value === channel);
  return hit ? hit.value : "press";
}

/** The `<html>` theme attributes the bake pins for this host. */
export function frameTheme(channel: Channel): Record<string, string> {
  const { hue, dots, scheme } = siteMetaFor(channel).theme;
  return {
    "data-hue": String(hue),
    "data-dots": dots,
    ...(scheme === "system" ? {} : { "data-scheme": scheme }),
  };
}

/**
 * A post page's `<body>` with an empty title, byline, body, rails, and
 * adjacent links: the editor fills the title and body in place, and
 * `frameParts` (studio/frameParts.ts) renders the rest from the post.
 */
export function frameHtml(channel: Channel): string {
  const page = htmlPage({
    title: "",
    description: "",
    canonical: "",
    jsonld: [],
    chrome: chromeFor(channel),
    channel,
    leftRail: emptyRail(),
    sectionNav: sectionNav(hostCats(channel)),
    // An empty read info box under the theme box, for `frameParts` to fill.
    readHtml: '<aside class="cite-box"></aside>',
    mainHtml: articleHtml({
      title: "",
      publishedAt: "",
      bodyHtml: "",
      // Keeps the adjacent links' box in the page, for `frameParts` to fill.
      metaHtml: "<!-- adjacent -->",
    }),
  });
  const body = page.slice(
    page.indexOf("<body>") + "<body>".length,
    page.lastIndexOf("</body>"),
  );
  return body
    .replace(/<a class="skip"[^>]*>[^<]*<\/a>\n?/, "")
    .replaceAll('href="/assets/emblem.svg"', `href="${emblemUrl}"`);
}
