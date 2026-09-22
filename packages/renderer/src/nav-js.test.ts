import { test } from "node:test";
import assert from "node:assert/strict";
import { NAV_JS } from "./nav";

/**
 * Runs NAV_JS against a listing page reduced to what its scripts query:
 * the masthead heading (with its data-* filters) and one card.
 */
function runListing(
  path: string,
  search: string,
  heading: Record<string, string>,
): { replaced?: string; text: string } {
  const statusEl = { dataset: heading, textContent: "" };
  const card = {
    dataset: { title: "Post", excerpt: "", cat: "Updates", author: "" },
    hidden: false,
  };
  let replaced: string | undefined;
  const document = {
    getElementById: () => null,
    querySelector: (sel: string) => (sel === ".index-mast h1" ? statusEl : null),
    querySelectorAll: (sel: string) => (sel === ".post-card" ? [card] : []),
    addEventListener: () => {},
    documentElement: { style: {} },
  };
  const location = {
    pathname: path,
    search,
    href: `https://remilia.org${path}${search}`,
    replace: (to: string) => {
      replaced = to;
    },
  };
  new Function(
    "document",
    "location",
    "addEventListener",
    "matchMedia",
    NAV_JS,
  )(document, location, () => {}, () => ({ matches: true }));
  return { replaced, text: statusEl.textContent };
}

test("an old ?month= link on a section index lands on the month archive", () => {
  assert.equal(
    runListing("/blog/updates/", "?month=2024-12", { section: "Updates" }).replaced,
    "/blog/updates/months/2024-12/",
  );
  assert.equal(
    runListing("/blog/updates/page/2", "?month=2024-04", { section: "Updates" })
      .replaced,
    "/blog/updates/months/2024-04/",
  );
});

test("a malformed or out-of-place ?month= does not redirect", () => {
  for (const month of ["2024-13", "2024-1", "december", ""])
    assert.equal(
      runListing("/blog/updates/", `?month=${month}`, { section: "Updates" })
        .replaced,
      undefined,
    );
  // The pooled index has no month archives.
  assert.equal(runListing("/blog/", "?month=2024-12", {}).replaced, undefined);
});

test("a month archive keeps its month in the status line", () => {
  const { replaced, text } = runListing("/blog/updates/months/2024-12/", "", {
    section: "Updates",
    month: "December 2024",
  });
  assert.equal(replaced, undefined);
  assert.equal(text, "Showing all Updates posts from December 2024");
});
