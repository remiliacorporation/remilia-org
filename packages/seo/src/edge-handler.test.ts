import { test } from "node:test";
import assert from "node:assert/strict";
import { notFoundHandler as notFound } from "../../../netlify/edge-functions/not-found";

const served = (status: number, body = "<html>page</html>"): Response =>
  new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });

test("a mixed-case section URL is redirected before the origin is asked", async () => {
  let asked = false;
  const response = await notFound(
    new Request("https://remilia.org/Updates/Level-2-Notes?ref=x"),
    {
      next: () => {
        asked = true;
        return Promise.resolve(served(404));
      },
    },
  );
  assert.equal(response.status, 301);
  assert.equal(
    response.headers.get("location"),
    "https://remilia.org/updates/level-2-notes?ref=x",
    "query must survive the redirect",
  );
  assert.equal(asked, false, "no origin request needed for a case fix");
});

test("a corporate page redirects from IP country before the origin is asked", async () => {
  let asked = false;
  const response = await notFound(
    new Request("https://remilia.org/about?ref=x"),
    {
      next: () => {
        asked = true;
        return Promise.resolve(served(200));
      },
      geo: { country: { code: "KR" } },
    },
  );
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "https://remilia.org/kr/about?ref=x");
  assert.equal(asked, false);
});

test("a selector choice cleans the URL and saves the override", async () => {
  let cookie: { name: string; value: string } | undefined;
  const response = await notFound(
    new Request("https://remilia.org/cn/contact?lang=en&ref=x"),
    {
      next: () => Promise.resolve(served(200)),
      geo: { country: { code: "CN" } },
      cookies: {
        get: () => undefined,
        set: (options) => {
          cookie = options;
        },
      },
    },
  );
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "https://remilia.org/contact?ref=x");
  assert.equal(cookie?.name, "remilia_locale");
  assert.equal(cookie?.value, "en");
});

test("a served page passes through untouched", async () => {
  const page = served(200);
  const response = await notFound(
    new Request("https://remilia.org/updates/level-2-notes"),
    { next: () => Promise.resolve(page) },
  );
  assert.equal(response, page);
});

test("a missing rendition is answered in its own format", async () => {
  const response = await notFound(
    new Request("https://remilia.org/updates/gone.md"),
    { next: () => Promise.resolve(served(404)) },
  );
  assert.equal(response.status, 404);
  assert.match(response.headers.get("content-type") ?? "", /^text\/markdown/);
  const body = await response.text();
  assert.match(body, /Index: \/updates/);
  assert.ok(!body.includes("<html"));
});

test("a missing feed is answered as xml", async () => {
  const response = await notFound(
    new Request("https://remilia.org/press/rss.xml"),
    { next: () => Promise.resolve(served(404)) },
  );
  assert.match(response.headers.get("content-type") ?? "", /^application\/xml/);
  assert.match(await response.text(), /^<\?xml /);
});

test("a missing page keeps the HTML 404 the bake produced", async () => {
  const page = served(404, "<html>section 404</html>");
  const response = await notFound(
    new Request("https://remilia.org/updates/gone"),
    { next: () => Promise.resolve(page) },
  );
  assert.equal(response, page);
});

test("a case-sensitive asset is never rewritten", async () => {
  const asset = served(200, "png");
  const response = await notFound(
    new Request("https://remilia.org/assets/RQ.png"),
    { next: () => Promise.resolve(asset) },
  );
  assert.equal(response, asset);
});
