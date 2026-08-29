/**
 * Bake remilia.org/press into the deploy root.
 *   node --import tsx hosts/org/bake.ts [outDir]
 * Default outDir is repo `deploy/` (corporate pages live there; this adds /press/**).
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { bake } from "@remilia/renderer";
import { chrome, host } from "./chrome";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = process.argv[2] ?? join(here, "../../deploy");

const result = await bake({
  channel: "press",
  chrome,
  host,
  outDir,
  projectId: "8x9419lh",
  dataset: "production",
  stylesheets: [join(here, "../core/blog-core.css"), join(here, "theme.css")],
  extraSitemapUrls: [
    { loc: "https://remilia.org/" },
    { loc: "https://remilia.org/about" },
    { loc: "https://remilia.org/contact" },
    { loc: "https://remilia.org/careers" },
  ],
});
console.log(`baked ${result.pages} pages into ${outDir}/press`);
