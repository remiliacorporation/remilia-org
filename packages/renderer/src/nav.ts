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
  const PAGE = 4;
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
    const wide = matchMedia('(min-width: 1100px)');
    const fitNote = (fn) => {
      const note = fn && fn.querySelector('.fn-note');
      // From 1100px a note stands in the margin, placed by the stacking pass.
      if (!note || wide.matches) return;
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
// scroll, so it stretches here until it and the swatch row under it,
// which close one box, are as tall as the masthead.
(() => {
  try {
    const mast = document.querySelector('.sec.mast');
    const head = document.querySelector('.left-rail .site-head');
    if (!mast || !head || typeof ResizeObserver !== 'function') return;
    const theme = document.querySelector('.left-rail > .theme-sel');
    const mq = matchMedia('(min-width: 824px)');
    const sync = () => {
      const row = theme ? theme.offsetHeight : 0;
      head.style.minHeight = mq.matches ? Math.max(0, mast.offsetHeight - row) + 'px' : '';
    };
    new ResizeObserver(sync).observe(mast);
    if (mq.addEventListener) mq.addEventListener('change', sync);
    sync();
  } catch (e) {}
})();
// With both rails, notes stand in the margin: each anchors to its mark's
// line, in the right rail's column. A note that would overlap the one
// above, or the box at the head of the rail, drops below it, and
// --fn-drop draws the elbow back up to the mark's line. A long note rests
// cut at a whole line (--sn-cut). Pointing at a mark, or tabbing to it,
// opens its note in full at the mark's line, kept inside the window;
// pointing at a note opens it where it stands.
(() => {
  try {
    const notes = [...document.querySelectorAll('.fn .fn-note')];
    if (!notes.length) return;
    const mq = matchMedia('(min-width: 1100px)');
    const rest = new Map();
    let openFn = null;
    let timer = 0;
    const settle = (n) => {
      n.style.maxHeight = '';
      n.style.overflowY = '';
      n.style.removeProperty('--sn-up');
    };
    const clear = () => {
      clearTimeout(timer);
      if (openFn) openFn.classList.remove('sn-open');
      openFn = null;
      rest.clear();
      for (const n of notes) {
        n.style.top = '';
        n.style.left = '';
        n.style.removeProperty('--fn-drop');
        n.removeAttribute('data-drop');
        n.removeAttribute('data-long');
        settle(n);
        const text = n.querySelector('.sn-text');
        if (text) text.style.removeProperty('--sn-cut');
      }
    };
    const rise = (n, natural, drop) => {
      n.style.top = natural + drop + 'px';
      if (drop > 1) {
        n.style.setProperty('--fn-drop', drop + 'px');
        n.setAttribute('data-drop', '');
      } else {
        n.style.removeProperty('--fn-drop');
        n.removeAttribute('data-drop');
      }
    };
    const stack = () => {
      clear();
      if (!mq.matches) return;
      const cs = getComputedStyle(document.documentElement);
      const num = (name) => parseFloat(cs.getPropertyValue(name)) || 0;
      const gap = num('--grid') || 4;
      const tick = num('--space-xs') + (num('--size-ui') * (num('--leading') || 1)) / 2;
      const box = document.querySelector('.right-rail .cite-box');
      let floor = box ? box.getBoundingClientRect().bottom + scrollY + gap : 0;
      const placed = [];
      for (const n of notes) {
        const text = n.querySelector('.sn-text');
        if (!text || text.scrollHeight <= text.clientHeight + 1) continue;
        n.setAttribute('data-long', '');
        // The cap is a height; end it on the last whole line inside it.
        const range = document.createRange();
        range.selectNodeContents(text);
        const top = text.getBoundingClientRect().top;
        const limit = text.clientHeight + 1;
        let cut = 0;
        for (const rc of range.getClientRects()) {
          const bottom = rc.bottom - top;
          if (rc.height > 0 && bottom <= limit && bottom > cut) cut = bottom;
        }
        if (cut > 0) text.style.setProperty('--sn-cut', Math.ceil(cut) + 'px');
      }
      for (const n of notes) {
        const parent = n.offsetParent;
        const fn = n.closest('.fn');
        const ref = fn ? fn.querySelector('.fn-ref') : null;
        const sec = n.closest('.sec');
        if (!parent || !ref || !sec) continue;
        const p = parent.getBoundingClientRect();
        const r = ref.getBoundingClientRect();
        const natural = Math.max(0, r.top - p.top + r.height / 2 - tick);
        const naturalAbs = p.top + scrollY + natural;
        const top = Math.max(naturalAbs, floor);
        placed.push([n, natural, top - naturalAbs, sec.getBoundingClientRect().right - p.left]);
        floor = top + n.offsetHeight + gap;
      }
      for (const [n, natural, drop, edge] of placed) {
        n.style.left = edge - (parseFloat(getComputedStyle(n).marginLeft) || 0) + num('--rail-gap') + 'px';
        rest.set(n, [natural, drop]);
        rise(n, natural, drop);
      }
    };
    const close = (fn) => {
      fn.classList.remove('sn-open');
      const n = fn.querySelector('.fn-note');
      const at = n && rest.get(n);
      if (!at) return;
      settle(n);
      rise(n, at[0], at[1]);
    };
    const open = (fn, inPlace) => {
      clearTimeout(timer);
      if (openFn === fn) return;
      if (openFn) close(openFn);
      openFn = fn;
      const n = fn.querySelector('.fn-note');
      const at = n && rest.get(n);
      if (!at) return;
      fn.classList.add('sn-open');
      const edge = 8;
      const room = innerHeight - edge;
      if (!inPlace) {
        rise(n, at[0], 0);
        const r = n.getBoundingClientRect();
        const up = Math.min(Math.max(0, r.bottom - room), Math.max(0, r.top - edge));
        if (up > 0) {
          n.style.top = at[0] - up + 'px';
          n.style.setProperty('--sn-up', up + 'px');
        }
      }
      const r = n.getBoundingClientRect();
      if (r.bottom > room) {
        n.style.maxHeight = Math.max(120, room - r.top) + 'px';
        n.style.overflowY = 'auto';
      }
    };
    const leave = (fn) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (openFn !== fn || fn.matches(':hover') || fn.matches(':focus-within')) return;
        close(fn);
        openFn = null;
      }, 250);
    };
    const fnOf = (e) => (mq.matches && e.target && e.target.closest ? e.target.closest('.fn') : null);
    document.addEventListener('pointerover', (e) => {
      const fn = fnOf(e);
      if (fn) open(fn, !!e.target.closest('.fn-note'));
    });
    document.addEventListener('pointerout', (e) => {
      const fn = fnOf(e);
      if (fn && fn === openFn && !(e.relatedTarget && fn.contains(e.relatedTarget))) leave(fn);
    });
    document.addEventListener('focusin', (e) => {
      const fn = fnOf(e);
      if (fn) open(fn, false);
    });
    document.addEventListener('focusout', (e) => {
      const fn = fnOf(e);
      if (fn && fn === openFn) leave(fn);
    });
    stack();
    addEventListener('resize', stack, { passive: true });
    addEventListener('load', stack);
    if (mq.addEventListener) mq.addEventListener('change', stack);
    if (typeof ResizeObserver === 'function') {
      const body = document.querySelector('.article-body');
      if (body) new ResizeObserver(() => stack()).observe(body);
    }
  } catch (e) {}
})();
`;
