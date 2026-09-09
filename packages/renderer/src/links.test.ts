import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  candidateFiles,
  checkInternalLinks,
  internalHrefs,
  redirectSources,
} from "./links";

test("same-origin absolute links are normalized to paths", () => {
  const html = `<a href="https://remilia.org/press/x">a</a>
<a href="/updates">b</a>
<a href="https://remilia.com/a/news">off-host</a>
<a href="mailto:corporate@remilia.org">mail</a>
<a href="#top">anchor</a>
<a href="/updates/x?ref=1#frag">query</a>
<img src="/assets/logo.png">`;
  assert.deepEqual(internalHrefs(html, ["https://remilia.org"]), [
    "/press/x",
    "/updates",
    "/updates/x",
    "/assets/logo.png",
  ]);
});

test("a path is satisfied by a file, an .html sibling, or a directory index", () => {
  assert.deepEqual(candidateFiles("/updates"), [
    "updates",
    "updates.html",
    "updates/index.html",
  ]);
  assert.deepEqual(candidateFiles("/"), ["index.html"]);
});

test("redirect sources include splat prefixes that deliver a page", () => {
  const { exact, prefixes } = redirectSources(`# comment
/jobs    /careers   301
/old-section/*  /updates/:splat  301
/updates/*  /updates/404.html  404
https://blog.remilia.org/  /press/  301!`);
  assert.ok(exact.has("/jobs"));
  assert.deepEqual(prefixes, ["/old-section/"]);
  assert.ok(!exact.has("https://blog.remilia.org/"), "off-host is not a path");
});

test("the catch-all 404 rule does not count as coverage", () => {
  const { exact, prefixes } = redirectSources(`/updates/*  /updates/404.html  404
/*    /404.html    404
/old  /new  301`);
  assert.deepEqual(prefixes, [], "404 splats must not cover every path");
  assert.deepEqual([...exact], ["/old"]);
});

test("a dead link survives the catch-all rule", async () => {
  const dir = await mkdtemp(join(tmpdir(), "links-catchall-"));
  await writeFile(join(dir, "index.html"), "<a href='/nowhere'>x</a>");
  await writeFile(join(dir, "_redirects"), "/*    /404.html    404\n");
  assert.deepEqual(await checkInternalLinks(dir, ["https://remilia.org"]), [
    { page: "index.html", href: "/nowhere" },
  ]);
});

test("dead links are reported and redirect-covered ones are not", async () => {
  const dir = await mkdtemp(join(tmpdir(), "links-"));
  await mkdir(join(dir, "updates"), { recursive: true });
  await writeFile(join(dir, "index.html"), "<a href='/updates'>x</a>");
  await writeFile(
    join(dir, "updates/index.html"),
    `<a href="/updates/real">live</a>
<a href="/updates/ghost">dead</a>
<a href="/jobs">redirected</a>
<a href="https://remilia.com/off">external</a>`,
  );
  await writeFile(join(dir, "updates/real.html"), "ok");
  await writeFile(join(dir, "_redirects"), "/jobs  /careers  301\n");

  const broken = await checkInternalLinks(dir, ["https://remilia.org"]);
  assert.deepEqual(broken, [
    { page: "updates/index.html", href: "/updates/ghost" },
  ]);
});

test("the source directory is not audited as output", async () => {
  const dir = await mkdtemp(join(tmpdir(), "links-src-"));
  await mkdir(join(dir, "src"), { recursive: true });
  await writeFile(join(dir, "src/index.html"), "<a href='/nowhere'>x</a>");
  await writeFile(join(dir, "index.html"), "<p>ok</p>");
  assert.deepEqual(await checkInternalLinks(dir, ["https://remilia.org"]), []);
});
