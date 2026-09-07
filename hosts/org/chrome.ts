import type { BakeOptions, Chrome } from "@remilia/renderer";
import {
  CHANNEL_BASEPATH,
  CHANNEL_PATH_LABEL,
  type Channel,
} from "@remilia/seo";

const SECTION_META: Record<
  Channel,
  {
    short: string;
    title: string;
    description: string;
    lead: string;
    whenToUse: string[];
  }
> = {
  updates: {
    short: "UPDATES",
    title: "Remilia Corporation — Updates",
    description: "Company essays and memos from Remilia Corporation.",
    lead: "Christmas missives, Level-2 notes, Admin Reveal, and similar company essays.",
    whenToUse: [
      "Cite Remilia company essays and memos.",
      "For theory/NFTs use Thought; for press releases use Press.",
    ],
  },
  press: {
    short: "PRESS",
    title: "Remilia Corporation — Press",
    description: "Org corporate statements from Remilia Corporation.",
    lead: "Corporate statements only. Brand releases (fashion, product launches) live on remilia.com/a/news.",
    whenToUse: [
      "Cite Remilia corporate statements.",
      "HIKKI Punks / Atelier / FRUiTS / product launches → News.",
    ],
  },
  thought: {
    short: "THOUGHT",
    title: "Remilia Corporation — Thought",
    description: "Org/product thought leadership — theory and NFTs.",
    lead: "Core Remilia theory and NFT essays — not secondary blog posts.",
    whenToUse: [
      "Cite Remilia org/product thought leadership.",
      "Secondary Substack/Paragraph → Archive; company memos → Updates.",
    ],
  },
  archive: {
    short: "ARCHIVE",
    title: "Remilia Corporation — Archive",
    description: "External coverage (Firecrawl’d) and secondary essays.",
    lead: "Press coverage & interviews (snapshot via Firecrawl) plus secondary Substack/Paragraph.",
    whenToUse: [
      "Find coverage/interviews of Remilia, or secondary essays kept for the record.",
      "External: canonical is the original URL; archiveSnapshot holds the Firecrawl markdown.",
    ],
  },
  news: {
    short: "NEWS",
    title: "Remilia — News",
    description:
      "Fashion, lifestyle brand, publishing, and brand press releases.",
    lead: "Fashion, lifestyle, publishing, and brand launches (incl. HIKKI Punks, Atelier) on remilia.com.",
    whenToUse: [
      "Cite Remilia fashion / lifestyle / publishing / brand press releases on remilia.com/a/news.",
    ],
  },
  events: {
    short: "EVENTS",
    title: "Remilia — Events",
    description: "Event posts from Remilia — writeups with photo galleries.",
    lead: "Describe the event, attach a gallery. Same idea as Ghost posts on blog.remilia.org.",
    whenToUse: [
      "Cite Remilia event writeups and photo galleries on remilia.com/a/events.",
    ],
  },
  "dev-updates": {
    short: "UPDATES",
    title: "RemiliaNET — Updates",
    description: "Other RemiliaNET product notes (vault, promos).",
    lead: "Product notes that aren’t full engineering posts. Schema id `dev-updates`; path /updates.",
    whenToUse: [
      "Cite short RemiliaNET product notes.",
      "Alpha / wiki / miladychan engineering posts → Dev blog.",
    ],
  },
  "dev-blog": {
    short: "DEVBLOG",
    title: "RemiliaNET — Dev blog",
    description: "RemiliaNET Alpha, wiki, and miladychan engineering posts.",
    lead: "Engineering writeups: RemiliaNET Alpha, wiki, miladychan. Schema id `dev-blog`; path /blog.",
    whenToUse: [
      "Cite RemiliaNET Alpha, wiki, or miladychan engineering posts.",
    ],
  },
};

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
      {
        label: "Remilia Corporation (wiki)",
        url: "https://wiki.remilia.org/Remilia_Corporation",
      },
      { label: "RemiliaNET blog", url: "https://www.remilia.net/blog" },
      { label: "News", url: "https://remilia.com/a/news" },
      { label: CHANNEL_PATH_LABEL.press, url: "https://remilia.org/press" },
    ],
  };
}

export const chrome: Chrome = chromeFor("press");

export const host: BakeOptions["host"] = hostFor("press");
