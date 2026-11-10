/**
 * Visual-editing preview for Sanity's Presentation tool.
 *
 * The page a reader would get, rendered by the production `bake()` from the
 * draft data the Studio streams into the preview. The server holds no
 * Sanity token and fetches nothing: the browser asks the Studio for the
 * section's posts over Presentation's live mode, posts them here, and gets
 * the baked page back. Outside the Studio there is no data, so nothing in
 * draft is ever served.
 */
import { createReadStream, existsSync, statSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { ORG_QUERY, POSTS_QUERY, bake } from "@remilia/renderer";
import { CHANNEL_BASEPATH, type Channel } from "@remilia/seo";
import { BLOG_STYLESHEETS } from "../core/bake-host";
import { chromeFor, hostFor } from "../core/sections";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

export const PROJECT_ID = "8x9419lh";
export const DATASET = "production";

/** Sections with post pages. Pooled indexes are listing-only and not previewed. */
export const PREVIEW_CHANNELS: Channel[] = [
  "updates",
  "press",
  "thought",
  "archive",
  "news",
  "events",
  "dev-updates",
  "dev-blog",
];

/**
 * One live query per page: the section's posts exactly as the bake fetches
 * them, the org record, and the id of the post on screen (for edit targets
 * that carry no text, such as the byline and date).
 */
export const LIVE_QUERY = `{
  "posts": (${POSTS_QUERY}),
  "org": ${ORG_QUERY},
  "doc": *[_type == "post" && channel == $channel && slug.current == $slug][0]{ _id, _type }
}`;

export interface LiveData {
  posts: unknown[];
  org: unknown;
  doc?: { _id: string; _type: string } | null;
}

/** The section a path belongs to and the slug under it, if any. */
export function routeFor(
  pathname: string,
): { channel: Channel; slug: string } | undefined {
  const path = pathname.replace(/\/+$/, "");
  const hits = PREVIEW_CHANNELS.filter((c) => {
    const base = CHANNEL_BASEPATH[c];
    return path === base || path.startsWith(`${base}/`);
  }).sort((a, b) => CHANNEL_BASEPATH[b].length - CHANNEL_BASEPATH[a].length);
  const channel = hits[0];
  if (!channel) return undefined;
  const rest = path.slice(CHANNEL_BASEPATH[channel].length).replace(/^\//, "");
  const slug = rest.includes("/") ? "" : rest;
  return { channel, slug };
}

/**
 * Bakes one section from `data` and returns the page at `pathname`, or
 * undefined when the bake wrote nothing there.
 */
export function createRenderer(workDir: string) {
  let current: LiveData = { posts: [], org: null };
  const api: Server = createServer((req, res) => {
    const query = new URL(req.url ?? "/", "http://x").searchParams.get("query") ?? "";
    const result = query.includes('_id == "org"') ? current.org : current.posts;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ result }));
  });
  const listening = new Promise<string>((ok) =>
    api.listen(0, "127.0.0.1", () => {
      const a = api.address();
      ok(`http://127.0.0.1:${typeof a === "object" && a ? a.port : 0}`);
    }),
  );
  // Bakes share the fake API's data, so they run one at a time, and a bake
  // that a newer edit has overtaken is skipped (null).
  let queue: Promise<unknown> = Promise.resolve();
  let latest = 0;

  async function render(
    channel: Channel,
    pathname: string,
    data: LiveData,
  ): Promise<string | undefined | null> {
    const ticket = ++latest;
    const run = queue.then(async () => {
      if (ticket !== latest) return null;
      current = data;
      const outDir = join(workDir, channel);
      await mkdir(outDir, { recursive: true });
      await bake({
        channel,
        chrome: chromeFor(channel),
        host: hostFor(channel),
        outDir,
        projectId: PROJECT_ID,
        dataset: DATASET,
        apiHost: await listening,
        perspective: "drafts",
        stylesheets: BLOG_STYLESHEETS,
      });
      const file = pageFile(outDir, pathname);
      return file ? readFile(file, "utf8") : undefined;
    });
    queue = run.catch(() => undefined);
    return run;
  }

  return {
    render,
    close: () => {
      api.close();
      api.closeAllConnections();
    },
  };
}

