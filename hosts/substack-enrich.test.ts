import assert from "node:assert/strict";
import { test } from "node:test";
import { enrichSubstackBody, substackExcerpt } from "./substack-import";

test("prepends subtitle and promotes alt to caption", () => {
  const body = enrichSubstackBody(
    [
      {
        _type: "image",
        _key: "b0",
        alt: "Chinese Dress cheongsam",
        asset: { url: "https://example.com/a.jpg" },
      },
    ],
    { title: "oppa Cheongsam style", subtitle: "", description: "" },
  );
  assert.equal(body.length, 1);
  assert.equal(body[0]._type, "image");
  assert.equal(body[0].caption, "Chinese Dress cheongsam");
});

test("Dawg gets subtitle block plus keeps caption", () => {
  const body = enrichSubstackBody(
    [
      {
        _type: "image",
        _key: "b0",
        alt: "Image",
        caption: "Waaaaa!!",
        asset: { url: "https://example.com/a.jpg" },
      },
    ],
    { title: "Dawg", subtitle: "Here we fucking go again" },
  );
  assert.equal(body[0]._type, "block");
  assert.equal(body[0].children?.[0]?.text, "Here we fucking go again");
  assert.equal(body[1]._type, "image");
  assert.equal(body[1].caption, "Waaaaa!!");
  assert.equal(
    substackExcerpt({ title: "Dawg", subtitle: "Here we fucking go again" }, body),
    "Here we fucking go again",
  );
});

