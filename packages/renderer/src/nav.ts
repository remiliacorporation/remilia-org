import { esc } from "./html";

/**
 * Post rail: every post on the host, one flat date-sorted list (the no-JS
 * crawl surface). NAV_JS is search + ToC spy + 200ms hash scroll. Theme persist is a tiny head
 * script in page.ts (localStorage has no CSS equivalent). Category is a
 * native <select> filtered with CSS :has(). Each IIFE no-ops if its markup
 * is missing.
 */
export interface NavPost {
  title: string;
  url: string;
  date: string;
  category: string;
}

/** Radix MagnifyingGlass, 15×15, recolored via currentColor. */
const MAGNIFYING_GLASS = `<svg class="nav-search-icon" width="12" height="12" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M10 6.5C10 8.433 8.433 10 6.5 10C4.567 10 3 8.433 3 6.5C3 4.567 4.567 3 6.5 3C8.433 3 10 4.567 10 6.5ZM9.30884 10.0159C8.53901 10.6318 7.56251 11 6.5 11C4.01472 11 2 8.98528 2 6.5C2 4.01472 4.01472 2 6.5 2C8.98528 2 11 4.01472 11 6.5C11 7.56251 10.6318 8.53901 10.0159 9.30884L12.8536 12.1464C13.0488 12.3417 13.0488 12.6583 12.8536 12.8536C12.6583 13.0488 12.3417 13.0488 12.1464 12.8536L9.30884 10.0159Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd"></path></svg>`;

function shortDate(iso: string): string {
  const d = new Date(iso);
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const yy = String(d.getUTCFullYear()).slice(-2);
  return `${mm}.${dd}.${yy}`;
}

export function leftRail(posts: NavPost[], _label: string, indexHref = "/press"): string {
  const byDate = [...posts].sort((a, b) => b.date.localeCompare(a.date));
  const cats = [...new Set(posts.map((p) => p.category))].sort();
  const catOpts = [`<option value="" selected>All</option>`, ...cats.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`)].join("");
  const catCss = cats
    .map(
      (c) =>
        `.nav-box:has(#post-cat option[value="${esc(c)}"]:checked) .nav-all>li:not([data-cat="${esc(c)}"]){display:none}`,
    )
    .join("");
  const items = byDate
    .map(
      (p) =>
        `<li data-title="${esc(p.title)}" data-date="${esc(p.date)}" data-cat="${esc(p.category)}"><a href="${esc(p.url)}">${esc(p.title)}</a><span class="nav-meta"><time datetime="${esc(p.date)}">${shortDate(p.date)}</time><span class="nav-cat">${esc(p.category)}</span></span></li>`,
    )
    .join("\n");
  return `<div class="post-nav rail">
<input type="checkbox" id="nav-toggle" class="disclosure">
<label for="nav-toggle" class="disclosure-label">Posts</label>
<div class="nav-box">
${catCss ? `<style>${catCss}</style>` : ""}
<form class="nav-search" role="search">
<div class="nav-field-row">
<label class="nav-label" for="post-filter">Search Posts:</label>
<span class="nav-field"><input type="text" id="post-filter" autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false" aria-label="Search Posts">${MAGNIFYING_GLASS}</span>
</div>
</form>
<hr class="nav-rule">
<ul class="nav-all">
${items}
</ul>
<p class="nav-empty" hidden>No matching posts.</p>
<hr class="nav-rule">
<div class="nav-page">
<a href="${esc(indexHref)}" id="nav-index-link">View Index</a>
<span class="nav-sep" aria-hidden="true">|</span>
<label class="nav-label" for="post-cat">Category</label>
<select class="nav-cat-sel" id="post-cat" aria-label="Category">${catOpts}</select>
</div>
</div>
</div>`;
}

/** Search + ToC spy + 200ms in-page hash scroll. Each IIFE no-ops without its markup. */
export const NAV_JS = `(() => {
  const q = document.getElementById('post-filter');
  const list = document.querySelector('.post-nav .nav-all');
  const empty = document.querySelector('.post-nav .nav-empty');
  const form = document.querySelector('.post-nav .nav-search');
  if (!q || !list) return;
  const items = [...list.querySelectorAll('li[data-title]')];
  const score = (query, text) => {
    query = query.toLowerCase(); text = text.toLowerCase();
    let qi = 0, s = 0, streak = 0;
    for (let i = 0; i < text.length && qi < query.length; i++) {
      if (text[i] === query[qi]) { qi++; streak++; s += streak; } else streak = 0;
    }
    return qi === query.length ? s : -1;
  };
  const apply = () => {
    const query = q.value.trim();
    const ranked = items.map((li) => {
      const sc = query ? score(query, li.dataset.title) : 0;
      return { li, sc, show: query ? sc >= 0 : true };
    });
    if (query) ranked.sort((a, b) => b.sc - a.sc);
    let n = 0;
    ranked.forEach((r) => {
      r.li.hidden = r.show ? false : true;
      if (r.show) { n++; list.appendChild(r.li); }
    });
    if (empty) empty.hidden = n > 0;
  };
  if (form) form.addEventListener('submit', (e) => e.preventDefault());
  q.addEventListener('input', apply);
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
    const pick = () => {
      const y = 96;
      let h = hs[0];
      for (let i = 0; i < n; i++) {
        if (hs[i].getBoundingClientRect().top <= y) h = hs[i];
        else break;
      }
      if (h === curH) return;
      if (curH) curH.classList.remove('toc-current');
      if (curLi) curLi.classList.remove('toc-current');
      for (let i = 0; i < passed.length; i++) passed[i].classList.remove('toc-passed');
      passed = [];
      curH = h;
      curLi = liFor.get(h.id) || null;
      h.classList.add('toc-current');
      if (curLi) curLi.classList.add('toc-current');
      for (let i = 0; i < n; i++) {
        if (hs[i] === h) break;
        const li = liFor.get(hs[i].id);
        if (li) { li.classList.add('toc-passed'); passed.push(li); }
      }
    };
    pick();
    if (typeof IntersectionObserver === 'function') {
      const io = new IntersectionObserver(pick, { rootMargin: '-96px 0px -60% 0px', threshold: 0 });
      for (let i = 0; i < n; i++) io.observe(hs[i]);
    } else {
      let raf = 0;
      const on = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; pick(); }); };
      addEventListener('scroll', on, { passive: true });
    }
    addEventListener('resize', pick, { passive: true });
  } catch (e) {}
})();
(() => {
  try {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    document.documentElement.style.scrollBehavior = 'auto';
    const yFor = (el) => {
      const raw = getComputedStyle(el).scrollMarginTop;
      const m = raw.endsWith('%') ? innerHeight * parseFloat(raw) / 100 : parseFloat(raw) || 0;
      return Math.max(0, el.getBoundingClientRect().top + scrollY - m);
    };
    const go = (el) => {
      const to = yFor(el), from = scrollY, d = to - from;
      if (Math.abs(d) < 1) return;
      const t0 = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - t0) / 200);
        const e = t * t * (3 - 2 * t);
        scrollTo(0, from + d * e);
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    addEventListener('click', (e) => {
      if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest('a[href^="#"]');
      if (!a) return;
      const href = a.getAttribute('href');
      if (!href || href === '#') return;
      let id;
      try { id = decodeURIComponent(href.slice(1)); } catch (err) { return; }
      const el = document.getElementById(id);
      if (!el) return;
      e.preventDefault();
      if (location.hash !== href) history.pushState(null, '', href);
      go(el);
    });
  } catch (e) {}
})();
`;
