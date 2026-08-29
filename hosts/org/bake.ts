/**
 * Bake remilia.org sections into the deploy root.
 *   node --import tsx hosts/org/bake.ts [outDir]
 * Default outDir is repo `deploy/` (corporate pages live there; this adds
 * /updates, /press, /thought, /archive).
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ORG_SECTIONS } from "@remilia/seo";
import { bake } from "@remilia/renderer";
import { chromeFor, hostFor } from "./chrome";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = process.argv[2] ?? join(here, "../../deploy");
const stylesheets = [join(here, "../core/blog-core.css"), join(here, "theme.css")];
const extraSitemapUrls = [
  { loc: "https://remilia.org/" },
  { loc: "https://remilia.org/about" },
  { loc: "https://remilia.org/contact" },
  { loc: "https://remilia.org/careers" },
];

let total = 0;
for (const channel of ORG_SECTIONS) {
  const result = await bake({
    channel,
    chrome: chromeFor(channel),
    host: hostFor(channel),
    outDir,
    projectId: "8x9419lh",
    dataset: "production",
    stylesheets,
    // Corporate sitemap extras only once (on press) to avoid quadrupling.
    extraSitemapUrls: channel === "press" ? extraSitemapUrls : undefined,
  });
  total += result.pages;
  console.log(`baked ${result.pages} pages into ${outDir}${channel === "press" ? "/press" : "/" + channel}`);
}
console.log(`baked ${total} org pages total`);
