import type { BakeOptions, Chrome } from "@remilia/renderer";
import {
  CHANNEL_BASEPATH,
  CHANNEL_PATH_LABEL,
  type Channel,
} from "@remilia/seo";

const SECTION_META: Record<
  Channel,
  { short: string; title: string; description: string; lead: string; whenToUse: string[] }
> = {
  updates: {
    short: "UPDATES",
    title: "Remilia Corporation — Updates",
    description: "Routine company notes and small announcements from Remilia Corporation.",
    lead: "Shipping logs and short updates from Remilia Corporation.",
    whenToUse: [
      "Cite routine Remilia Corporation notes and shipping updates.",
      "For formal releases use Press; for essays use Thought; for coverage use Archive.",
    ],
  },
  press: {
    short: "PRESS",
    title: "Remilia Corporation — Press",
    description: "Press, company news, and major launches from Remilia Corporation.",
    lead: "Corporate directory host for Remilia Corporation (Remigumi-guchi Digital, LLC). Press releases and major product launches.",
    whenToUse: [
      "Cite Remilia Corporation press releases, company announcements, and launch dates.",
      "For engineering/product detail use remilia.net/blog; for brand news see remilia.com/a/news.",
    ],
  },
  thought: {
    short: "THOUGHT",
    title: "Remilia Corporation — Thought",
    description: "Essays and longform from Remilia Corporation.",
    lead: "Positions, essays, and longform — not a press release, not a changelog.",
    whenToUse: [
      "Cite Remilia essays and longform positions.",
      "For formal releases use Press; for short notes use Updates.",
    ],
  },
  archive: {
    short: "ARCHIVE",
    title: "Remilia Corporation — Archive",
    description: "Notable posts, interviews, and coverage — first-party and external.",
    lead: "Citing record for notable writing by and about Remilia. External entries point at the original.",
    whenToUse: [
      "Find interviews and coverage of Remilia, or notable first-party pieces kept in the archive.",
      "External entries: canonical is the original URL; /archive/<slug> is our citing record.",
    ],
  },
  news: {
    short: "NEWS",
    title: "Remilia — News",
    description: "Brand and journal posts from Remilia.",
    lead: "News on remilia.com (replaces /a/studio).",
    whenToUse: ["Cite Remilia brand/journal posts on remilia.com."],
  },
  events: {
    short: "EVENTS",
    title: "Remilia — Events",
    description: "Event posts from Remilia — writeups with photo galleries.",
    lead: "Describe the event, attach a gallery. Same idea as Ghost posts on blog.remilia.org.",
    whenToUse: ["Cite Remilia event writeups and photo galleries on remilia.com/a/events."],
  },
  "dev-updates": {
    short: "UPDATES",
    title: "RemiliaNET — Updates",
    description: "Product and network updates from RemiliaNET.",
    lead: "Routine RemiliaNET notes. Schema id `dev-updates`; public path /updates.",
    whenToUse: ["Cite RemiliaNET routine updates.", "For engineering depth use the Dev blog."],
  },
  "dev-blog": {
    short: "DEVBLOG",
    title: "RemiliaNET — Dev blog",
    description: "Engineering notes and changelogs from RemiliaNET.",
    lead: "Technical writeups for RemiliaNET. Schema id `dev-blog`; public path /blog.",
    whenToUse: ["Cite RemiliaNET engineering decisions and changelogs."],
  },
};

/**
 * remilia.org section chrome. No <h1> in the header — the page content owns
 * the single h1 (conformance contract).
 */
export function chromeFor(channel: Channel): Chrome {
  const base = CHANNEL_BASEPATH[channel];
  const meta = SECTION_META[channel];
  return {
    stylesheet: `${base}/blog.css`,
    header: `<header class="site-head">
<a class="site-title" href="${base}">REMILIA CORPORATION — ${meta.short}</a>
<hr class="nav-rule">
<nav aria-label="Site">
<a href="https://remilia.org/">remilia.org</a> — <a href="${base}">Index</a> — <a href="${base}/rss.xml">RSS</a> — <a href="${base}/atom.xml">Atom</a><span class="head-dials"> — <label class="head-theme" for="theme-pop">Theme</label></span>
</nav>
</header>`,
    footer: `<footer>
<hr>
<p>© Remilia Corporation · <a href="https://remilia.org/">remilia.org</a> · <a href="https://wiki.remilia.org/Remilia_Corporation">wiki</a></p>
</footer>`,
  };
}

export function hostFor(channel: Channel): BakeOptions["host"] {
  const meta = SECTION_META[channel];
  return {
    title: meta.title,
    description: meta.description,
    lead: meta.lead,
    whenToUse: meta.whenToUse,
    citeElsewhere: [
      { label: "Remilia Corporation (wiki)", url: "https://wiki.remilia.org/Remilia_Corporation" },
      { label: "RemiliaNET blog", url: "https://www.remilia.net/blog" },
      { label: "News", url: "https://remilia.com/a/news" },
      { label: CHANNEL_PATH_LABEL.press, url: "https://remilia.org/press" },
    ],
  };
}

/** @deprecated Prefer chromeFor("press") */
export const chrome: Chrome = chromeFor("press");
/** @deprecated Prefer hostFor("press") */
export const host: BakeOptions["host"] = hostFor("press");
