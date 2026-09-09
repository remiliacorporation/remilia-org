import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bake } from "@remilia/renderer";
import {
  COM_POST_SECTIONS,
  NET_SECTIONS,
  ORG_SECTIONS,
  type Channel,
} from "@remilia/seo";
import { chromeFor, hostFor } from "./core/sections";

const post = (i: number) => ({
  title: `Post ${i}`,
  slug: `post-${i}`,
  excerpt: `Excerpt ${i}`,
  publishedAt: `2026-08-0${i}T00:00:00.000Z`,
  updatedAt: `2026-08-0${i}T00:00:00.000Z`,
  body: [
    {
      _type: "block",
      style: "normal",
      children: [{ _type: "span", text: "Body text. ".repeat(30) }],
    },
  ],
  authors: [{ name: "Remilia Jackson" }],
  tags: ["Theory"],
});

async function fixture(): Promise<{ url: string; close: () => void }> {
  const server: Server = createServer((req, res) => {
    const q = decodeURIComponent(new URL(req.url ?? "/", "http://x").search);
    const body = q.includes('_id == "org"')
      ? { result: { name: "Remilia Corporation" } }
      : q.includes("count(")
        ? { result: 2 }
        : { result: [post(1), post(2)] };
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  return { url: `http://127.0.0.1:${port}`, close: () => server.close() };
}

async function bakeSections(
  sections: Channel[],
): Promise<{ outDir: string; close: () => void }> {
  const f = await fixture();
  const outDir = await mkdtemp(join(tmpdir(), "host-bake-"));
  for (const channel of sections)
    await bake({
      channel,
      chrome: chromeFor(channel),
      host: hostFor(channel),
      outDir,
      projectId: "test",
      dataset: "production",
      token: "sk-test",
      apiHost: f.url,
      stylesheets: [],
    });
  return { outDir, close: f.close };
}

test("com bakes only its blog sections, dark red with no lattice", async () => {
  const { outDir, close } = await bakeSections(COM_POST_SECTIONS);
  try {
    const news = await readFile(join(outDir, "a/news/index.html"), "utf8");
    assert.match(news, /data-scheme="dark"/);
    assert.match(news, /data-hue="30"/);
    assert.match(news, /data-dots="none"/);
    assert.ok(news.includes("REMILIA — NEWS"), "wears the com wordmark");
    assert.ok(news.includes('href="https://remilia.com/"'), "links its own root");
    assert.ok(
      news.includes('<link rel="canonical" href="https://remilia.com/a/news">'),
    );
    await readFile(join(outDir, "a/events/index.html"), "utf8");
    await readFile(join(outDir, "a/news/rss.xml"), "utf8");
    // Nothing from another host leaked in.
    await assert.rejects(() => readFile(join(outDir, "updates/index.html")));
    await assert.rejects(() => readFile(join(outDir, "press/index.html")));
  } finally {
    close();
  }
});

test("net bakes only its blog sections, light blue with a sparse lattice", async () => {
  const { outDir, close } = await bakeSections(NET_SECTIONS);
  try {
    const devblog = await readFile(join(outDir, "blog/index.html"), "utf8");
    assert.match(devblog, /data-scheme="light"/);
    assert.match(devblog, /data-hue="255"/);
    assert.match(devblog, /data-dots="large"/);
    assert.ok(devblog.includes("REMILIANET — DEVBLOG"));
    assert.ok(devblog.includes('href="https://www.remilia.net/"'));
    assert.ok(
      devblog.includes(
        '<link rel="canonical" href="https://www.remilia.net/blog">',
      ),
    );
    await readFile(join(outDir, "updates/index.html"), "utf8");
    await assert.rejects(() => readFile(join(outDir, "a/news/index.html")));
  } finally {
    close();
  }
});

test("org still wears its own brand and pinned light theme", async () => {
  const { outDir, close } = await bakeSections([ORG_SECTIONS[0]]);
  try {
    const updates = await readFile(join(outDir, "updates/index.html"), "utf8");
    assert.match(updates, /data-scheme="light"/);
    assert.match(updates, /data-hue="30"/);
    assert.match(updates, /data-dots="small"/);
    assert.ok(updates.includes("REMILIA CORPORATION — UPDATES"));
    assert.ok(updates.includes('href="https://remilia.org/"'));
  } finally {
    close();
  }
});
