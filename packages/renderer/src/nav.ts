import {
  CHANNEL_HOST,
  CHANNEL_LABEL,
  HOST_AGGREGATE,
  HOST_SECTIONS,
  indexPath,
  type Channel,
} from "@remilia/seo";
import { esc } from "./html";

export interface NavPost {
  title: string;
  url: string;
  date: string;
  category: string;
  excerpt?: string;
  imageUrl?: string;
  author?: string;
  /** Overrides the section-derived links — pooled listings point home per post. */
  categoryHref?: string;
  authorHref?: string;
  /** The month archive the post's date links to. */
  monthHref?: string;
}

const MAGNIFYING_GLASS = `<svg class="nav-search-icon" width="12" height="12" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M10 6.5C10 8.433 8.433 10 6.5 10C4.567 10 3 8.433 3 6.5C3 4.567 4.567 3 6.5 3C8.433 3 10 4.567 10 6.5ZM9.30884 10.0159C8.53901 10.6318 7.56251 11 6.5 11C4.01472 11 2 8.98528 2 6.5C2 4.01472 4.01472 2 6.5 2C8.98528 2 11 4.01472 11 6.5C11 7.56251 10.6318 8.53901 10.0159 9.30884L12.8536 12.1464C13.0488 12.3417 13.0488 12.6583 12.8536 12.8536C12.6583 13.0488 12.3417 13.0488 12.1464 12.8536L9.30884 10.0159Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd"></path></svg>`;
export const NAV_SEARCH = `<form class="nav-search" role="search">
<span class="nav-field"><input type="text" id="post-filter" autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false" placeholder="Search" aria-label="Search">${MAGNIFYING_GLASS}</span>
</form>`;

/** A post date, linked to its month archive when there is one. */
export function datedHtml(
  iso: string,
  text: string,
  monthHref: string | undefined,
  cls: string,
): string {
  const time = `<time datetime="${esc(iso)}">${esc(text)}</time>`;
  return monthHref
    ? `<a class="${cls}" href="${esc(monthHref)}">${time}</a>`
    : time;
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const yy = String(d.getUTCFullYear()).slice(-2);
  return `${mm}.${dd}.${yy}`;
}

function filterSel(
  id: string,
  aria: string,
  empty: string,
  values: string[],
  attr: string,
): { css: string; html: string } {
  // <style> content is raw text — no HTML entity decoding — so values need
  // CSS escaping, not esc(). The `<` keeps the rule from closing the element.
  const cssStr = (s: string): string =>
    s
      .replace(/\\/g, "\\\\")
      .replace(/</g, "\\3C ")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\a ");
  const css = values
    .map(
      (v) =>
        `.nav-box:has(#${id}[data-value="${cssStr(v)}"]) .nav-all>li:not([${attr}="${cssStr(v)}"]){display:none}`,
    )
    .join("");
  const items = [
    `<li><button type="button" data-value="">${esc(empty)}</button></li>`,
    ...values.map(
      (v) =>
        `<li><button type="button" data-value="${esc(v)}">${esc(v)}</button></li>`,
    ),
  ].join("");
  const html = `<details class="sel nav-cat-sel" id="${esc(id)}" data-value="" aria-label="${esc(aria)}">
<summary><span class="sel-label">${esc(empty)}</span><span class="sel-mark"></span></summary>
<ul class="sel-menu">${items}</ul>
</details>`;
  return { css, html };
}

function catSel(posts: NavPost[]): { css: string; html: string } {
  const cats = [...new Set(posts.map((p) => p.category))].sort();
  if (cats.length < 2) return { css: "", html: "" };
  return filterSel(
    "post-cat",
    "Filter posts",
    "All posts",
    cats,
    "data-cat",
  );
}

/** One shared category control across every listing of the host. */
export interface SharedCats {
  /** Every sibling category in nav order. `href` navigates; omit to filter. */
  cats: { label: string; href?: string }[];
  /** This listing's own category — shown as the control's label. */
  current: string;
  /** Target for the "All posts" item; omit to filter in place. */
  allHref?: string;
}

/**
 * The host's full section set, each option opening that section's index. A
 * pooled listing (`aggregated`) has no current section of its own.
 */
export function hostCats(channel: Channel, aggregated = false): SharedCats {
  const host = CHANNEL_HOST[channel];
  return {
    cats: HOST_SECTIONS[host].map((c) => ({
      label: CHANNEL_LABEL[c],
      href: indexPath(c),
    })),
    current: aggregated ? "" : CHANNEL_LABEL[channel],
    allHref: indexPath(HOST_AGGREGATE[host]),
  };
}

/**
 * The host's sections as one row of links, "All" first when the host has a
 * pooled index, with the section being shown marked. It heads every
 * listing's and post's masthead.
 */
export function sectionNav(shared: SharedCats): string {
  const items = [
    ...(shared.allHref
      ? [{ label: "All", href: shared.allHref, on: !shared.current }]
      : []),
    ...shared.cats.flatMap((c) =>
      c.href ? [{ label: c.label, href: c.href, on: c.label === shared.current }] : [],
    ),
  ];
  if (items.length < 2) return "";
  return `<nav class="sec-nav" aria-label="Sections">${items
    .map(
      (i) =>
        `<a href="${esc(i.href)}"${i.on ? ' aria-current="true"' : ""}>${esc(i.label)}</a>`,
    )
    .join('<span class="nav-sep" aria-hidden="true">—</span>')}</nav>`;
}

/**
 * The site head's menu on phones, where it is the whole head beside the
 * wordmark: the section row and the head's own links folded behind one
 * control, which names the section being shown.
 */
