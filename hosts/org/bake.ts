import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ORG_SECTIONS } from "@remilia/seo";
import {
  assertDatasetReadable,
  bake,
  checkInternalLinks,
} from "@remilia/renderer";
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

// Every section is on disk now, so cross-section links can be resolved.
const broken = await checkInternalLinks(outDir, ["https://remilia.org"]);
if (broken.length) {
  const shown = broken
    .slice(0, 20)
    .map((b) => `  ${b.page} → ${b.href}`)
    .join("\n");
  const more =
    broken.length > 20 ? `\n  …and ${broken.length - 20} more` : "";
  if (process.env.ALLOW_BROKEN_LINKS === "1")
    console.warn(`${broken.length} dead internal links:\n${shown}${more}`);
  else
    throw new Error(
      `${broken.length} dead internal links — nothing links anywhere useful:\n${shown}${more}\n` +
        `Fix them, or set ALLOW_BROKEN_LINKS=1 to publish anyway.`,
    );
}
console.log(`internal links resolve across ${ORG_SECTIONS.length} sections`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
