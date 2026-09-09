import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ORG_SECTIONS } from "@remilia/seo";
import { assertDatasetReadable, bake } from "@remilia/renderer";
import { chromeFor, hostFor } from "./chrome";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = process.argv[2] ?? join(here, "../../deploy");
const stylesheets = [
  join(here, "../core/blog-core.css"),
  join(here, "theme.css"),
];
const extraSitemapUrls = [
  { loc: "https://remilia.org/" },
  { loc: "https://remilia.org/about" },
  { loc: "https://remilia.org/contact" },
  { loc: "https://remilia.org/careers" },
];

const projectId = "8x9419lh";
const dataset = "production";
const token = process.env.SANITY_TOKEN ?? process.env.SANITY_AUTH_TOKEN;
const allowEmpty = process.env.ALLOW_EMPTY_BAKE === "1";

async function main() {
// Credentials are proven before the first file is written, so an expired
// token cannot leave the host half-rewritten.
const known = await assertDatasetReadable({
  projectId,
  dataset,
  token,
  allowEmpty,
});
if (known) console.log(`dataset holds ${known} published posts`);
let total = 0;
for (const channel of ORG_SECTIONS) {
  const result = await bake({
    channel,
    chrome: chromeFor(channel),
    host: hostFor(channel),
    outDir,
    projectId,
    dataset,
    token,
    stylesheets,
    allowEmpty,

    extraSitemapUrls: channel === "press" ? extraSitemapUrls : undefined,
  });
  total += result.pages;
  console.log(
    `baked ${result.pages} pages into ${outDir}${channel === "press" ? "/press" : "/" + channel}`,
  );
}
console.log(`baked ${total} org pages total`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