export function headMenu(
  shared: SharedCats,
  links: { label: string; href: string }[],
): string {
  const sections = [
    ...(shared.allHref
      ? [{ label: "All posts", href: shared.allHref, on: !shared.current }]
      : []),
    ...shared.cats.flatMap((c) =>
      c.href ? [{ label: c.label, href: c.href, on: c.label === shared.current }] : [],
    ),
  ];
  const items = [
    ...sections.map(
      (i) =>
        `<li><a href="${esc(i.href)}"${i.on ? ' aria-current="true"' : ""}>${esc(i.label)}</a></li>`,
    ),
    ...links.map(
      (l, n) =>
        `<li${n === 0 ? ' class="head-menu-site"' : ""}><a href="${esc(l.href)}">${esc(l.label)}</a></li>`,
    ),
    `<li class="head-dials"><label class="head-theme" for="theme-pop">Theme</label></li>`,
  ].join("");
  return `<details class="sel head-menu">
<summary><span class="sel-label">${esc(shared.current || "All posts")}</span><span class="sel-mark"></span></summary>
<ul class="sel-menu">${items}</ul>
</details>`;
}

/**
 * A listing's search and its Author and Date dropdowns, in a box of their
 * own: FILTER, a rule, then the controls. It sits in the left rail under
 * the site head, or under the theme box where the rails fold into one;
 * on phones it is one row under the head.
 */
export function filterBox(tools: string): string {
  return `<section class="filter-box" aria-label="Filter posts">
<p class="filter-label" aria-hidden="true">Filter</p>
<hr class="nav-rule">
${NAV_SEARCH}${tools}
</section>`;
}

/** A month the listing has an archive page for. */
export interface DateMonth {
  /** `YYYY-MM`. */
  key: string;
  href: string;
}

function monthText(key: string, withYear: boolean): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", {
    month: "long",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}

/**
 * Month archive picker. The newest year's months are listed directly; each
 * older year is a native `<details>` inside the menu that expands in place.
 * `current` is the month archive being shown, "" on the undated listing.
 */
export function dateSel(
  months: DateMonth[],
  allHref: string,
  current = "",
): string {
  if (!months.length) return "";
  const sorted = [...months].sort((a, b) => b.key.localeCompare(a.key));
  const newest = sorted[0].key.slice(0, 4);
  const option = (value: string, href: string, text: string): string =>
    `<li><button type="button" data-value="${esc(value)}" data-href="${esc(href)}"${value === current ? ' aria-current="page"' : ""}>${esc(text)}</button></li>`;
  const years = new Map<string, DateMonth[]>();
  for (const m of sorted) {
    const year = m.key.slice(0, 4);
    years.set(year, [...(years.get(year) ?? []), m]);
  }
  const items = [
    option("", allHref, "All dates"),
    ...[...years].map(([year, ms]) =>
      year === newest
        ? ms.map((m) => option(m.key, m.href, monthText(m.key, true))).join("")
        : `<li class="sel-year"><details${current.startsWith(`${year}-`) ? " open" : ""}><summary><span class="sel-label">${esc(year)}</span><span class="sel-mark"></span></summary><ul class="sel-sub">${ms
            .map((m) => option(m.key, m.href, monthText(m.key, false)))
            .join("")}</ul></details></li>`,
    ),
  ].join("");
  const label = current ? monthText(current, true) : "All dates";
  return `<details class="sel date-sel" id="post-date" data-value="${esc(current)}" aria-label="Date">
<summary><span class="sel-label">${esc(label)}</span><span class="sel-mark"></span></summary>
<ul class="sel-menu">${items}</ul>
</details>`;
}

/** An author with an archive to open: the listing's own, or the pooled one. */
export interface AuthorOption {
  label: string;
  href: string;
}

/**
 * Author picker. Like the date control, each option opens an archive: the
 * author's archive in this listing's section when there is one, otherwise the
 * host's pooled archive, so a pick never lands on an empty page. `current` is
 * the author whose archive is shown, "" elsewhere.
 */
export function authorSel(
  authors: AuthorOption[],
  allHref: string,
  current = "",
): string {
  if (!authors.length) return "";
  const option = (value: string, href: string, text: string): string =>
    `<li><button type="button" data-value="${esc(value)}" data-href="${esc(href)}"${value === current ? ' aria-current="page"' : ""}>${esc(text)}</button></li>`;
  const items = [
    option("", allHref, "All authors"),
    ...authors.map((a) => option(a.label, a.href, a.label)),
  ].join("");
  return `<details class="sel nav-cat-sel" id="post-author" data-value="${esc(current)}" aria-label="Author">
<summary><span class="sel-label">${esc(current || "All authors")}</span><span class="sel-mark"></span></summary>
<ul class="sel-menu">${items}</ul>
</details>`;
}

export function leftRail(
  posts: NavPost[],
  _label: string,
  _indexHref = "/press",
  currentUrl?: string,
  shared?: SharedCats,
): string {
  const byDate = [...posts].sort((a, b) => b.date.localeCompare(a.date));
  const { css, html: cat } = shared
    ? { css: "", html: "" }
    : catSel(posts);
  const items = byDate
    .map(
      (p) =>
        `<li data-title="${esc(p.title)}" data-excerpt="${esc(p.excerpt ?? "")}" data-date="${esc(p.date)}" data-cat="${esc(p.category)}" data-author="${esc(p.author ?? "")}"><a href="${esc(p.url)}"${p.url === currentUrl ? ' aria-current="page"' : ""}>${esc(p.title)}</a><span class="nav-meta">${datedHtml(p.date, shortDate(p.date), p.monthHref, "nav-date")} — <span class="nav-cat">${esc(p.category)}</span></span></li>`,
    )
    .join("\n");
  return `<div class="post-nav rail">
<input type="checkbox" id="nav-toggle" class="disclosure">
<label for="nav-toggle" class="disclosure-label">Posts</label>
<div class="nav-box">
${css ? `<style>${css}</style>` : ""}
<div class="nav-page">
${NAV_SEARCH}
${cat}
</div>
<hr class="nav-rule">
<ul class="nav-all">
${items}
</ul>
<div class="nav-foot">
<p class="nav-pager">
<button type="button" class="nav-prev" aria-label="Previous page">&lt;&lt;</button>
<span class="nav-status">1 / 1</span>
<button type="button" class="nav-next" aria-label="Next page">&gt;&gt;</button>
</p>
</div>
</div>
</div>`;
}

