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

test("an old ?month= link on a section index lands on the month archive, slashless", () => {
  assert.equal(
    runListing("/blog/updates/", "?month=2024-12", { section: "Updates" }).replaced,
    "/blog/updates/months/2024-12",
  );
  assert.equal(
    runListing("/blog/updates/page/2", "?month=2024-04", { section: "Updates" })
      .replaced,
    "/blog/updates/months/2024-04",
  );
});

test("a malformed or out-of-place ?month= does not redirect", () => {
  for (const month of ["2024-13", "2024-1", "december", ""])
    assert.equal(
      runListing("/blog/updates/", `?month=${month}`, { section: "Updates" })
        .replaced,
      undefined,
    );
  // A listing already filtered to a tag, author or month stays put.
  const filtered: [string, Record<string, string>][] = [
    ["/blog/updates/tags/theory/", { section: "Updates", tag: "Theory" }],
    ["/blog/updates/authors/remilia-jackson/", { section: "Updates", author: "Remilia Jackson" }],
    ["/blog/months/2024-11/", { month: "November 2024" }],
  ];
  for (const [path, heading] of filtered)
    assert.equal(runListing(path, "?month=2024-12", heading).replaced, undefined);
});

test("an old ?month= link on the pooled index lands on the pooled month archive", () => {
  assert.equal(
    runListing("/blog/", "?month=2024-12", {}).replaced,
    "/blog/months/2024-12",
  );
  assert.equal(
    runListing("/blog", "?month=2022-06", {}).replaced,
    "/blog/months/2022-06",
  );
  assert.equal(
    runListing("/blog/page/3/", "?month=2023-11", {}).replaced,
    "/blog/months/2023-11",
  );
});

