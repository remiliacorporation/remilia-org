import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { bake } from "@remilia/renderer";
import { BLOG_STYLESHEETS } from "../core/bake-host";
import { chromeFor, hostFor } from "../core/sections";
import { routeFor, startPreviewServer } from "./server";

const here = dirname(fileURLToPath(import.meta.url));

/** A stand-in for a stega payload: a long run of the four zero-width code points. */
const STEGA = "​‌‍﻿".repeat(8);
/** Stega runs are dozens of characters; emoji ZWJ sequences never repeat one. */
const STEGA_RUN = /[​‌‍﻿]{4,}/;
const OVERLAY_CODE = /__ve\/|visual-editing|sanity-visual-editing|enableVisualEditing|core-loader/;

const post = (title: string, mark = STEGA) => ({
  title,
  slug: "hello",
  excerpt: "An excerpt.",
  publishedAt: "2026-10-01T00:00:00.000Z",
  body: [
    {
      _type: "block",
      _key: "a",
      style: "h2",
      markDefs: [],
      children: [{ _type: "span", _key: "s", text: `Heading${mark}`, marks: [] }],
    },
    {
      _type: "block",
      _key: "b",
      style: "normal",
      markDefs: [],
      children: [{ _type: "span", _key: "t", text: `Paragraph text.${mark}`, marks: [] }],
    },
  ],
  authors: [{ name: "Remilia Jackson" }],
  tags: ["Notes"],
});

test("paths resolve to their section and slug", () => {
  assert.deepEqual(routeFor("/blog/press/hello"), { channel: "press", slug: "hello" });
  assert.deepEqual(routeFor("/blog/press/hello/"), { channel: "press", slug: "hello" });
  assert.deepEqual(routeFor("/blog/press/"), { channel: "press", slug: "" });
  assert.deepEqual(routeFor("/blog/press/tags/notes/"), { channel: "press", slug: "" });
  assert.deepEqual(routeFor("/a/blog/events/party"), { channel: "events", slug: "party" });
  // blog.remilia.net's /updates is its own section, not remilia.org's.
  assert.deepEqual(routeFor("/updates/v1"), { channel: "dev-updates", slug: "v1" });
  assert.deepEqual(routeFor("/blog/updates/v1"), { channel: "updates", slug: "v1" });
  assert.equal(routeFor("/blog/"), undefined);
  assert.equal(routeFor("/"), undefined);
});

test("the preview bakes the posted drafts and keeps their stega", async () => {
  const preview = await startPreviewServer({ port: 0, studioUrl: "http://localhost:3333" });
  const address = preview.server.address();
  const origin = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
  try {
    const shell = await fetch(`${origin}/blog/press/hello`);
    assert.equal(shell.status, 200);
    const shellHtml = await shell.text();
    assert.match(shellHtml, /"channel":"press"/);
    assert.match(shellHtml, /"slug":"hello"/);
    assert.match(shellHtml, /src="\/__ve\/client\.js"/);
    assert.match(shell.headers.get("content-security-policy") ?? "", /frame-ancestors/);
    // The shell itself carries no content: drafts only arrive from the Studio.
    assert.doesNotMatch(shellHtml, /Paragraph text/);

    const client = await fetch(`${origin}/__ve/client.js`);
    assert.equal(client.status, 200);
    assert.match(await client.text(), /\/__ve\/standalone\/index\.js/);
    assert.equal((await fetch(`${origin}/__ve/standalone/index.js`)).status, 200);

    const render = await fetch(`${origin}/__ve/render`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        pathname: "/blog/press/hello/",
        data: { posts: [post(`Hello${STEGA}`)], org: null, doc: null },
      }),
    });
    assert.equal(render.status, 200);
    const page = await render.text();
    assert.ok(page.includes(`<h1>Hello${STEGA}</h1>`), "title keeps its stega");
    assert.ok(page.includes(`Paragraph text.${STEGA}`), "body text keeps its stega");
    assert.match(page, /<h2[^>]*>/, "style stays clean, so headings still render");
    assert.match(page, /href="\/blog\/press\/blog\.css\?v=/);

    const css = await fetch(`${origin}/blog/press/blog.css`);
    assert.equal(css.status, 200);

    const missing = await fetch(`${origin}/__ve/render`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        pathname: "/blog/press/nope/",
        data: { posts: [post("Hello")], org: null },
      }),
    });
    assert.equal(missing.status, 404);
  } finally {
    preview.close();
  }
});

async function filesUnder(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await filesUnder(path)));
    else out.push(path);
  }
  return out;
}

test("the production bake ships no stega and no overlay code", async () => {
  // The bake's Sanity client never enables stega, and nothing it imports
  // reaches the visual-editing packages.
  for (const file of [
    "../../packages/renderer/src/bake.ts",
    "../../packages/renderer/src/guard.ts",
    "../core/bake-host.ts",
  ]) {
    const source = await readFile(join(here, file), "utf8");
    assert.doesNotMatch(source, /stega|visual-editing|visual-preview|core-loader/, file);
  }

  const api: Server = createServer((req, res) => {
    const query = new URL(req.url ?? "/", "http://x").searchParams.get("query") ?? "";
    const result = query.includes('_id == "org"') ? null : [post("Hello", "")];
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ result }));
  });
  await new Promise<void>((ok) => api.listen(0, "127.0.0.1", ok));
  const address = api.address();
  const outDir = await mkdtemp(join(tmpdir(), "remilia-prod-bake-"));
  try {
    await bake({
      channel: "press",
      chrome: chromeFor("press"),
      host: hostFor("press"),
      outDir,
      projectId: "8x9419lh",
      dataset: "production",
      apiHost: `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`,
      stylesheets: BLOG_STYLESHEETS,
    });
    const files = await filesUnder(outDir);
    assert.ok(files.some((f) => f.endsWith(join("hello", "index.html"))));
    for (const file of files) {
      const text = await readFile(file, "utf8");
      assert.doesNotMatch(text, STEGA_RUN, file);
      assert.doesNotMatch(text, OVERLAY_CODE, file);
    }
  } finally {
    api.close();
  }
});