export function emptyRail(): string {
  return `<div class="post-nav rail"></div>`;
}

/** Posts on one page of the rail's list. */
export const RAIL_PAGE = 4;

/**
 * The sidenote layout, as page script: `sidenotes(root, wide, opts)` returns
 * the function that places every note under `root` (the document, or the
 * page frame in the Studio's editor) when `wide()` says both rails show, and
 * clears its work when not. The Studio's page editor builds it from this
 * source (studio/sidenotes.ts); the blog's nav.js will run the same source.
 */
export const SIDENOTES_JS = `// With both rails, notes stand in the margin, in reference order, under
// the boxes at the head of the right rail. A note stands at its mark's
// line when that place is free; otherwise it goes under the note above.
// A note shows in full while the next note leaves it room; one the next
// note would block is cut to whole lines (never under three), so the
// notes after it stay near their marks. Pointing at a note or its mark,
// tabbing to the mark, or a click on the mark opens the note in full, and
// the notes below slide down. A line ties each note to its place, drawn
// like a flowchart: out from the column at the mark's line, down a lane
// in the gap, into the note's left side. A note inside a note stands
// under its parent, and its line runs on the right: out of the parent at
// its reference's line, down a lane, into the nested note's right side.
// Lines whose runs pass each other take separate lanes; when the gap is
// too narrow for the lanes, the notes give up some width. A stack that
// runs past the article's end makes the page longer.
//
// Places are measured from the top of root, so scrolling changes none of
// them, and a layout that comes out as it stands writes nothing: notes
// move only when the text, a note, or the frame changes, or a note opens
// or closes.
//
// sidenotes(root, wide, opts) returns the function that lays the notes
// out. root is the document, or the page frame in the Studio's editor.
// wide() says whether both rails show. A note whose mark carries the
// class fn-pin stays open (the editor's note being written). opts.links:
// a click on a mark opens its note here instead of following the link
// (the site; the editor's marks are not links). opts.signal: an
// AbortSignal that removes the listeners. The function takes true to
// glide to the new layout.
function sidenotes(root, wide, opts) {
  const layout = root.querySelector('.layout');
  const PITCH = 3;
  const LINES = 3;
  const OPEN_MS = 80;
  const CLOSE_MS = 250;
  const GLIDE_MS = 300;
  let placed = [];
  let hover = null;
  let pinned = null;
  let timer = 0;
  let glideUntil = 0;
  const VARS = ['--fn-drop', '--fn-lane', '--fn-reach'];
  const FLAGS = ['data-on', 'data-dim', 'data-long', 'data-anim'];
  // Writes only what differs, so a layout that has not changed leaves the
  // page alone.
  const put = (el, k, v) => {
    const s = el.style;
    const was = k.startsWith('--') ? s.getPropertyValue(k) : s[k];
    if (was === v || (v && Math.abs(parseFloat(was) - parseFloat(v)) < 0.01)) return;
    if (k.startsWith('--')) s.setProperty(k, v);
    else s[k] = v;
  };
  const flag = (el, name, yes) => {
    if (yes === (el.getAttribute(name) !== null)) return;
    if (yes) el.setAttribute(name, '');
    else el.removeAttribute(name);
  };
  const clear = () => {
    if (layout) put(layout, 'paddingBottom', '');
    for (const n of placed) {
      for (const k of ['top', 'left', 'width']) put(n, k, '');
      for (const v of VARS) n.style.removeProperty(v);
      for (const f of FLAGS) flag(n, f, false);
      const text = n.querySelector('.sn-text');
      if (text) put(text, 'height', '');
      const fn = n.closest('.fn');
      if (fn) flag(fn, 'data-on', false);
    }
    placed = [];
  };
  // Lanes for runs [from, to] in reference order: a run that starts
  // while earlier ones are still going takes the next lane out.
  const lanesFor = (runs) => {
    let count = 0;
    runs.forEach((run, i) => {
      const going = runs.slice(0, i).filter((o) => o.to > run.from);
      run.lane = going.length ? Math.max(...going.map((o) => o.lane)) + 1 : 0;
      count = Math.max(count, run.lane + 1);
    });
    return count;
  };
  const mainOf = (fn) => fn && fn.querySelector('.fn-note:not(.fn-sub)');
  const subOf = (fn, key) => (key && [...fn.querySelectorAll('.fn-note.fn-sub')].find((n) => n.getAttribute('data-ref') === key)) || null;
  // The note a nested note is cited from.
  const hostOf = (n) => {
    const fn = n.closest('.fn');
    const key = n.getAttribute('data-ref');
    return [...fn.querySelectorAll('.fn-note')].find((o) => o !== n && o.querySelector('.fn-xref[href="#' + key + '"]')) || null;
  };
  // The notes that stand out: under the pointer or the keyboard focus,
  // opened by a click, or marked open by the page around them.
  const targets = () => {
    const set = new Set();
    if (hover && hover.isConnected) set.add(hover);
    if (pinned && pinned.isConnected) set.add(pinned);
    for (const fn of root.querySelectorAll('.fn.fn-pin')) {
      const n = mainOf(fn);
      if (n) set.add(n);
    }
    return set;
  };
  // The notes shown in full: the targets, and the notes their lines come
  // from, so a nested note's reference shows.
  const opened = (on) => {
    const set = new Set();
    const add = (n) => {
      if (!n || set.has(n)) return;
      set.add(n);
      if (n.classList.contains('fn-sub')) add(hostOf(n));
    };
    on.forEach(add);
    return set;
  };
  const stack = (glide) => {
    const notes = [...root.querySelectorAll('.fn .fn-note')];
    if (!notes.length || !wide()) { clear(); return; }
    for (const n of placed) if (!notes.includes(n)) flag(n, 'data-on', false);
    placed = notes;
    const now = Date.now();
    if (glide === true) glideUntil = now + GLIDE_MS;
    const anim = now < glideUntil;
    const cs = getComputedStyle(root.documentElement || root);
    const num = (name) => parseFloat(cs.getPropertyValue(name)) || 0;
    const gap = num('--grid') || 4;
    const between = num('--rail-gap') || 12;
    const rail = num('--rail') || 240;
    const line = num('--size-ui') * (num('--leading') || 1) || 16;
    const tick = num('--space-xs') + line / 2;
    const on = targets();
    const open = opened(on);
    // Every place below is measured from the top of root, the page or the
    // frame, so where the window or the editor's pane is scrolled to does
    // not enter it.
    const frame = root.documentElement || root;
    const y0 = frame.getBoundingClientRect ? frame.getBoundingClientRect().top : -scrollY;
    const y = (r) => r - y0;
    // Notes start under the right rail's boxes: theme, read info, search.
    // The post list's own element may run the rail's whole height; its
    // boxes are what the notes must clear.
    const boxes = [...root.querySelectorAll('.right-rail > :not(.post-nav), .right-rail > .post-nav > *')];
    const top0 = boxes.reduce((v, el) => Math.max(v, y(el.getBoundingClientRect().bottom)), 0) + between;
    // One pass places every note at a given width and returns the runs.
    // It reads nothing a glide in progress changes: the marks, the text's
    // own height, and a reference's place inside its note.
    const place = (leftExtra, rightExtra) => {
      const rows = [];
      for (const n of notes) {
        const parent = n.offsetParent;
        const fn = n.closest('.fn');
        const sec = n.closest('.sec');
        const text = n.querySelector('.sn-text');
        if (!parent || !fn || !sec || !text) continue;
        put(n, 'width', rail - leftExtra - rightExtra + 'px');
        const p = parent.getBoundingClientRect();
        const box = getComputedStyle(n);
        const row = { n, text, fn, base: y(p.top), sub: n.classList.contains('fn-sub'),
          edge: sec.getBoundingClientRect().right - p.left, full: text.scrollHeight, open: open.has(n),
          chrome: ['paddingTop', 'paddingBottom', 'borderTopWidth', 'borderBottomWidth'].reduce((s, k) => s + (parseFloat(box[k]) || 0), 0) };
        if (row.sub) {
          // Its place is its reference, inside the note it is nested in.
          const key = n.getAttribute('data-ref');
          row.host = rows.filter((o) => o.fn === fn).find((o) => o.n.querySelector('.fn-xref[href="#' + key + '"]'));
          row.x = row.host && row.host.n.querySelector('.fn-xref[href="#' + key + '"]');
          if (!row.x) continue;
        } else {
          const ref = fn.querySelector('.fn-ref');
          if (!ref) continue;
          const r = ref.getBoundingClientRect();
          // The mark's line, wherever the note's own box is measured from.
          row.from = y(Math.max(r.top + r.height / 2, sec.getBoundingClientRect().top + tick));
          row.ideal = Math.max(row.from - tick, top0);
        }
        rows.push(row);
      }
      const short = (row) => (row.open ? row.full : Math.min(row.full, LINES * line));
      let floor = top0;
      rows.forEach((row, i) => {
        row.top = row.sub ? floor : Math.max(row.ideal, floor);
        row.cut = row.full;
        if (!row.open) {
          // The room down to where the next note in the text wants to
          // stand, less a short box for each nested note between.
          let k = i + 1;
          let need = 0;
          for (; k < rows.length && rows[k].sub; k++) need += short(rows[k]) + rows[k].chrome + gap;
          if (k < rows.length) {
            const room = rows[k].ideal - gap - row.top - row.chrome - need;
            if (row.full > room) row.cut = Math.max(short(row), Math.floor(room / line) * line);
          }
        }
        row.h = row.cut + row.chrome;
        floor = row.top + row.h + gap;
      });
      for (const row of rows) {
        if (row.sub) {
          const xr = row.x.getBoundingClientRect();
          const off = xr.top + xr.height / 2 - row.host.n.getBoundingClientRect().top;
          // A reference in the part cut off: the line leaves at the foot
          // of what shows.
          row.from = row.host.top + Math.min(off, row.host.h - tick / 2);
        }
        row.to = row.top + tick;
      }
      const left = rows.filter((o) => !o.sub && o.to - o.from > 1);
      const right = rows.filter((o) => o.sub);
      return { rows, left, right, L: lanesFor(left), R: lanesFor(right), floor };
    };
    let out = place(0, 0);
    const room = (lanes) => PITCH * (lanes + 1);
    const leftExtra = Math.min(36, Math.max(0, room(out.L) - between));
    const rightExtra = out.R ? Math.min(24, room(out.R)) : 0;
    if (leftExtra || rightExtra) out = place(leftExtra, rightExtra);
    const leftW = between + leftExtra;
    const leftPitch = Math.max(2, Math.min(PITCH, Math.floor(leftW / (out.L + 1))));
    const rightPitch = out.R ? Math.max(2, Math.min(PITCH, Math.floor(rightExtra / (out.R + 1)))) : PITCH;
    const lit = new Set();
    for (const row of out.rows) {
      const n = row.n;
      flag(n, 'data-anim', anim);
      put(n, 'top', row.top - row.base + 'px');
      put(n, 'left', row.edge - (parseFloat(getComputedStyle(n).marginLeft) || 0) + leftW + 'px');
      put(n, '--fn-reach', leftW + 'px');
      put(row.text, 'height', row.cut + 'px');
      flag(n, 'data-long', row.cut < row.full);
      flag(n, 'data-on', on.has(n));
      flag(n, 'data-dim', on.size > 0 && !on.has(n));
      if (on.has(n) && !row.sub) lit.add(row.fn);
      put(n, '--fn-drop', Math.max(0, row.to - row.from) + 'px');
      if (row.sub) {
        // Lane 0 is nearest the notes.
        put(n, '--fn-lane', Math.min(rightExtra - 1, rightPitch * ((row.lane % Math.max(1, Math.floor(rightExtra / rightPitch) - 1)) + 1)) + 'px');
      } else if (row.lane !== undefined) {
        // Lane 0 is nearest the notes. A later line turns nearer the
        // column, so its way out never meets an earlier line's way down.
        const fit = Math.max(1, Math.floor(leftW / leftPitch) - 1);
        put(n, '--fn-lane', Math.max(1, leftW - leftPitch * ((row.lane % fit) + 1)) + 'px');
      }
    }
    for (const fn of new Set(out.rows.map((o) => o.fn))) flag(fn, 'data-on', lit.has(fn));
    // A stack that ends below the page's content makes the page longer.
    if (layout) {
      const end = y(layout.getBoundingClientRect().bottom) - (parseFloat(layout.style.paddingBottom) || 0);
      put(layout, 'paddingBottom', out.floor > end ? Math.ceil(out.floor - end) + 'px' : '');
    }
  };
  // The note an element stands for: a note itself, a reference to a
  // nested note, or the mark (its own note).
  const noteAt = (t) => {
    const fn = t && t.closest && t.closest('.fn');
    if (!fn || !root.contains(fn) || !wide()) return null;
    const x = t.closest('.fn-xref');
    const sub = x && subOf(fn, (x.getAttribute('href') || '').slice(1));
    return sub || t.closest('.fn-note') || mainOf(fn);
  };
  const listen = (type, fn) => root.addEventListener(type, fn, opts && opts.signal ? { signal: opts.signal } : undefined);
  if (opts && opts.signal) opts.signal.addEventListener('abort', () => clearTimeout(timer));
  const point = (n, ms) => {
    clearTimeout(timer);
    if (n === hover) return;
    timer = setTimeout(() => { hover = n; stack(true); }, ms);
  };
  listen('pointerover', (e) => {
    if (e.pointerType === 'touch') return;
    const n = noteAt(e.target);
    if (n) point(n, OPEN_MS);
    else if (hover) point(null, CLOSE_MS);
  });
  listen('pointerout', (e) => {
    if (!e.relatedTarget && hover) point(null, CLOSE_MS);
  });
  listen('focusin', (e) => {
    const t = e.target;
    const n = t && t.matches && t.matches(':focus-visible') ? noteAt(t) : null;
    if (n) point(n, 0);
  });
  listen('focusout', (e) => {
    if (hover && !noteAt(e.relatedTarget)) point(null, CLOSE_MS);
  });
  const pin = (n) => {
    if (n === pinned) return;
    pinned = n;
    stack(true);
    // Into view once it has opened, and only if it is off screen.
    if (n) setTimeout(() => { if (pinned === n && n.scrollIntoView) n.scrollIntoView({ block: 'nearest' }); }, GLIDE_MS);
  };
  // A click on a mark opens its note, and a second click closes it; a
  // click on a note keeps it open; a click anywhere else, or Escape,
  // closes it.
  listen('click', (e) => {
    if (e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || !wide()) return;
    const t = e.target;
    const fn = t && t.closest && t.closest('.fn');
    if (!fn) { pin(null); return; }
    const ref = t.closest('.fn-ref');
    const x = t.closest('.fn-xref');
    if (ref) {
      const n = mainOf(fn);
      if (!n) return;
      if (opts && opts.links) e.preventDefault();
      pin(pinned === n ? null : n);
    } else if (x && opts && opts.links) {
      // A reference inside a note goes to that note's box in the margin:
      // the nested note under this one, or the note of another mark.
      const key = (x.getAttribute('href') || '').slice(1);
      const other = root.querySelector('.fn[id="' + key + '"]');
      const n = subOf(fn, key) || mainOf(other);
      if (!n) return;
      e.preventDefault();
      pin(n);
    } else if (!t.closest('a')) {
      const n = t.closest('.fn-note');
      if (n) pin(n);
    }
  });
  listen('keydown', (e) => {
    if (e.key === 'Escape' && pinned) pin(null);
  });
  return stack;
}
`;

