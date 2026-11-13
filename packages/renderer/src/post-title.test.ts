import { test } from "node:test";
import assert from "node:assert/strict";
import { postTitle } from "./post";

test("a post's title ends with its authors, not the section or the company", () => {
  assert.equal(
    postTitle({ title: "AI 2084", authors: [{ name: "Bonkle K. Bonkleman" }] }),
    "AI 2084 — Bonkle K. Bonkleman",
  );
  assert.equal(
    postTitle({ title: "Two", authors: [{ name: "A" }, { name: "B" }] }),
    "Two — A, B",
  );
});

test("a post with no author keeps its title alone", () => {
  assert.equal(postTitle({ title: "Untitled" }), "Untitled");
  assert.equal(postTitle({ title: "Empty", authors: [] }), "Empty");
});

test("outside coverage ends with its outlet", () => {
  assert.equal(
    postTitle({ title: "Coverage", origin: "external", outlet: "Decrypt" }),
    "Coverage — Decrypt",
  );
});
