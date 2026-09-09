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
  /**
   * Theme the host serves before a reader picks one. Baked onto `<html>`, so
   * it holds without JavaScript and without a stored preference.
   */
  theme: HostTheme;
}

export interface HostTheme {
  /** One of the five dial hues. */
  hue: 30 | 95 | 145 | 255 | 330;
  /** `system` follows the reader's OS; the others pin the scheme. */
  scheme: "system" | "light" | "dark";
  /** Wallpaper lattice density. */
  dots: "none" | "small" | "large";
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
    // Corporate red on paper, pinned light, dense lattice.
    theme: { hue: 30, scheme: "light", dots: "small" },
  },
  com: {
    name: "Remilia Corporation",
    author: "Remilia Corporation",
    locale: "en_US",
    origin: CHANNEL_ORIGIN.news,
    themeColor: "#ff0000",
    ogImage: `${CHANNEL_ORIGIN.news}/assets/og.png`,
    twitterSite: "@remiliacorp333",
    twitterCreator: "@remiliacorp333",
    me: SOCIAL,
    theme: { hue: 30, scheme: "dark", dots: "none" },
  },
  net: {
    name: "RemiliaNET",
    author: "Remilia Corporation",
    locale: "en_US",
    origin: CHANNEL_ORIGIN["dev-blog"],
    themeColor: "#0033ff",
    ogImage: `${CHANNEL_ORIGIN["dev-blog"]}/assets/og.png`,
    twitterSite: "@remiliacorp333",
    twitterCreator: "@remiliacorp333",
    me: SOCIAL,
    theme: { hue: 255, scheme: "light", dots: "large" },
  },
};

export const siteMetaFor = (channel: Channel): SiteMeta =>
  SITE_META[CHANNEL_HOST[channel]];
