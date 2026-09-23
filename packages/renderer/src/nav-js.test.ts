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

/** A minimal element tree: enough for the dropdown scripts' closest() and
 * querySelector() calls, and for a summary click's native toggle. */
interface Node {
  tag: string;
  cls: string[];
  id?: string;
  attrs: Record<string, string>;
  dataset: Record<string, string>;
  textContent: string;
  open: boolean;
  parent?: Node;
  kids: Node[];
  hooks: Map<string, ((e: object) => void)[]>;
  closest: (sel: string) => Node | null;
  querySelector: (sel: string) => Node | null;
  getAttribute: (name: string) => string | null;
  addEventListener: (type: string, fn: (e: object) => void) => void;
}

function el(
  tag: string,
  props: { cls?: string; id?: string; attrs?: Record<string, string>; text?: string; value?: string } = {},
  kids: Node[] = [],
): Node {
  const node: Node = {
    tag,
    cls: props.cls ? props.cls.split(" ") : [],
    id: props.id,
    attrs: props.attrs ?? {},
    dataset: props.value === undefined ? {} : { value: props.value },
    textContent: props.text ?? "",
    open: false,
    kids,
    hooks: new Map(),
    closest: (sel) => {
      for (let n: Node | undefined = node; n; n = n.parent) if (matches(n, sel)) return n;
      return null;
    },
    querySelector: (sel) => {
      const walk = (n: Node): Node | null => {
        for (const k of n.kids) {
          if (matches(k, sel)) return k;
          const hit = walk(k);
          if (hit) return hit;
        }
        return null;
      };
      return walk(node);
    },
    getAttribute: (name) => node.attrs[name] ?? null,
    addEventListener: (type, fn) =>
      node.hooks.set(type, [...(node.hooks.get(type) ?? []), fn]),
  };
  for (const k of kids) k.parent = node;
  return node;
}

function matches(n: Node, sel: string): boolean {
  const inMenu = () => !!n.parent?.closest(".sel-menu");
  switch (sel) {
    case ".sel-mark":
    case ".sel-label":
    case ".sel-menu":
      return n.cls.includes(sel.slice(1));
    case "summary":
      return n.tag === "summary";
    case "details.sel":
      return n.tag === "details" && n.cls.includes("sel");
    case ".sel-menu button":
      return n.tag === "button" && inMenu();
    case ".sel-menu button[data-href]":
      return n.tag === "button" && "data-href" in n.attrs && inMenu();
    default:
      return false;
  }
}

const option = (value: string, text: string, href?: string): Node =>
  el("li", {}, [
    el("button", {
      text,
      attrs: { "data-value": value, ...(href ? { "data-href": href } : {}) },
    }),
  ]);

const dropdown = (id: string, value: string, label: string, items: Node[]): Node =>
  el("details", { cls: "sel", id, value }, [
    el("summary", {}, [el("span", { cls: "sel-label", text: label }), el("span", { cls: "sel-mark" })]),
    el("ul", { cls: "sel-menu" }, items),
  ]);

/**
 * Runs NAV_JS on a listing holding the author, date and section dropdowns,
 * the date one on the September 2023 archive with 2023 expanded. `click`
 * dispatches like a browser: target up to the window, then a summary's
 * native toggle unless the default was prevented.
 */
