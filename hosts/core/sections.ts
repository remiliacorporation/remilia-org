import type { BakeOptions, Chrome } from "@remilia/renderer";
import {
  CHANNEL_BASEPATH,
  CHANNEL_HOST,
  CHANNEL_PATH_LABEL,
  HOST_AGGREGATE,
  indexPath,
  indexUrl,
  isAggregate,
  type Channel,
  type HostId,
} from "@remilia/seo";

const SECTION_META: Record<
  Channel,
  {
    title: string;
    description: string;
    lead: string;
    whenToUse: string[];
  }
> = {
  updates: {
    title: "Remilia Corporation — Updates",
    description: "Company essays and memos from Remilia Corporation.",
    lead: "Christmas missives, Level-2 notes, Admin Reveal, and similar company essays.",
    whenToUse: [
      "Cite Remilia company essays and memos.",
      "For theory/NFTs use Thought; for press releases use Press.",
    ],
  },
  press: {
    title: "Remilia Corporation — Press",
    description: "Org corporate statements from Remilia Corporation.",
    lead: "Corporate statements only. Brand releases (fashion, product launches) live on remilia.com/a/blog/news.",
    whenToUse: [
      "Cite Remilia corporate statements.",
      "HIKKI Punks / Atelier / FRUiTS / product launches → News.",
    ],
  },
  thought: {
    title: "Remilia Corporation — Thought",
    description: "Org/product thought leadership — theory and NFTs.",
    lead: "Core Remilia theory and NFT essays — not secondary blog posts.",
    whenToUse: [
      "Cite Remilia org/product thought leadership.",
      "Secondary Substack/Paragraph → Archive; company memos → Updates.",
    ],
  },
  archive: {
    title: "Remilia Corporation — Archive",
    description: "External coverage (Firecrawl’d) and secondary essays.",
    lead: "Press coverage & interviews (snapshot via Firecrawl) plus secondary Substack/Paragraph.",
    whenToUse: [
      "Find coverage/interviews of Remilia, or secondary essays kept for the record.",
      "External: canonical is the original URL; archiveSnapshot holds the Firecrawl markdown.",
    ],
  },
  news: {
    title: "Remilia — News",
    description:
      "Fashion, lifestyle brand, publishing, and brand press releases.",
    lead: "Fashion, lifestyle, publishing, and brand launches (incl. HIKKI Punks, Atelier) on remilia.com.",
    whenToUse: [
      "Cite Remilia fashion / lifestyle / publishing / brand press releases on remilia.com/a/blog/news.",
    ],
  },
  events: {
    title: "Remilia — Events",
    description: "Event posts from Remilia — writeups with photo galleries.",
    lead: "Describe the event, attach a gallery. Same idea as Ghost posts on blog.remilia.org.",
    whenToUse: [
      "Cite Remilia event writeups and photo galleries on remilia.com/a/blog/events.",
    ],
  },
  "dev-updates": {
    title: "RemiliaNET — Updates",
    description: "Other RemiliaNET product notes (vault, promos).",
    lead: "Product notes and announcements that aren’t full engineering posts. Schema id `dev-updates`; path /updates.",
    whenToUse: [
      "Cite short RemiliaNET product notes.",
      "Alpha / wiki / miladychan engineering posts → Dev blog.",
    ],
  },
  "dev-blog": {
    title: "RemiliaNET — Dev blog",
    description: "RemiliaNET Alpha, wiki, and miladychan engineering posts.",
    lead: "Engineering writeups: RemiliaNET Alpha, wiki, miladychan. Schema id `dev-blog`; path /dev-blog.",
    whenToUse: [
      "Cite RemiliaNET Alpha, wiki, or miladychan engineering posts.",
    ],
  },
  blog: {
    title: "Remilia Corporation — Blog",
    description:
      "Every Remilia Corporation post across Updates, Press, Thought and Archive.",
    lead: "The whole corporate blog surface: updates, press, thought and archive pooled.",
    whenToUse: [
      "Scan everything Remilia Corporation has published in one feed.",
      "Per-section feeds and archives live under /blog/<section>.",
    ],
  },
  "com-blog": {
    title: "Remilia — Blog",
    description: "Every Remilia post on remilia.com across News and Events.",
    lead: "Brand news and event writeups from remilia.com, pooled.",
    whenToUse: [
      "Scan everything published on remilia.com in one feed.",
      "Per-section feeds and archives live under /a/blog/<section>.",
    ],
  },
  "net-blog": {
    title: "RemiliaNET — Blog",
    description: "Every RemiliaNET post across Updates and the Dev blog.",
    lead: "RemiliaNET product updates and engineering writeups, pooled.",
    whenToUse: [
      "Scan everything RemiliaNET has published in one feed.",
      "Per-section feeds and archives live under /<section>.",
    ],
  },
};

/** Wordmark and root link per host, so a section wears its own brand. */
const BRAND: Record<HostId, { label: string; root: string; rootUrl: string }> = {
  org: {
    label: "REMILIA CORPORATION",
    root: "remilia.org",
    rootUrl: "https://remilia.org/",
  },
  com: { label: "REMILIA", root: "remilia.com", rootUrl: "https://remilia.com/" },
  net: {
    label: "REMILIANET",
    root: "remilia.net",
    rootUrl: "https://www.remilia.net/",
  },
};

export function chromeFor(channel: Channel): Chrome {
  const base = CHANNEL_BASEPATH[channel];
  const brand = BRAND[CHANNEL_HOST[channel]];
  // Index and the wordmark both point at the host's pooled index.
  const indexBase = indexPath(HOST_AGGREGATE[CHANNEL_HOST[channel]]);
  return {
    stylesheet: `${base}/blog.css`,
    header: `<header class="site-head">
<nav aria-label="Site">
<a href="${brand.rootUrl}">${brand.root}</a> — <a href="${indexBase}"${isAggregate(channel) ? ' aria-current="page"' : ""}>Index</a> — <a href="${base}/rss.xml">RSS</a> — <a href="${base}/atom.xml">Atom</a><span class="head-dials"> — <label class="head-theme" for="theme-pop">Theme</label></span>
</nav>
<hr class="nav-rule">
<a class="site-title" href="${indexPath(channel)}">${brand.label}</a>
</header>`,
    footer: `<footer>
<hr class="nav-rule">
<p>© Remilia Corporation · <a href="${brand.rootUrl}">${brand.root}</a> · <a href="https://wiki.remilia.org/Remilia_Corporation">wiki</a></p>
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
      { label: "RemiliaNET blog", url: indexUrl("net-blog") },
      { label: "Remilia blog", url: indexUrl("com-blog") },
      { label: CHANNEL_PATH_LABEL.press, url: indexUrl("press") },
    ],
  };
}

export const chrome: Chrome = chromeFor("press");

export const host: BakeOptions["host"] = hostFor("press");
