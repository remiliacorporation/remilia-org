/**
 * Bake remilia.org/press. CI entry:
 *   node --import tsx hosts/org/bake.ts <outDir>
 * outDir is the deploy root (remilia-site working copy or dist dir);
 * hand-authored pages live there already, the bake adds /press/**.
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { bake } from "@remilia/renderer";
import { chrome, host } from "./chrome";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = process.argv[2];
if (!outDir) {
  console.error("usage: bake.ts <outDir>");
  process.exit(2);
}

const result = await bake({
  channel: "press",
  chrome,
  host,
  outDir,
  projectId: "8x9419lh",
  dataset: "production",
  stylesheets: [join(here, "../core/blog-core.css"), join(here, "theme.css")],
  // The hand-authored remilia.org pages ship verbatim alongside the bake.
  staticFrom: [
    {
      dir: "/Users/soleva/dev/remilia-site",
      include: ["index.html", "jobs", "assets", "favicon.ico", "site.webmanifest", "robots.txt", ".well-known", "404.html"],
    },
  ],
});
console.log(`baked ${result.pages} pages into ${outDir}/press`);
