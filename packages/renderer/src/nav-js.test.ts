import { mock, test } from "node:test";
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
  // Only a section listing redirects an old ?month= link.
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

/** Runs NAV_JS on a page holding one dropdown; returns its event hooks. */
function runDropdown(): {
  details: { open: boolean; focused: boolean };
  fire: (type: string, pointerType?: string) => void;
} {
  const hooks = new Map<string, (e: object) => void>();
  const details = {
    open: false,
    focused: false,
    addEventListener: (type: string, fn: (e: object) => void) =>
      hooks.set(type, fn),
    querySelector: (sel: string) =>
      sel === ":focus-visible" && details.focused ? {} : null,
  };
  const document = {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: (sel: string) => (sel === "details.sel" ? [details] : []),
    addEventListener: () => {},
    documentElement: { style: {} },
  };
  new Function(
    "document",
    "location",
    "addEventListener",
    "matchMedia",
    NAV_JS,
  )(
    document,
    { pathname: "/", search: "" },
    () => {},
    () => ({ matches: true }),
  );
  return {
    details,
    fire: (type, pointerType = "mouse") => hooks.get(type)?.({ pointerType }),
  };
}

test("a dropdown the mouse leaves closes after half a second", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const { details, fire } = runDropdown();
    details.open = true;
    fire("pointerleave");
    mock.timers.tick(200);
    assert.equal(details.open, true, "still open at 200ms");
    mock.timers.tick(300);
    assert.equal(details.open, false, "closed at 500ms");
  } finally {
    mock.timers.reset();
  }
});

test("returning to the dropdown in time keeps it open", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const { details, fire } = runDropdown();
    details.open = true;
    fire("pointerleave");
    mock.timers.tick(300);
    fire("pointerenter");
    mock.timers.tick(1000);
    assert.equal(details.open, true);
  } finally {
    mock.timers.reset();
  }
});

test("touch and keyboard focus never close a dropdown on leave", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const touch = runDropdown();
    touch.details.open = true;
    touch.fire("pointerleave", "touch");
    mock.timers.tick(1000);
    assert.equal(touch.details.open, true, "touch leave is ignored");

    const keyboard = runDropdown();
    keyboard.details.open = true;
    keyboard.details.focused = true;
    keyboard.fire("pointerleave");
    mock.timers.tick(1000);
    assert.equal(keyboard.details.open, true, "keyboard focus holds it open");
  } finally {
    mock.timers.reset();
  }
});
