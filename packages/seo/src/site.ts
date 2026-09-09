import { type Channel, type HostId, CHANNEL_HOST, CHANNEL_ORIGIN } from "./urls";

/**
 * Per-host discovery metadata. Mirrors the hand-authored corporate head
 * (`deploy/src/_partials/head-common.html`) so baked literature declares the
 * same identity, icons, social handles and alternate formats.
 */
export interface SiteMeta {
  /** og:site_name */
  name: string;
  /** meta author */
  author: string;
  /** og:locale */
  locale: string;
  origin: string;
  themeColor: string;
  /** Fallback og:image when a post has no cover. */
  ogImage?: string;
  twitterSite?: string;
  twitterCreator?: string;
  /** rel=me profiles; also the Organization sameAs set. */
  me: string[];
  icons?: {
    favicon?: string;
    png?: string;
    appleTouch?: string;
    manifest?: string;
  };
  /** Host-wide plain-text maps, linked as alternates from every page. */
  textMaps?: { title: string; href: string }[];
}

const SOCIAL = [
  "https://x.com/remiliacorp333",
  "https://www.instagram.com/remilia.corporation/",
  "https://www.youtube.com/@remiliacorp",
];

export const SITE_META: Record<HostId, SiteMeta> = {
  org: {
    name: "Remigumi-guchi Digital, LLC",
    author: "Remigumi-guchi Digital, LLC",
    locale: "en_US",
    origin: "https://remilia.org",
    themeColor: "#ff0000",
    ogImage: "https://remilia.org/assets/og.png",
    twitterSite: "@remiliacorp333",
    twitterCreator: "@remiliacorp333",
    me: SOCIAL,
    icons: {
      favicon: "/favicon.ico",
      png: "/assets/logo.png",
      appleTouch: "/assets/apple-touch-icon.png",
      manifest: "/site.webmanifest",
    },
    textMaps: [
      { title: "llms.txt", href: "https://remilia.org/llms.txt" },
      { title: "llms-full.txt", href: "https://remilia.org/llms-full.txt" },
    ],
  },
  com: {
    name: "Remilia Corporation",
    author: "Remilia Corporation",
    locale: "en_US",
    origin: CHANNEL_ORIGIN.news,
    themeColor: "#ff0000",
    twitterSite: "@remiliacorp333",
    twitterCreator: "@remiliacorp333",
    me: SOCIAL,
  },
  net: {
    name: "RemiliaNET",
    author: "Remilia Corporation",
    locale: "en_US",
    origin: CHANNEL_ORIGIN["dev-blog"],
    themeColor: "#ff0000",
    twitterSite: "@remiliacorp333",
    twitterCreator: "@remiliacorp333",
    me: SOCIAL,
  },
};

export const siteMetaFor = (channel: Channel): SiteMeta =>
  SITE_META[CHANNEL_HOST[channel]];
