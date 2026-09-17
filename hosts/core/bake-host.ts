import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import {
  CHANNEL_BASEPATH,
  type Channel,
} from "@remilia/seo";
import {
  assertDatasetReadable,
  bake,
  checkInternalLinks,
  mergeRedirectBlock,
  type RedirectRule,
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
  /**
   * Bake the shared blog index — a listing-only surface pooling these channels
   * at /blog (org only). Posts, archives and feeds stay on their sections.
   */
  aggregate?: Channel[];
  /** Old top-level paths the sections used to live at — emits 301s. */
  movedFrom?: Partial<Record<Channel, string>>;
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
  // The blog surface: theme.css is the skin (tokens, hues, scheme, lattice,
  // dither); blog/ is the component system, concatenated in a fixed order.
  const stylesheets = [
    join(here, "theme.css"),
    ...[
      "base",
      "chrome",
      "controls",
      "index",
      "nav",
      "prose",
      "media",
      "notes",
      "layout",
      "print",
    ].map((n) => join(here, "blog", `${n}.css`)),
  ];
  const token = process.env.SANITY_TOKEN ?? process.env.SANITY_AUTH_TOKEN;
  const allowEmpty = process.env.ALLOW_EMPTY_BAKE === "1";
  const perspective =
    process.env.SANITY_PERSPECTIVE === "drafts" ? "drafts" : "published";

  // Credentials and the selected dataset view are proven before the first file
  // is written. Individual sections may be intentionally empty.
  const known = await assertDatasetReadable({
    projectId,
    dataset,
    token,
    allowEmpty,
    perspective,
  });
  if (known) console.log(`dataset holds ${known} ${perspective} posts`);

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
      perspective,
      stylesheets,
    });
    total += result.pages;
    console.log(`baked ${result.pages} pages for ${channel} into ${outDir}`);
  }
  if (spec.aggregate) {
    const result = await bake({
      channel: "blog",
      chrome: chromeFor("blog"),
      host: hostFor("blog"),
      outDir,
      projectId,
      dataset,
      token,
      perspective,
      stylesheets,
      aggregateOf: spec.aggregate,
    });
    total += result.pages;
    console.log(`baked aggregate index at /blog (${result.pages} pages)`);
  }
  console.log(`baked ${total} ${spec.name} pages total`);

  if (spec.movedFrom) {
    const rules = Object.entries(spec.movedFrom).flatMap(
      ([channel, oldPath]): RedirectRule[] => {
        const to = CHANNEL_BASEPATH[channel as Channel];
        return [
          { from: oldPath, to, status: 301 },
          { from: `${oldPath}/*`, to: `${to}/:splat`, status: 301 },
        ];
      },
    );
    const redirectsPath = join(outDir, "_redirects");
    let existing = "";
    try {
      existing = await readFile(redirectsPath, "utf8");
    } catch {
      existing = "/*    /404.html    404\n";
    }
    await writeFile(
      redirectsPath,
      mergeRedirectBlock(existing, "redirects:moved-sections", rules),
    );
    console.log(`redirects: ${rules.length / 2} moved sections 301 to /blog/*`);
  }

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