export const NAV_JS = `(() => {
  const q = document.getElementById('post-filter');
  const list = document.querySelector('.post-nav .nav-all');
  const form = document.querySelector('.nav-search');
  const cat = document.getElementById('post-cat');
  const auth = document.getElementById('post-author');
  const prev = document.querySelector('.nav-prev');
  const next = document.querySelector('.nav-next');
  const status = document.querySelector('.nav-status');
  const statusEl = document.querySelector('.index-mast h1');
  const emptyEl = document.querySelector('.list-empty');
  const cards = [...document.querySelectorAll('.post-card')];
  if (!q && !cards.length) return;
  const PAGE = ${RAIL_PAGE};
  let page = 0;
  const items = list ? [...list.querySelectorAll('li[data-title]')] : [];
  const params = new URLSearchParams(location.search);
  const setSel = (el, v, empty) => {
    if (!el) return;
    el.dataset.value = v || '';
    const lab = el.querySelector('.sel-label');
    const btn = v ? el.querySelector('.sel-menu [data-value="'+CSS.escape(v)+'"]') : null;
    if (lab) lab.textContent = btn && v ? btn.textContent : empty;
  };
  const bindSel = (el, empty) => {
    if (!el) return;
    // Options that navigate leave no in-place value to clear: the mark just
    // toggles the menu, and a year row's mark toggles its year.
    const navigates = !!el.querySelector('.sel-menu button[data-href]');
    el.addEventListener('click', (e) => {
      const mark = e.target.closest('.sel-mark');
      if (mark && el.dataset.value && !navigates) {
        e.preventDefault();
        e.stopPropagation();
        setSel(el, '', empty);
        el.open = false;
        page = 0; apply();
        return;
      }
      const btn = e.target.closest('.sel-menu button');
      if (!btn) return;
      e.preventDefault();
      const href = btn.getAttribute('data-href');
      if (href) { location.assign(href); return; }
      setSel(el, btn.getAttribute('data-value') || '', empty);
      el.open = false;
      page = 0; apply();
    });
  };
  // Search is a plain substring match: every word of the query must appear
  // somewhere in the post's title, excerpt, author or category, whatever its
  // case, accents or quote style.
  const norm = (s) => (s || '').toLowerCase().normalize('NFKD')
    .replace(/[\\u0300-\\u036f]/g, '')
    .replace(/[\\u2018\\u2019]/g, "'").replace(/[\\u201C\\u201D]/g, '"')
    .replace(/\\s+/g, ' ').trim();
  const has = (query, text) => norm(query).split(' ').every((w) => text.includes(w));
  const match = (el) => {
    const query = q ? q.value.trim() : '';
    const catv = cat ? (cat.dataset.value || '') : '';
    const d = el.dataset;
    return has(query, norm([d.title, d.excerpt, d.author, d.cat].join(' ')))
      && (!catv || d.cat === catv);
  };
  // A paginated listing bakes an index of all its posts, so a search covers
  // every page of it, not only the cards on this one. It loads on the first
  // query; until it arrives, and if it never does, the cards here filter.
  const indexUrl = (statusEl && statusEl.dataset.index) || '';
  const pager = document.querySelector('.pager');
  const found = [];
  let index = null, asked = false, failed = false;
  const load = () => {
    if (asked) return;
    asked = true;
    fetch(indexUrl)
      .then((r) => r.ok ? r.json() : Promise.reject(r.status))
      .then((rows) => { index = rows.map((r) => [norm(r[0]), r[1]]); apply(); })
      .catch(() => { failed = true; apply(); });
  };
  const apply = () => {
    const query = q ? q.value.trim() : '';
    if (items.length && list) {
      const vis = items.filter(match);
      const pages = Math.max(1, Math.ceil(vis.length / PAGE));
      if (page >= pages) page = pages - 1;
      const from = page * PAGE;
      const onPage = new Set(vis.slice(from, from + PAGE));
      items.forEach((el) => {
        const show = vis.includes(el);
        el.hidden = !show;
        el.classList.toggle('off-page', show && !onPage.has(el));
      });
      if (status) status.textContent = (page + 1) + ' / ' + pages;
      if (prev) prev.disabled = page <= 0;
      if (next) next.disabled = page >= pages - 1;
    }
    // The index holds no categories, so a category dropdown's choice keeps
    // the search to the cards here.
    const wide = !!query && !!indexUrl && !failed && !(cat && cat.dataset.value);
    if (wide && !index) load();
    const hits = wide && index ? index.filter((r) => has(query, r[0])) : null;
    found.splice(0).forEach((el) => el.remove());
    if (hits && hits.length && emptyEl) {
      const t = document.createElement('template');
      t.innerHTML = hits.map((r) => r[1]).join('');
      found.push(...t.content.children);
      emptyEl.after(...found);
    }
    cards.forEach((c) => { c.hidden = hits ? true : !match(c); });
    // A search leaves this page's place in the listing, so its pager goes.
    if (pager) pager.hidden = wide;
    // The listing has no status line; a search that finds nothing says so,
    // with a way back. While the index is still loading it stays quiet.
    if (emptyEl) {
      const none = hits ? !hits.length
        : !wide && cards.length > 0 && cards.every((c) => c.hidden);
      emptyEl.hidden = !none;
      const text = emptyEl.querySelector('.list-empty-text');
      if (none && text) text.textContent = query ? 'No posts match “' + query + '”.' : 'No posts match.';
    }
    if (statusEl && cards.length) {
      const catv = cat ? (cat.dataset.value || '') : '';
      const author = statusEl.dataset.author || '';
      const section = statusEl.dataset.section || '';
      let t = catv ? 'Showing all ' + catv + ' posts' : section ? 'Showing all ' + section + ' posts' : 'Showing all posts';
      if (tagv) t += ' tagged ' + tagv;
      if (author) t += ' by ' + author;
      if (monthv) t += ' from ' + monthv;
      if (query) t += ' matching \u201C' + query + '\u201D';
      statusEl.textContent = t;
    }
  };
  if (form) form.addEventListener('submit', (e) => e.preventDefault());
  const clearBtn = emptyEl && emptyEl.querySelector('.list-clear');
  if (clearBtn && q) clearBtn.addEventListener('click', () => { q.value = ''; page = 0; apply(); q.focus(); });
  if (q) q.addEventListener('input', () => { page = 0; apply(); });
  bindSel(cat, 'All posts');
  bindSel(auth, 'All authors');
  bindSel(document.getElementById('post-date'), 'All dates');
  if (prev) prev.addEventListener('click', () => { page--; apply(); });
  if (next) next.addEventListener('click', () => { page++; apply(); });
  const tagv = (statusEl && statusEl.dataset.tag) || '';
  const monthv = (statusEl && statusEl.dataset.month) || '';
  // Months are archive pages now; the old ?month= filter links on a
  // section or pooled index land on that listing's month archive instead.
  const monthParam = params.get('month') || '';
  if (/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(monthParam) && statusEl && !tagv && !monthv && !statusEl.dataset.author) {
    location.replace(location.pathname.replace(/[/]+$/, '').replace(/[/]page[/][0-9]+$/, '') + '/months/' + monthParam);
    return;
  }
  const catParam = params.get('cat');
  if (catParam && cat) {
    const b = cat.querySelector('.sel-menu button[data-href][data-value="' + CSS.escape(catParam) + '"]');
    if (b && (b.getAttribute('data-href') || '').replace(/[/]+$/, '') !== location.pathname.replace(/[/]+$/, '')) {
      location.replace(b.getAttribute('data-href'));
      return;
    }
    setSel(cat, catParam, 'All posts');
  }
  // Authors are archive pages too; an old ?author= link opens the archive
  // the dropdown offers for that name.
  const authorParam = params.get('author');
  if (authorParam && auth && statusEl && !statusEl.dataset.author) {
    const b = auth.querySelector('.sel-menu button[data-href][data-value="' + CSS.escape(authorParam) + '"]');
    if (b) {
      location.replace(b.getAttribute('data-href'));
      return;
    }
  }
  apply();
})();
// <details> has no "only one open" behaviour and no outside dismissal, so a
// click anywhere closes every .sel but the one clicked, and Escape closes all.
// A mouse that leaves an open .sel closes it after a beat unless it comes
// back; touch never leaves, and a keyboard-focused dropdown stays open.
// Clicking one dropdown while another is open closes the other, and in the
// filter box that moves the one just opened out from under a still mouse.
// The browser reports that as the mouse leaving, but the reader has not
// left: such a dropdown ignores leaves until the mouse moves over it again.
(() => {
  const moved = new WeakSet();
  const shut = (keep) => {
    let closed = false;
    document.querySelectorAll('details.sel[open]').forEach((d) => {
      if (d !== keep) { d.open = false; closed = true; }
    });
    if (keep && closed) moved.add(keep);
  };
  addEventListener('click', (e) => {
    const t = e.target;
    shut(t && t.closest ? t.closest('details.sel') : null);
  });
  addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    // Focus inside a menu that Escape closes goes back to its dropdown,
    // not to the top of the page.
    const t = e.target;
    const d = t && t.closest ? t.closest('details.sel') : null;
    const back = d && d.open ? d.querySelector('summary') : null;
    shut(null);
    if (back && back.focus) back.focus();
  });
  const LEAVE_MS = 500;
  document.querySelectorAll('details.sel').forEach((d) => {
    let timer = 0;
    const cancel = () => { clearTimeout(timer); timer = 0; };
    d.addEventListener('pointerleave', (e) => {
      if (e.pointerType !== 'mouse' || !d.open || moved.has(d)) return;
      cancel();
      timer = setTimeout(() => {
        timer = 0;
        if (!d.querySelector(':focus-visible')) d.open = false;
      }, LEAVE_MS);
    });
    d.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'mouse') { moved.delete(d); cancel(); }
    });
    d.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') moved.delete(d);
    });
    d.addEventListener('toggle', () => { if (!d.open) { moved.delete(d); cancel(); } });
  });
})();
(() => {
  try {
    const toc = document.querySelector('.toc nav ol');
    if (!toc) return;
    const hs = document.querySelectorAll('.prose :is(h2,h3)[id]');
    const n = hs.length;
    if (!n) return;
    const liFor = new Map();
    toc.querySelectorAll('a[href^="#"]').forEach((a) => {
      const id = a.getAttribute('href').slice(1);
      const li = a.closest('li');
      if (id && li) liFor.set(id, li);
    });
    let curH = null, curLi = null, passed = [];
    const spyY = () => parseFloat(getComputedStyle(hs[0]).scrollMarginTop) || 0;
    const pick = () => {
      const y = spyY();
      let h = hs[0];
      for (let i = 0; i < n; i++) {
        if (hs[i].getBoundingClientRect().top <= y) h = hs[i];
        else break;
      }
      if (h === curH) return;
      if (curLi) curLi.classList.remove('toc-current');
      for (let i = 0; i < passed.length; i++) passed[i].classList.remove('toc-passed');
      passed = [];
      curH = h;
      curLi = liFor.get(h.id) || null;
      if (curLi) curLi.classList.add('toc-current');
      for (let i = 0; i < n; i++) {
        if (hs[i] === h) break;
        const li = liFor.get(hs[i].id);
        if (li) { li.classList.add('toc-passed'); passed.push(li); }
      }
    };
    pick();
    if (typeof IntersectionObserver === 'function') {
      const io = new IntersectionObserver(pick, { rootMargin: '-24% 0px -60% 0px', threshold: 0 });
      for (let i = 0; i < n; i++) io.observe(hs[i]);
    } else {
      let raf = 0;
      const on = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; pick(); }); };
      addEventListener('scroll', on, { passive: true });
    }
    addEventListener('resize', pick, { passive: true });
    addEventListener('click', (e) => {
      const a = e.target.closest('.toc nav a[href^="#"]');
      const t = document.getElementById('toc-toggle');
      if (a && t) t.checked = false;
    });
  } catch (e) {}
})();
(() => {
  try {
    // Reduced motion only drops the glide: notes still fit the column and
    // in-page links still land and release focus.
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.documentElement.style.scrollBehavior = 'auto';
    const yFor = (el) => {
      const raw = getComputedStyle(el).scrollMarginTop;
      const m = raw.endsWith('%') ? innerHeight * parseFloat(raw) / 100 : parseFloat(raw) || 0;
      return Math.max(0, el.getBoundingClientRect().top + scrollY - m);
    };
    // A jump follows its target. Lazy images above it take their height
    // only as they load, so the landing spot moves once the jump starts:
    // each frame of the glide aims again, and an image above the target
    // that loads after landing lands the jump once more. The reader's own
    // scroll, touch or key ends that, so a jump never fights them.
    // So does anything else that moves the page: Back or Forward, a new
    // hash, or a scroll the jump did not make, such as a scrollbar drag.
    let jump = 0;
    let at = 0;
    const move = (y) => { scrollTo(0, y); at = scrollY; };
    ['popstate', 'hashchange'].forEach((type) => {
      addEventListener(type, () => { jump++; });
    });
    addEventListener('scroll', () => {
      if (Math.abs(scrollY - at) > 1) jump++;
    }, { passive: true });
    const go = (el) => {
      const id = ++jump;
      const from = scrollY;
      at = from;
      if (Math.abs(yFor(el) - from) < 1) return;
      const live = () => id === jump;
      const land = () => { if (live()) move(yFor(el)); };
      const quit = () => { if (live()) jump++; };
      ['wheel', 'touchmove', 'keydown', 'pointerdown'].forEach((type) => {
        addEventListener(type, quit, { once: true, passive: true });
      });
      document.querySelectorAll('img').forEach((img) => {
        if (img.complete) return;
        if (!(img.compareDocumentPosition(el) & 4)) return;
        img.addEventListener('load', land, { once: true });
      });
      if (still) { land(); return; }
      const t0 = performance.now();
      const step = (now) => {
        if (!live()) return;
        const t = Math.min(1, (now - t0) / 200);
        const e = t * t * (3 - 2 * t);
        move(from + (yFor(el) - from) * e);
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    const fitNote = (fn) => {
      const note = fn && fn.querySelector('.fn-note');
      if (!note) return;
      note.style.left = '';
      const col = fn.closest('.prose, .article-rest, .article-body');
      if (!col) return;
      const cr = col.getBoundingClientRect();
      const fr = fn.getBoundingClientRect();
      const x = Math.max(cr.left, Math.min(fr.left, cr.right - note.offsetWidth - 2));
      note.style.left = x - fr.left + 'px';
    };
    document.addEventListener('pointerover', (e) => {
      const fn = e.target && e.target.closest && e.target.closest('.fn');
      if (fn) requestAnimationFrame(() => fitNote(fn));
    });
    document.addEventListener('focusin', (e) => {
      const fn = e.target && e.target.closest && e.target.closest('.fn');
      if (fn) requestAnimationFrame(() => fitNote(fn));
    });
    addEventListener('click', (e) => {
      if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest('a[href^="#"]');
      if (!a) return;
      if (a.classList.contains('fn') || a.classList.contains('fn-note')) return;
      const href = a.getAttribute('href');
      if (!href || href === '#') return;
      let id;
      try { id = decodeURIComponent(href.slice(1)); } catch (err) { return; }
      const el = document.getElementById(id);
      if (!el) return;
      e.preventDefault();
      a.blur();
      if (location.hash !== href) history.pushState(null, '', href);
      go(el);
    });
  } catch (e) {}
})();
(() => {
  addEventListener('click', (e) => {
    if (e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest('a.interlink');
    const open = document.querySelector('.interlink.card-open');
    if (a && a.querySelector('.link-card') && !matchMedia('(hover:hover) and (pointer:fine)').matches) {
      if (!a.classList.contains('card-open')) {
        e.preventDefault();
        open?.classList.remove('card-open');
        a.classList.add('card-open');
        return;
      }
    }
    open?.classList.remove('card-open');
  });
})();
(() => {
  const flash = (el) => {
    if (!el || el.dataset.copied) return;
    const orig = el.textContent;
    el.dataset.copied = '1';
    el.textContent = 'Copied';
    setTimeout(() => { el.textContent = orig; delete el.dataset.copied; }, 1500);
  };
  addEventListener('click', (e) => {
    if (e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest('.copy-url');
    if (!a || !navigator.clipboard || !navigator.clipboard.writeText) return;
    const u = a.getAttribute('data-url');
    if (!u) return;
    e.preventDefault();
    navigator.clipboard.writeText(u).then(() => flash(a));
  });
  addEventListener('click', (e) => {
    const b = e.target.closest('.copy-md, .copy-txt');
    if (!b || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const src = b.getAttribute('data-src');
    if (!src || !navigator.clipboard || !navigator.clipboard.writeText) return;
    e.preventDefault();
    fetch(src).then((r) => { if (!r.ok) throw r; return r.text(); }).then((t) => navigator.clipboard.writeText(t).then(() => flash(b)));
  });
})();
// The site-head sits beside the masthead from 824px, in a sticky rail
// that can't subgrid like .right-rail without breaking its internal
// scroll, so it stretches to the masthead's height here.
(() => {
  try {
    const mast = document.querySelector('.sec.mast');
    const head = document.querySelector('.left-rail .site-head');
    if (!mast || !head || typeof ResizeObserver !== 'function') return;
    const mq = matchMedia('(min-width: 824px)');
    const sync = () => {
      head.style.minHeight = mq.matches ? mast.offsetHeight + 'px' : '';
    };
    new ResizeObserver(sync).observe(mast);
    if (mq.addEventListener) mq.addEventListener('change', sync);
    sync();
  } catch (e) {}
})();
`;