test("a month archive keeps its month in the status line", () => {
  const { replaced, text } = runListing("/blog/updates/months/2024-12", "", {
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
  const valued = /^\.sel-menu button\[data-href\]\[data-value="(.*)"\]$/.exec(sel);
  if (valued)
    return (
      n.tag === "button" &&
      "data-href" in n.attrs &&
      n.attrs["data-value"] === valued[1] &&
      inMenu()
    );
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
    case ".post-card":
      return n.cls.includes("post-card");
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
function runControls(search = "") {
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
  const author = dropdown("post-author", "", "All authors", [
    option("", "All authors", "/blog/updates/months/2023-09"),
    option("Charlotte Fang", "Charlotte Fang", "/blog/updates/authors/charlotte-fang"),
    option("minds0n", "minds0n", "/blog/authors/minds0n"),
  ]);
  const body = el("body", {}, [author, date]);
  const sels = [author, date];
  const byId: Record<string, Node> = { "post-date": date, "post-author": author };
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
  const replaced: string[] = [];
  const location = {
    pathname: "/blog/updates/months/2023-09/",
    search,
    href: `https://remilia.org/blog/updates/months/2023-09/${search}`,
    replace: (to: string) => replaced.push(to),
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
  return { body, date, author, year, assigned, replaced, click, find, mark, windowHooks };
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
  for (const d of [ui.date, ui.author]) {
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
});

test("choosing an author navigates to the archive the option names", () => {
  const ui = runControls();
  ui.author.open = true;
  ui.click(ui.find(ui.author, "Charlotte Fang"));
  // An author with no posts in this section opens the pooled archive.
  ui.click(ui.find(ui.author, "minds0n"));
  ui.click(ui.find(ui.author.kids[1], "All authors"));
  assert.deepEqual(ui.assigned, [
    "/blog/updates/authors/charlotte-fang",
    "/blog/authors/minds0n",
    "/blog/updates/months/2023-09",
  ]);
  assert.equal(ui.author.dataset.value, "", "navigating leaves the value alone");
});

test("an old ?author= link opens that author's archive", () => {
  assert.deepEqual(runControls("?author=minds0n").replaced, ["/blog/authors/minds0n"]);
  assert.deepEqual(
    runControls("?author=Charlotte%20Fang").replaced,
    ["/blog/updates/authors/charlotte-fang"],
  );
  // A name with no archive leaves the listing as it is.
  assert.deepEqual(runControls("?author=Nobody").replaced, []);
});

test("expanding a year keeps the date dropdown open and selects nothing", () => {
  const ui = runControls();
  ui.date.open = true;
  ui.author.open = true;
  const summary = ui.year.kids[0];
  ui.click(summary);
  assert.equal(ui.year.open, false, "the year collapses");
  assert.equal(ui.date.open, true, "the dropdown stays open");
  assert.equal(ui.author.open, false, "other dropdowns still close");
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

test("a dropdown opened while another closes survives the layout shift", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const ui = runControls();
    const hook = (d: typeof ui.date, type: string) =>
      d.hooks.get(type)?.forEach((fn) => fn({ pointerType: "mouse" }));
    ui.click(ui.author.kids[0]);
    assert.equal(ui.author.open, true);
    // Author closes, the filter box collapses, and Date slides out from
    // under the mouse: the browser fires a leave though nobody moved.
    ui.click(ui.date.kids[0]);
    assert.equal(ui.author.open, false, "one open at a time");
    assert.equal(ui.date.open, true);
    hook(ui.date, "pointerleave");
    mock.timers.tick(1000);
    assert.equal(ui.date.open, true, "the shift is not the reader leaving");
    // Once the mouse is back on it, leaving closes it as usual.
    hook(ui.date, "pointerenter");
    hook(ui.date, "pointerleave");
    mock.timers.tick(500);
    assert.equal(ui.date.open, false, "a real leave still closes it");
  } finally {
    mock.timers.reset();
  }
});

test("a dropdown opened over a mouse that stays on it still closes on leave", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const ui = runControls();
    const hook = (d: typeof ui.date, type: string) =>
      d.hooks.get(type)?.forEach((fn) => fn({ pointerType: "mouse" }));
    ui.click(ui.author.kids[0]);
    ui.click(ui.date.kids[0]);
    hook(ui.date, "pointermove");
    hook(ui.date, "pointerleave");
    mock.timers.tick(500);
    assert.equal(ui.date.open, false);
  } finally {
    mock.timers.reset();
  }
});

/**
 * Runs NAV_JS on an article page at `width`, with the masthead and site
 * head reduced to what the head-sizing script touches. `resize` changes
 * the width and fires the media query's change listeners.
 */
function runHeadSizing(width: number): {
  head: { style: { minHeight: string } };
  mast: { offsetHeight: number };
  resize: (to: number) => void;
  observe: () => void;
} {
  const mast = { offsetHeight: 116 };
  const head = { style: { minHeight: "" } };
  const changes: (() => void)[] = [];
  const observers: (() => void)[] = [];
  const document = {
    getElementById: () => null,
    querySelector: (sel: string) =>
      sel === ".sec.mast" ? mast : sel === ".left-rail .site-head" ? head : null,
    querySelectorAll: () => [],
    addEventListener: () => {},
    documentElement: { style: {} },
  };
  const matchMedia = (q: string) => {
    const min = /\(min-width: (\d+)px\)/.exec(q);
    return {
      get matches() {
        return min ? width >= Number(min[1]) : false;
      },
      addEventListener: (_: string, fn: () => void) => changes.push(fn),
    };
  };
  class ResizeObserver {
    constructor(private fn: () => void) {}
    observe() {
      observers.push(this.fn);
    }
  }
  new Function(
    "document",
    "location",
    "addEventListener",
    "matchMedia",
    "ResizeObserver",
    NAV_JS,
  )(document, { pathname: "/", search: "" }, () => {}, matchMedia, ResizeObserver);
  return {
    head,
    mast,
    resize: (to) => {
      width = to;
      changes.forEach((fn) => fn());
    },
    observe: () => observers.forEach((fn) => fn()),
  };
}

test("the site head takes the masthead's height wherever it sits beside it", () => {
  for (const width of [824, 900, 1099, 1100, 1280]) {
    const { head } = runHeadSizing(width);
    assert.equal(head.style.minHeight, "116px", `at ${width}px`);
  }
});

test("the site head keeps its own height once it stacks above the masthead", () => {
  for (const width of [320, 700, 823]) {
    const { head } = runHeadSizing(width);
    assert.equal(head.style.minHeight, "", `at ${width}px`);
  }
});

test("the site head follows the masthead across resizes and breakpoints", () => {
  const ui = runHeadSizing(900);
  ui.mast.offsetHeight = 84;
  ui.observe();
  assert.equal(ui.head.style.minHeight, "84px", "a shorter title");
  ui.resize(823);
  assert.equal(ui.head.style.minHeight, "", "narrowing below 824px");
  ui.resize(1000);
  assert.equal(ui.head.style.minHeight, "84px", "widening back past 824px");
});

test("a search that hides every card says so and offers to clear it", () => {
  const hooks = new Map<string, () => void>();
  const node = () => ({
    hooks: new Map<string, () => void>(),
    addEventListener(type: string, fn: () => void) {
      this.hooks.set(type, fn);
    },
  });
  const q = { ...node(), value: "", focus: () => {} };
  const text = { textContent: "No posts match." };
  const clear = node();
  const empty = {
    hidden: true,
    querySelector: (sel: string) => (sel === ".list-empty-text" ? text : sel === ".list-clear" ? clear : null),
  };
  const card = { dataset: { title: "Vaults", excerpt: "", cat: "Updates", author: "" }, hidden: false };
  const document = {
    getElementById: (id: string) => (id === "post-filter" ? q : null),
    querySelector: (sel: string) => (sel === ".list-empty" ? empty : null),
    querySelectorAll: (sel: string) => (sel === ".post-card" ? [card] : []),
    addEventListener: () => {},
    documentElement: { style: {} },
  };
  new Function("document", "location", "addEventListener", "matchMedia", NAV_JS)(
    document,
    { pathname: "/blog", search: "", href: "https://remilia.org/blog", replace: () => {} },
    (type: string, fn: () => void) => hooks.set(type, fn),
    () => ({ matches: true }),
  );
  assert.equal(empty.hidden, true, "hidden while cards show");
  q.value = "zzz";
  q.hooks.get("input")?.();
  assert.equal(card.hidden, true);
  assert.equal(empty.hidden, false);
  assert.equal(text.textContent, "No posts match “zzz”.");
  clear.hooks.get("click")?.();
  assert.equal(q.value, "");
  assert.equal(card.hidden, false);
  assert.equal(empty.hidden, true);
});

/**
 * Runs NAV_JS on a post whose target sits below a lazy image that has not
 * loaded: `grow()` loads it, pushing the target down, as the browser does
 * when the jump brings the image near the viewport.
 */
function runJump(reducedMotion: boolean): {
  click: () => void;
  frame: (ms: number) => void;
  grow: (by: number) => void;
  input: (type: string) => void;
  fire: (type: string) => void;
  drag: (to: number) => void;
  targetTop: () => number;
} {
  const MARGIN = 400;
  let scrollY = 0;
  let top = 5000;
  let now = 0;
  let frames: ((t: number) => void)[] = [];
  const hooks = new Map<string, ((e: object) => void)[]>();
  const loads: (() => void)[] = [];
  const target = { getBoundingClientRect: () => ({ top: top - scrollY }) };
  const img = {
    complete: false,
    compareDocumentPosition: () => 4,
    addEventListener: (_: string, fn: () => void) => loads.push(fn),
  };
  const link = {
    classList: { contains: () => false },
    getAttribute: () => "#fndef-3",
    blur: () => {},
    closest: (sel: string): object | null =>
      sel === 'a[href^="#"]' ? link : null,
  };
  const env = {
    document: {
      getElementById: (id: string) => (id === "fndef-3" ? target : null),
      querySelector: () => null,
      querySelectorAll: (sel: string) => (sel === "img" ? [img] : []),
      addEventListener: () => {},
      documentElement: { style: {} },
    },
    location: { pathname: "/blog/a", search: "", hash: "" },
    history: { pushState: () => {} },
    addEventListener: (type: string, fn: (e: object) => void) =>
      hooks.set(type, [...(hooks.get(type) ?? []), fn]),
    matchMedia: () => ({ matches: reducedMotion }),
    getComputedStyle: () => ({ scrollMarginTop: `${MARGIN}px` }),
    performance: { now: () => now },
    requestAnimationFrame: (fn: (t: number) => void) => frames.push(fn),
    scrollTo: (_: number, y: number) => {
      scrollY = y;
    },
    innerHeight: 800,
    get scrollY() {
      return scrollY;
    },
  };
  new Function("env", `with (env) { ${NAV_JS} }`)(env);
  return {
    click: () =>
      hooks.get("click")?.forEach((fn) =>
        fn({ target: link, preventDefault: () => {} }),
      ),
    frame: (ms) => {
      now += ms;
      const due = frames;
      frames = [];
      due.forEach((fn) => fn(now));
    },
    grow: (by) => {
      top += by;
      img.complete = true;
      loads.splice(0).forEach((fn) => fn());
    },
    input: (type) => hooks.get(type)?.splice(0).forEach((fn) => fn({})),
    fire: (type) => hooks.get(type)?.forEach((fn) => fn({})),
    drag: (to) => {
      scrollY = to;
      hooks.get("scroll")?.forEach((fn) => fn({}));
    },
    targetTop: () => top - scrollY,
  };
}

test("a footnote jump lands on its note when an image above loads mid-jump", () => {
  const page = runJump(false);
  page.click();
  page.frame(100);
  page.grow(500);
  page.frame(100);
  page.frame(16);
  assert.equal(page.targetTop(), 400, "the note sits at its scroll margin");
});

test("an image that loads after the landing lands the jump again", () => {
  const page = runJump(false);
  page.click();
  page.frame(200);
  page.frame(16);
  assert.equal(page.targetTop(), 400);
  page.grow(500);
  assert.equal(page.targetTop(), 400, "followed the note down");
});

test("the reader's own scroll ends the jump's follow-up", () => {
  for (const type of ["wheel", "touchmove", "keydown", "pointerdown"]) {
    const page = runJump(false);
    page.click();
    page.frame(200);
    page.frame(16);
    page.input(type);
    page.grow(500);
    assert.equal(page.targetTop(), 900, `${type} stops it`);
  }
});

test("Back, a new hash, or a scrollbar drag ends the jump's follow-up", () => {
  for (const type of ["popstate", "hashchange"]) {
    const page = runJump(false);
    page.click();
    page.frame(200);
    page.frame(16);
    page.fire(type);
    page.grow(500);
    assert.equal(page.targetTop(), 900, `${type} stops it`);
  }
  // The reader drags the scrollbar up, away from the note, mid-glide and
  // after landing: no later frame or image pulls the page back.
  for (const frames of [[100], [200, 16]]) {
    const page = runJump(false);
    page.click();
    frames.forEach((ms) => page.frame(ms));
    page.drag(1000);
    page.frame(100);
    page.grow(500);
    page.frame(16);
    assert.equal(page.targetTop(), 4500, "the page stays where the reader put it");
  }
});

test("the scroll events of the jump itself do not end it", () => {
  const page = runJump(false);
  page.click();
  page.frame(100);
  page.fire("scroll");
  page.frame(100);
  page.frame(16);
  page.fire("scroll");
  assert.equal(page.targetTop(), 400);
  page.grow(500);
  assert.equal(page.targetTop(), 400, "still follows a late image");
});

test("reduced motion jumps without a glide and still follows a late image", () => {
  const page = runJump(true);
  page.click();
  assert.equal(page.targetTop(), 400, "landed with no frames");
  page.grow(500);
  assert.equal(page.targetTop(), 400);
});

/**
 * Runs NAV_JS on page 1 of a listing with a search box and two cards. With
 * `index` set the heading names a baked search index, which `fetch` answers
 * with `rows` once `arrive` is called (or rejects when `rows` is null).
 */
function runSearch(rows: [string, string][] | null, index = "/blog/search.json") {
  const hooks = new Map<string, () => void>();
  const q = {
    value: "",
    addEventListener: (type: string, fn: () => void) => hooks.set(type, fn),
    focus: () => {},
  };
  const card = (title: string, author: string) => ({
    dataset: { title, excerpt: "", cat: "Updates", author },
    hidden: false,
  });
  const cards = [card("Café Day’s “Notes”", "Charlotte Fang"), card("Second post", "minds0n")];
  const emptyText = { textContent: "No posts match." };
  const shown: { html: string; gone: boolean }[] = [];
  const emptyEl = {
    hidden: true,
    querySelector: (sel: string) => (sel === ".list-empty-text" ? emptyText : null),
    after: (...els: { html: string; gone: boolean }[]) => shown.push(...els),
  };
  const pager = { hidden: false };
  const statusEl = { dataset: index ? { index } : {}, textContent: "" };
  const fetched: string[] = [];
  let arrive = () => {};
  const fetch = (url: string) => {
    fetched.push(url);
    return new Promise((resolve) => {
      arrive = () =>
        resolve(rows ? { ok: true, json: () => rows } : { ok: false, status: 404 });
    });
  };
  const document = {
    getElementById: (id: string) => (id === "post-filter" ? q : null),
    querySelector: (sel: string) =>
      sel === ".index-mast h1"
        ? statusEl
        : sel === ".list-empty"
          ? emptyEl
          : sel === ".pager"
            ? pager
            : null,
    querySelectorAll: (sel: string) => (sel === ".post-card" ? cards : []),
    addEventListener: () => {},
    documentElement: { style: {} },
    createElement: () => {
      const children: { html: string; gone: boolean; remove(): void }[] = [];
      return {
        content: { children },
        set innerHTML(html: string) {
          for (const part of html.split("<article").slice(1)) {
            const node = { html: `<article${part}`, gone: false, remove() { node.gone = true; } };
            children.push(node);
          }
        },
      };
    },
  };
  new Function("document", "location", "addEventListener", "matchMedia", "fetch", NAV_JS)(
    document,
    { pathname: "/blog", search: "", href: "https://remilia.org/blog" },
    () => {},
    () => ({ matches: true }),
    fetch,
  );
  const type = (value: string) => {
    q.value = value;
    hooks.get("input")?.();
  };
  const settle = async () => {
    arrive();
    await new Promise((resolve) => setImmediate(resolve));
  };
  const live = () => shown.filter((n) => !n.gone).map((n) => n.html);
  return { type, settle, live, cards, emptyEl, emptyText, pager, fetched };
}

const INDEX: [string, string][] = [
  ["Café Day’s “Notes” Charlotte Fang Updates", "<article>one</article>"],
  ["Second post minds0n Updates", "<article>two</article>"],
  ["A post from page three Charlotte Fang Thought", "<article>three</article>"],
  ["Señor Ångström’s naïve résumé Remilia Thought", "<article>four</article>"],
];

test("a search on a paginated listing finds posts on its other pages", async () => {
  const ui = runSearch(INDEX);
  assert.deepEqual(ui.fetched, [], "the index loads only once a search starts");
  ui.type("page three");
  await ui.settle();
  assert.deepEqual(ui.fetched, ["/blog/search.json"]);
  assert.deepEqual(ui.live(), ["<article>three</article>"]);
  assert.ok(ui.cards.every((c) => c.hidden), "this page's own cards give way to the hits");
  assert.equal(ui.pager.hidden, true);
  assert.equal(ui.emptyEl.hidden, true);

  // A second query reuses the index and replaces the hits, in listing order.
  ui.type("fang");
  assert.deepEqual(ui.fetched.length, 1);
  assert.deepEqual(ui.live(), ["<article>one</article>", "<article>three</article>"]);
  // This page's first card matches too, and the index already holds it:
  // shown beside the hits it would appear twice.
  assert.deepEqual(ui.cards.map((c) => c.hidden), [true, true]);

  // Clearing the box puts the page back as it was baked.
  ui.type("");
  assert.deepEqual(ui.live(), []);
  assert.ok(ui.cards.every((c) => !c.hidden));
  assert.equal(ui.pager.hidden, false);
});

test("search matches whole words in any order, whatever the case, accents or quotes", async () => {
  const ui = runSearch(INDEX);
  ui.type("x");
  await ui.settle();
  for (const query of ["cafe", "CAFÉ day's", 'notes"  day', "fang cafe", "“notes”"]) {
    ui.type(query);
    assert.deepEqual(ui.live(), ["<article>one</article>"], query);
  }
  // An accent inside a word does not split it: plain letters find it.
  for (const query of ["senor", "angstrom naive", "resume", "SEÑOR résumé"]) {
    ui.type(query);
    assert.deepEqual(ui.live(), ["<article>four</article>"], query);
  }
  // Every word must appear, and letters must be adjacent: no fuzzy hits.
  for (const query of ["cafe night", "cfe", "scnd"]) {
    ui.type(query);
    assert.deepEqual(ui.live(), [], query);
    assert.equal(ui.emptyEl.hidden, false, query);
  }
  assert.equal(ui.emptyText.textContent, "No posts match “scnd”.");
});

test("a search says nothing matches only once the whole listing was searched", async () => {
  const ui = runSearch(INDEX);
  ui.type("zebra");
  // The index is still on its way: this page's cards filter, with no verdict.
  assert.ok(ui.cards.every((c) => c.hidden));
  assert.equal(ui.emptyEl.hidden, true);
  await ui.settle();
  assert.equal(ui.emptyEl.hidden, false);
});

test("a search falls back to this page's cards when the index does not load", async () => {
  const ui = runSearch(null);
  ui.type("second");
  await ui.settle();
  assert.deepEqual(ui.cards.map((c) => c.hidden), [true, false]);
  assert.equal(ui.pager.hidden, false);
  ui.type("zebra");
  assert.equal(ui.emptyEl.hidden, false);
  assert.equal(ui.fetched.length, 1, "a failed index is not asked for again");
});

test("a one-page listing filters its own cards and fetches nothing", () => {
  const ui = runSearch(INDEX, "");
  ui.type("cafe fang");
  assert.deepEqual(ui.cards.map((c) => c.hidden), [false, true]);
  assert.deepEqual(ui.fetched, []);
  assert.equal(ui.pager.hidden, false);
  ui.type("cfe");
  assert.equal(ui.emptyEl.hidden, false);
});

test("Escape in an open menu returns focus to its dropdown", () => {
  const ui = runControls();
  let focused = 0;
  const summary = ui.author.kids[0] as Node & { focus?: () => void };
  summary.focus = () => { focused += 1; };
  ui.click(ui.author.kids[0]);
  assert.equal(ui.author.open, true);
  const inMenu = ui.find(ui.author, "minds0n");
  ui.windowHooks.get("keydown")?.forEach((fn) => fn({ key: "Escape", target: inMenu }));
  assert.equal(ui.author.open, false);
  assert.equal(focused, 1);
  // With the menu already closed, Escape moves focus nowhere.
  ui.windowHooks.get("keydown")?.forEach((fn) => fn({ key: "Escape", target: inMenu }));
  assert.equal(focused, 1);
});
