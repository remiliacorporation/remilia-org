import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createClient } from "@sanity/client";
import {
  CHANNEL_BASEPATH,
  CHANNEL_HOST,
  HOST_AGGREGATE,
  canonicalFor,
  indexUrl,
  type Channel,
} from "@remilia/seo";
import {
  assertDatasetReadable,
  bake,
  checkInternalLinks,
  legacyHostRules,
  mergeRedirectBlock,
  movedHostRules,
  type ContentPerspective,
  type RedirectRule,
} from "@remilia/renderer";
import { BLOG_SHEETS, chromeFor, hostFor } from "./sections";

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
   * Bake the host's pooled index (`HOST_AGGREGATE`) — a listing-only surface
   * over these channels (`HOST_POOLED`). Posts, archives and feeds stay on
   * their sections; a section left out still bakes, it is only not listed.
   */
  aggregate?: Channel[];
  /** Old top-level paths the sections used to live at — emits 301s. */
  movedFrom?: Partial<Record<Channel, string>>;
  /**
   * A retired blog host served from this site as a domain alias. Every post
   * imported from it 301s to its canonical, on any host; other paths land on
   * this host's pooled index.
   */
  legacyHost?: LegacyHost;
}

export interface LegacyHost {
  origin: string;
  channels: Channel[];
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
    ...BLOG_SHEETS.map((n) => join(here, "blog", `${n}.css`)),
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
      hostPooled: spec.aggregate,
    });
    total += result.pages;
    console.log(`baked ${result.pages} pages for ${channel} into ${outDir}`);
  }
  const aggregate = HOST_AGGREGATE[CHANNEL_HOST[spec.sections[0]!]];
  if (spec.aggregate) {
    const result = await bake({
      channel: aggregate,
      chrome: chromeFor(aggregate),
      host: hostFor(aggregate),
      outDir,
      projectId,
      dataset,
      token,
      perspective,
      stylesheets,
      aggregateOf: spec.aggregate,
    });
    total += result.pages;
    console.log(
      `baked aggregate index at ${CHANNEL_BASEPATH[aggregate] || "/"} (${result.pages} pages)`,
    );
  }
  console.log(`baked ${total} ${spec.name} pages total`);

  if (spec.legacyHost) {
    const rules = await fetchLegacyRules(
      spec.legacyHost,
      indexUrl(aggregate),
      token,
      perspective,
    );
    await mergeInto(outDir, "redirects:legacy-host", rules);
    console.log(
      `redirects: ${(rules.length - 3) / 2} posts from ${spec.legacyHost.origin}`,
    );
  }

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
    await mergeInto(outDir, "redirects:moved-sections", rules);
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

/**
 * Forced rules for a retired blog host aliased to this site: each post
 * imported from it 301s to its canonical, every other path to `fallback`.
 */
async function fetchLegacyRules(
  legacy: LegacyHost,
  fallback: string,
  token: string | undefined,
  perspective: ContentPerspective,
  /** The section a post's canonical uses, when not its own (a moved host). */
  channelFor: (c: Channel) => Channel = (c) => c,
): Promise<RedirectRule[]> {
  const client = createClient({
    projectId,
    dataset,
    apiVersion: "2026-02-01",
    useCdn: false,
    token,
    perspective,
  });
  const posts = await client.fetch<
    { channel: Channel; slug: string; legacyUrl?: string }[]
  >(
    `*[_type == "post" && channel in $channels && defined(slug.current)]{
      channel, "slug": slug.current, "legacyUrl": migration.legacyUrl
    }`,
    { channels: legacy.channels },
  );
  return legacyHostRules(
    legacy.origin,
    posts.map((p) => ({
      legacyUrl: p.legacyUrl,
      canonical: canonicalFor(channelFor(p.channel), p.slug),
    })),
    fallback,
  );
}

export interface MovedHost {
  /** Label used in build output. */
  name: string;
  /** Default output directory, relative to the repo root. */
  outDir: string;
  /**
   * Each old section's base path on this host (`""` for the pooled index at
   * the site root) and the section that now holds its posts.
   */
  moves: { from: string; to: Channel }[];
  /** A retired blog host still aliased to this site; see `HostBake`. */
  legacyHost?: LegacyHost;
}

/**
 * A host whose sections all moved elsewhere bakes no pages: its output is a
 * `_redirects` that 301s every old URL to the same path under the section's
 * new home. Slugs, tag, author and month archives, feeds and maps keep their
 * names across the move, so a path-for-path splat lands each one on its
 * twin, and a stale path lands on that section's 404 there.
 */
export async function bakeMovedHost(spec: MovedHost): Promise<void> {
  const outDir = process.argv[2] ?? join(here, "../..", spec.outDir);
  await mkdir(outDir, { recursive: true });
  const token = process.env.SANITY_TOKEN ?? process.env.SANITY_AUTH_TOKEN;
  const perspective =
    process.env.SANITY_PERSPECTIVE === "drafts" ? "drafts" : "published";

  let text = `# ${spec.name} moved: every path 301s to its new home. Written by the bake.\n`;
  if (spec.legacyHost) {
    // Same guard as a full bake: the legacy map is read from Sanity, and a
    // tokenless or empty read would publish a map that sends every post to
    // the fallback.
    await assertDatasetReadable({
      projectId,
      dataset,
      token,
      allowEmpty: process.env.ALLOW_EMPTY_BAKE === "1",
      perspective,
    });
    const fallback = indexUrl(spec.moves[0]!.to);
    // A post still filed under a moved section links straight to its new
    // home, not through this host's own redirect.
    const movedTo = new Map(spec.moves.map((m) => [m.from, m.to]));
    const rules = await fetchLegacyRules(
      spec.legacyHost,
      fallback,
      token,
      perspective,
      (c) => movedTo.get(CHANNEL_BASEPATH[c]) ?? c,
    );
    // Host rules first: the path splats below match every host.
    text = mergeRedirectBlock(text, "redirects:legacy-host", rules);
    console.log(
      `redirects: ${(rules.length - 3) / 2} posts from ${spec.legacyHost.origin}`,
    );
  }
  const rules = movedHostRules(
    spec.moves.map((m) => ({ from: m.from, to: indexUrl(m.to) })),
  );
  text = mergeRedirectBlock(text, "redirects:moved-host", rules);
  await writeFile(join(outDir, "_redirects"), text);
  console.log(
    `redirects: ${spec.moves.length} ${spec.name} sections 301 to ${[
      ...new Set(spec.moves.map((m) => indexUrl(m.to))),
    ].join(", ")}`,
  );
}

export function runMovedHostBake(spec: MovedHost): void {
  bakeMovedHost(spec).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

async function mergeInto(
  outDir: string,
  block: string,
  rules: RedirectRule[],
): Promise<void> {
  const redirectsPath = join(outDir, "_redirects");
  let existing = "";
  try {
    existing = await readFile(redirectsPath, "utf8");
  } catch {
    existing = "/*    /404.html    404\n";
  }
  await writeFile(redirectsPath, mergeRedirectBlock(existing, block, rules));
}

export function runHostBake(spec: HostBake): void {
  bakeHost(spec).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