function runControls() {
  const year = el("details", {}, [
    el("summary", {}, [el("span", { cls: "sel-label", text: "2023" }), el("span", { cls: "sel-mark" })]),
    el("ul", { cls: "sel-sub" }, [
      option("2023-11", "November", "/blog/updates/months/2023-11"),
      option("2023-09", "September", "/blog/updates/months/2023-09"),
    ]),
  ]);
  year.open = true;
  const date = dropdown("post-date", "2023-09", "September 2023", [
    option("", "All dates", "/blog/updates"),
    option("2024-12", "December 2024", "/blog/updates/months/2024-12"),
    el("li", { cls: "sel-year" }, [year]),
  ]);
  const author = dropdown("post-author", "Charlotte Fang", "Charlotte Fang", [
    option("", "All authors"),
    option("Charlotte Fang", "Charlotte Fang"),
  ]);
  const section = dropdown("site-sec", "Updates", "Updates", [
    option("All posts", "All posts", "/blog"),
    option("Updates", "Updates", "/blog/updates"),
  ]);
  const body = el("body", {}, [author, date, section]);
  const sels = [author, date, section];
  const byId: Record<string, Node> = { "post-date": date, "post-author": author, "site-sec": section };
  const statusEl = { dataset: { section: "Updates", month: "September 2023" }, textContent: "" };
  const card = { dataset: { title: "Post", excerpt: "", cat: "Updates", author: "" }, hidden: false };
  const windowHooks = new Map<string, ((e: object) => void)[]>();
  const assigned: string[] = [];
  const document = {
    getElementById: (id: string) => byId[id] ?? null,
    querySelector: (sel: string) => (sel === ".index-mast h1" ? statusEl : null),
    querySelectorAll: (sel: string) =>
      sel === ".post-card"
        ? [card]
        : sel === "details.sel"
          ? sels
          : sel === "details.sel[open]"
            ? sels.filter((s) => s.open)
            : [],
    addEventListener: () => {},
    documentElement: { style: {} },
  };
  const location = {
    pathname: "/blog/updates/months/2023-09/",
    search: "",
    href: "https://remilia.org/blog/updates/months/2023-09/",
    replace: () => {},
    assign: (to: string) => assigned.push(to),
  };
  new Function(
    "document",
    "location",
    "addEventListener",
    "matchMedia",
    "CSS",
    NAV_JS,
  )(
    document,
    location,
    (type: string, fn: (e: object) => void) =>
      windowHooks.set(type, [...(windowHooks.get(type) ?? []), fn]),
    () => ({ matches: true }),
    { escape: (s: string) => s },
  );
  const fire = (hooks: ((e: object) => void)[] | undefined, e: object) =>
    (hooks ?? []).forEach((fn) => fn(e));
  const click = (target: Node) => {
    let prevented = false;
    let stopped = false;
    const e = {
      target,
      button: 0,
      preventDefault: () => { prevented = true; },
      stopPropagation: () => { stopped = true; },
      get defaultPrevented() { return prevented; },
    };
    for (let n: Node | undefined = target; n && !stopped; n = n.parent) fire(n.hooks.get("click"), e);
    if (!stopped) fire(windowHooks.get("click"), e);
    const summary = target.closest("summary");
    if (summary?.parent && !prevented) summary.parent.open = !summary.parent.open;
  };
  const find = (root: Node, text: string): Node => {
    const walk = (n: Node): Node | undefined =>
      n.textContent === text ? n : n.kids.map(walk).find(Boolean);
    const hit = walk(root);
    if (!hit) throw new Error(`no ${text}`);
    return hit;
  };
  const mark = (d: Node) => d.kids[0].kids[1];
  return { body, date, author, section, year, assigned, click, find, mark, windowHooks };
}

test("choosing a date navigates to that month's archive", () => {
  const ui = runControls();
  ui.date.open = true;
  ui.click(ui.find(ui.date, "December 2024"));
  assert.deepEqual(ui.assigned, ["/blog/updates/months/2024-12"]);
  ui.click(ui.find(ui.date, "November"));
  ui.click(ui.find(ui.date, "All dates"));
  assert.deepEqual(ui.assigned, [
    "/blog/updates/months/2024-12",
    "/blog/updates/months/2023-11",
    "/blog/updates",
  ]);
  assert.equal(ui.date.dataset.value, "2023-09", "navigating leaves the value alone");
});

test("a navigating dropdown's mark toggles its menu instead of clearing", () => {
  const ui = runControls();
  for (const d of [ui.date, ui.section]) {
    const before = { value: d.dataset.value, label: d.kids[0].kids[0].textContent };
    ui.click(ui.mark(d));
    assert.equal(d.open, true, `${d.id} opens from its mark`);
    assert.deepEqual(
      { value: d.dataset.value, label: d.kids[0].kids[0].textContent },
      before,
      `${d.id} keeps its value`,
    );
    ui.click(ui.mark(d));
    assert.equal(d.open, false, `${d.id} closes from its mark`);
  }
  assert.deepEqual(ui.assigned, []);
  // A filter dropdown still clears in place from its mark.
  ui.click(ui.mark(ui.author));
  assert.equal(ui.author.dataset.value, "");
  assert.equal(ui.author.kids[0].kids[0].textContent, "All authors");
  assert.equal(ui.author.open, false);
});

test("expanding a year keeps the date dropdown open and selects nothing", () => {
  const ui = runControls();
  ui.date.open = true;
  ui.section.open = true;
  const summary = ui.year.kids[0];
  ui.click(summary);
  assert.equal(ui.year.open, false, "the year collapses");
  assert.equal(ui.date.open, true, "the dropdown stays open");
  assert.equal(ui.section.open, false, "other dropdowns still close");
  ui.click(summary.kids[1]);
  assert.equal(ui.year.open, true, "its caret expands it again");
  ui.click(summary.kids[0]);
  assert.equal(ui.year.open, false);
  assert.equal(ui.date.open, true);
  assert.deepEqual(ui.assigned, []);
  assert.equal(ui.date.dataset.value, "2023-09");
});

test("the date dropdown still closes on an outside click or Escape", () => {
  const ui = runControls();
  ui.date.open = true;
  ui.click(ui.body);
  assert.equal(ui.date.open, false, "outside click");
  ui.date.open = true;
  ui.windowHooks.get("keydown")?.forEach((fn) => fn({ key: "Escape" }));
  assert.equal(ui.date.open, false, "Escape");
});
