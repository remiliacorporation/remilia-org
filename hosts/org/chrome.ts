import type { BakeOptions, Chrome } from "@remilia/renderer";

/**
 * remilia.org/press chrome. No <h1> in the header — the page content owns
 * the single h1 (conformance contract).
 */
export const chrome: Chrome = {
  stylesheet: "/press/blog.css",
  header: `<header class="site-head">
<a class="site-title" href="/press">REMILIA CORPORATION — PRESS</a>
<nav aria-label="Site">
<a href="https://remilia.org/">remilia.org</a>
<a href="/press">Index</a>
<a href="/press/rss.xml">RSS</a>
<a href="/press/atom.xml">Atom</a>
</nav>
</header>`,
  footer: `<footer>
<hr>
<p>© Remilia Corporation · <a href="https://remilia.org/">remilia.org</a> · <a href="https://wiki.remilia.org/Remilia_Corporation">wiki</a></p>
</footer>`,
};

export const host: BakeOptions["host"] = {
  title: "Remilia Corporation — Press",
  description: "Press, company news, and major launches from Remilia Corporation.",
  lead: "Corporate directory host for Remilia Corporation (Remigumi-guchi Digital, LLC). Press releases and major product launches.",
  whenToUse: [
    "Cite Remilia Corporation press releases, company announcements, and launch dates.",
    "For engineering/product detail use the RemiliaNET devblog (remilia.net/blog); for events, photos, and brand see remilia.com/a/studio.",
  ],
  citeElsewhere: [
    { label: "Remilia Corporation (wiki)", url: "https://wiki.remilia.org/Remilia_Corporation" },
    { label: "RemiliaNET devblog", url: "https://www.remilia.net/blog" },
    { label: "Studio journal", url: "https://remilia.com/a/studio" },
  ],
};
