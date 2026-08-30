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
      "For formal releases or coverage use Press; for theory/NFTs use Thought.",
    ],
  },
  press: {
    short: "PRESS",
    title: "Remilia Corporation — Press",
    description: "Press releases and external coverage of Remilia Corporation.",
    lead: "Formal releases and press coverage (Decrypt, Forbes, interviews, etc.).",
    whenToUse: [
      "Cite Remilia press releases and external coverage.",
      "For theory/NFTs use Thought; for fashion/lifestyle use remilia.com/a/news.",
    ],
  },
  thought: {
    short: "THOUGHT",
    title: "Remilia Corporation — Thought",
    description: "Theory and NFT essays from Remilia Corporation.",
    lead: "Theory, positions, and NFT design notes — remilia.org’s essay surface.",
    whenToUse: [
      "Cite Remilia theory and NFT essays.",
      "For press coverage use Press; for software product notes use remilia.net.",
    ],
  },
  archive: {
    short: "ARCHIVE",
    title: "Remilia Corporation — Archive",
    description: "Rare first-party archival cites.",
    lead: "First-party archival citing records. External coverage belongs in Press.",
    whenToUse: [
      "Rare archival first-party cites only.",
      "Decrypt / Forbes / interviews → Press, not Archive.",
    ],
  },
  news: {
    short: "NEWS",
    title: "Remilia — News",
    description: "Fashion, lifestyle brand, and publishing from Remilia.",
    lead: "Fashion, lifestyle, and publishing news on remilia.com.",
    whenToUse: ["Cite Remilia fashion / lifestyle / publishing posts on remilia.com/a/news."],
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
    description: "Software product notes — RemiliaNET, wiki, miladychan.",
    lead: "RemiliaNET / wiki / miladychan updates. Schema id `dev-updates`; path /updates.",
    whenToUse: [
      "Cite RemiliaNET, wiki, or miladychan product notes.",
      "NFT theory stays on remilia.org/thought.",
    ],
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
