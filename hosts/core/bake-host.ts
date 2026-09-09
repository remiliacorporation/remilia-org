import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Channel, SitemapEntry } from "@remilia/seo";
import {
  assertDatasetReadable,
  bake,
  checkInternalLinks,
} from "@remilia/renderer";
import { chromeFor, hostFor } from "./sections";

const here = dirname(fileURLToPath(import.meta.url));

export interface HostBake {
  /** Label used in build output. */
  name: string;
  /** Sections this host serves. */
  sections: Channel[];
  /** Default output directory, relative to the repo root. */
  outDir: string;
  /**
   * Origin whose absolute links resolve inside `outDir`. Omit for a host whose
   * root pages are published elsewhere — nothing under `outDir` can satisfy
   * `/favicon.ico` there, so the link check would report the whole head.
   */
  linkOrigin?: string;
  /** Extra sitemap entries, keyed by the section that should carry them. */
  extraSitemapUrls?: { channel: Channel; urls: SitemapEntry[] };
}

const projectId = "8x9419lh";
const dataset = "production";

/**
 * One bake entry for every host: same credentials, same guards, same
 * stylesheets. Hosts differ only in which sections they serve and where the
 * output lands.
 */
export async function bakeHost(spec: HostBake): Promise<void> {
  const outDir = process.argv[2] ?? join(here, "../..", spec.outDir);
  const stylesheets = [join(here, "blog-core.css"), join(here, "theme.css")];
  const token = process.env.SANITY_TOKEN ?? process.env.SANITY_AUTH_TOKEN;
  const allowEmpty = process.env.ALLOW_EMPTY_BAKE === "1";

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
  for (const channel of spec.sections) {
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
      extraSitemapUrls:
        spec.extraSitemapUrls?.channel === channel
          ? spec.extraSitemapUrls.urls
          : undefined,
    });
    total += result.pages;
    console.log(`baked ${result.pages} pages for ${channel} into ${outDir}`);
  }
  console.log(`baked ${total} ${spec.name} pages total`);

  if (!spec.linkOrigin) return;

  // Every section is on disk now, so cross-section links can be resolved.
  const broken = await checkInternalLinks(outDir, [spec.linkOrigin]);
  if (broken.length) {
    const shown = broken
      .slice(0, 20)
      .map((b) => `  ${b.page} → ${b.href}`)
      .join("\n");
    const more = broken.length > 20 ? `\n  …and ${broken.length - 20} more` : "";
    if (process.env.ALLOW_BROKEN_LINKS === "1")
      console.warn(`${broken.length} dead internal links:\n${shown}${more}`);
    else
      throw new Error(
        `${broken.length} dead internal links — nothing links anywhere useful:\n${shown}${more}\n` +
          `Fix them, or set ALLOW_BROKEN_LINKS=1 to publish anyway.`,
      );
  }
  console.log(`internal links resolve across ${spec.sections.length} sections`);
}

export function runHostBake(spec: HostBake): void {
  bakeHost(spec).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
