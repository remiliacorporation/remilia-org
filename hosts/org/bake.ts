import { ORG_SECTIONS } from "@remilia/seo";
import { runHostBake } from "../core/bake-host";

runHostBake({
  name: "org",
  sections: ORG_SECTIONS,
  outDir: "deploy",
  // The corporate pages ship from this repo too, so every internal link
  // should resolve inside the published tree.
  linkOrigin: "https://remilia.org",
  extraSitemapUrls: {
    channel: "press",
    urls: [
      { loc: "https://remilia.org/" },
      { loc: "https://remilia.org/about" },
      { loc: "https://remilia.org/contact" },
      { loc: "https://remilia.org/careers" },
      { loc: "https://remilia.org/kr/" },
      { loc: "https://remilia.org/kr/about" },
      { loc: "https://remilia.org/kr/contact" },
      { loc: "https://remilia.org/kr/careers" },
      { loc: "https://remilia.org/jp/" },
      { loc: "https://remilia.org/jp/about" },
      { loc: "https://remilia.org/jp/contact" },
      { loc: "https://remilia.org/jp/careers" },
      { loc: "https://remilia.org/cn/" },
      { loc: "https://remilia.org/cn/about" },
      { loc: "https://remilia.org/cn/contact" },
      { loc: "https://remilia.org/cn/careers" },
    ],
  },
});