function pageFile(root: string, pathname: string): string | undefined {
  const file = resolve(root, `.${pathname}`);
  if (file !== root && !file.startsWith(root + sep)) return undefined;
  for (const candidate of [join(file, "index.html"), `${file}.html`, file]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return undefined;
}

function shell(opts: {
  channel?: Channel;
  slug: string;
  studioUrl: string;
}): string {
  const config = {
    projectId: PROJECT_ID,
    dataset: DATASET,
    studioUrl: opts.studioUrl,
    query: LIVE_QUERY,
    channel: opts.channel ?? null,
    slug: opts.slug,
  };
  const sections = PREVIEW_CHANNELS.map(
    (c) => `<li><a href="${CHANNEL_BASEPATH[c]}/">${c}</a></li>`,
  ).join("");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Preview</title>
<style>
.ve-note{font:14px/1.5 system-ui,sans-serif;max-width:40em;margin:15vh auto;padding:0 16px;color:#333}
.ve-note[hidden]{display:none}
</style>
<script type="application/json" id="ve-config">${JSON.stringify(config).replace(/</g, "\\u003c")}</script>
<script type="module" src="/__ve/client.js"></script>
</head>
<body>
<div class="ve-note" id="ve-note" hidden>
<p id="ve-message">${opts.channel ? "Open this page from the Presentation tool in Remilia Studio. The preview renders drafts only there." : "Pick a section to preview."}</p>
<ul>${sections}</ul>
</div>
</body>
</html>`;
}

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
  ".xml": "application/xml",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

async function bundleClient(): Promise<string> {
  const out = await build({
    entryPoints: [join(here, "client.ts")],
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    target: "es2022",
    minify: false,
    logLevel: "warning",
    plugins: [
      {
        // The standalone overlay package is served as-is: it lazy-loads its
        // own chunks by relative URL.
        name: "standalone-external",
        setup(b) {
          b.onResolve({ filter: /^@sanity\/visual-editing-standalone$/ }, () => ({
            path: "/__ve/standalone/index.js",
            external: true,
          }));
        },
      },
    ],
  });
  return out.outputFiles[0]!.text;
}

async function readBody(req: IncomingMessage, limit = 64 * 1024 * 1024): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new Error("body too large");
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function startPreviewServer(opts: {
  port: number;
  host?: string;
  studioUrl: string;
  /** Origins allowed to frame the preview and call the renderer. */
  frameAncestors?: string[];
}): Promise<{ server: Server; close: () => void }> {
  const clientJs = await bundleClient();
  const standaloneDir = dirname(require.resolve("@sanity/visual-editing-standalone"));
  const deployDir = resolve(here, "../../deploy");
  const workDir = await mkdtemp(join(tmpdir(), "remilia-visual-preview-"));
  const renderer = createRenderer(workDir);
  const ancestors = opts.frameAncestors ?? [
    opts.studioUrl,
    "http://localhost:*",
    "http://127.0.0.1:*",
  ];

  const serveFile = (res: import("node:http").ServerResponse, root: string, rel: string): boolean => {
    const file = resolve(root, `.${rel}`);
    if (file !== root && !file.startsWith(root + sep)) return false;
    if (!existsSync(file) || !statSync(file).isFile()) return false;
    res.writeHead(200, {
      "content-type": TYPES[extname(file)] ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    createReadStream(file).pipe(res);
    return true;
  };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://preview");
    let path: string;
    try {
      path = decodeURIComponent(url.pathname);
    } catch {
      res.writeHead(400).end("Bad request");
      return;
    }
    res.setHeader("x-robots-tag", "noindex");
    res.setHeader(
      "content-security-policy",
      `frame-ancestors 'self' ${ancestors.join(" ")}`,
    );
    try {
      if (path === "/__ve/client.js") {
        res.writeHead(200, { "content-type": TYPES[".js"], "cache-control": "no-store" });
        res.end(clientJs);
        return;
      }
      if (path.startsWith("/__ve/standalone/")) {
        if (serveFile(res, standaloneDir, path.slice("/__ve/standalone".length))) return;
        res.writeHead(404).end();
        return;
      }
      if (path === "/__ve/render" && req.method === "POST") {
        const { pathname, data } = JSON.parse(await readBody(req)) as {
          pathname: string;
          data: LiveData;
        };
        const route = routeFor(pathname);
        if (!route || !Array.isArray(data?.posts)) {
          res.writeHead(404, { "content-type": "text/plain" }).end("not a preview path");
          return;
        }
        const html = await renderer.render(route.channel, pathname, data);
        if (html === null) {
          res.writeHead(409, { "content-type": "text/plain" }).end("superseded");
          return;
        }
        if (!html) {
          res.writeHead(404, { "content-type": "text/plain" }).end(
            "Nothing at this path yet. A post needs a slug and a date to get a page.",
          );
          return;
        }
        res.writeHead(200, { "content-type": TYPES[".html"], "cache-control": "no-store" });
        res.end(html);
        return;
      }
      if (req.method !== "GET" && req.method !== "HEAD") {
        res.writeHead(405).end();
        return;
      }
      const route = routeFor(path);
      // Section assets (blog.css, nav.js, gallery.js) come from the last bake.
      if (route && extname(path) && serveFile(res, join(workDir, route.channel), path)) return;
      if (extname(path) && serveFile(res, deployDir, path)) return;
      if (extname(path) && path !== "/index.html") {
        res.writeHead(404, { "content-type": "text/plain" }).end("not found");
        return;
      }
      res.writeHead(200, { "content-type": TYPES[".html"], "cache-control": "no-store" });
      res.end(shell({ channel: route?.channel, slug: route?.slug ?? "", studioUrl: opts.studioUrl }));
    } catch (error) {
      console.error(error);
      if (!res.headersSent) res.writeHead(500, { "content-type": "text/plain" });
      res.end(error instanceof Error ? error.message : String(error));
    }
  });

  await new Promise<void>((ok) => server.listen(opts.port, opts.host ?? "127.0.0.1", ok));
  return {
    server,
    close: () => {
      server.close();
      server.closeAllConnections();
      renderer.close();
      void rm(workDir, { recursive: true, force: true });
    },
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 3334);
  const studioUrl = process.env.SANITY_STUDIO_URL ?? "http://localhost:3333";
  const extra = (process.env.PREVIEW_FRAME_ANCESTORS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  await startPreviewServer({
    port,
    host: process.env.HOST ?? "127.0.0.1",
    studioUrl,
    frameAncestors: [
      studioUrl,
      "http://localhost:*",
      "http://127.0.0.1:*",
      "https://remilia.sanity.studio",
      ...extra,
    ],
  });
  console.log(`visual preview at http://${process.env.HOST ?? "127.0.0.1"}:${port}/ (Studio ${studioUrl})`);
}
