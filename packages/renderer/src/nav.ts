import { esc } from "./html";

export interface NavPost {
  title: string;
  url: string;
  date: string;
  category: string;
  excerpt?: string;
  imageUrl?: string;
  author?: string;
}

const MAGNIFYING_GLASS = `<svg class="nav-search-icon" width="12" height="12" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M10 6.5C10 8.433 8.433 10 6.5 10C4.567 10 3 8.433 3 6.5C3 4.567 4.567 3 6.5 3C8.433 3 10 4.567 10 6.5ZM9.30884 10.0159C8.53901 10.6318 7.56251 11 6.5 11C4.01472 11 2 8.98528 2 6.5C2 4.01472 4.01472 2 6.5 2C8.98528 2 11 4.01472 11 6.5C11 7.56251 10.6318 8.53901 10.0159 9.30884L12.8536 12.1464C13.0488 12.3417 13.0488 12.6583 12.8536 12.8536C12.6583 13.0488 12.3417 13.0488 12.1464 12.8536L9.30884 10.0159Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd"></path></svg>`;
const NAV_SEARCH = `<form class="nav-search" role="search">
<span class="nav-field"><input type="text" id="post-filter" autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false" placeholder="Search" aria-label="Search">${MAGNIFYING_GLASS}</span>
</form>`;

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
  const css = values
    .map(
      (v) =>
        `.nav-box:has(#${id}[data-value="${esc(v)}"]) .nav-all>li:not([${attr}="${esc(v)}"]){display:none}`,
    )
    .join("");
  const items = [`<li><button type="button" data-value="">${esc(empty)}</button></li>`, ...values.map((v) => `<li><button type="button" data-value="${esc(v)}">${esc(v)}</button></li>`)].join("");
  const html = `<details class="sel nav-cat-sel" id="${esc(id)}" data-value="" aria-label="${esc(aria)}">
<summary><span class="sel-label">${esc(empty)}</span><span class="sel-mark"></span></summary>
<ul class="sel-menu">${items}</ul>
</details>`;
  return { css, html };
}

function catSel(posts: NavPost[]): { css: string; html: string } {
  return filterSel("post-cat", "Filter posts", "All posts", [...new Set(posts.map((p) => p.category))].sort(), "data-cat");
}

function authorSel(posts: NavPost[]): { css: string; html: string } {
  const authors = [...new Set(posts.map((p) => p.author).filter((a): a is string => Boolean(a)))].sort();
  if (!authors.length) return { css: "", html: "" };
  return filterSel("post-author", "Filter authors", "All authors", authors, "data-author");
}

export function filterBar(posts: NavPost[]): string {
  const { html: cat } = catSel(posts);
  const { html: authors } = authorSel(posts);
  return `<div class="nav-page">
${NAV_SEARCH}
${cat}
${authors}
</div>`;
}

export function leftRail(posts: NavPost[], _label: string, _indexHref = "/press"): string {
  const byDate = [...posts].sort((a, b) => b.date.localeCompare(a.date));
  const { css, html: cat } = catSel(posts);
  const items = byDate
    .map(
      (p) =>
        `<li data-title="${esc(p.title)}" data-date="${esc(p.date)}" data-cat="${esc(p.category)}" data-author="${esc(p.author ?? "")}" data-month="${esc(p.date.slice(0, 7))}"><a href="${esc(p.url)}">${esc(p.title)}</a><span class="nav-meta"><time datetime="${esc(p.date)}">${shortDate(p.date)}</time> — <span class="nav-cat">${esc(p.category)}</span></span></li>`,
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
    const btn = v ? el.querySelector('.sel-menu [data-value="'+v+'"]') : null;
    if (lab) lab.textContent = btn && v ? btn.textContent : empty;
  };
  const bindSel = (el, empty) => {
    if (!el) return;
    el.addEventListener('click', (e) => {
      const mark = e.target.closest('.sel-mark');
      if (mark && el.dataset.value) {
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
      setSel(el, btn.getAttribute('data-value') || '', empty);
      el.open = false;
      page = 0; apply();
    });
  };
  const score = (query, text) => {
    query = query.toLowerCase(); text = (text || '').toLowerCase();
    let qi = 0, s = 0, streak = 0;
    for (let i = 0; i < text.length && qi < query.length; i++) {
      if (text[i] === query[qi]) { qi++; streak++; s += streak; } else streak = 0;
    }
    return qi === query.length ? s : -1;
  };
  const match = (el) => {
    const query = q ? q.value.trim() : '';
    const catv = cat ? (cat.dataset.value || '') : (params.get('cat') || '');
    const author = auth ? (auth.dataset.value || '') : (params.get('author') || '');
    const month = params.get('month') || '';
    const sc = query ? score(query, el.dataset.title) : 0;
    const ok = (query ? sc >= 0 : true)
      && (!catv || el.dataset.cat === catv)
      && (!author || el.dataset.author === author)
      && (!month || el.dataset.month === month);
    return { el, sc, show: ok };
  };
  const apply = () => {
    const query = q ? q.value.trim() : '';
    if (items.length && list) {
      const ranked = items.map(match);
      if (query) ranked.sort((a, b) => b.sc - a.sc);
      const vis = ranked.filter((r) => r.show);
      const pages = Math.max(1, Math.ceil(vis.length / PAGE));
      if (page >= pages) page = pages - 1;
      const from = page * PAGE;
      const onPage = new Set(vis.slice(from, from + PAGE).map((r) => r.el));
      ranked.forEach((r) => {
        r.el.hidden = !r.show;
        r.el.classList.toggle('off-page', r.show && !onPage.has(r.el));
        if (r.show) list.appendChild(r.el);
      });
      if (status) status.textContent = (page + 1) + ' / ' + pages;
      if (prev) prev.disabled = page <= 0;
      if (next) next.disabled = page >= pages - 1;
    }
    cards.forEach((c) => { c.hidden = !match(c).show; });
  };
  if (form) form.addEventListener('submit', (e) => e.preventDefault());
  if (q) q.addEventListener('input', () => { page = 0; apply(); });
  bindSel(cat, 'All posts');
  bindSel(auth, 'All authors');
  addEventListener('click', (e) => {
    const a = e.target.closest('.post-card a.author');
    if (!a || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const v = new URL(a.getAttribute('href'), location.href).searchParams.get('author') || '';
    if (auth) {
      e.preventDefault();
      setSel(auth, v, 'All authors');
      page = 0; apply();
    }
  });
  if (prev) prev.addEventListener('click', () => { page--; apply(); });
  if (next) next.addEventListener('click', () => { page++; apply(); });
  if (params.get('cat')) setSel(cat, params.get('cat'), 'All posts');
  if (params.get('author')) setSel(auth, params.get('author'), 'All authors');
  apply();
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
      const on = document.getElementById(id + '-on');
      if (on && on.type === 'checkbox') on.checked = true;
    });
    const boot = location.hash.slice(1);
    if (boot) {
      const on0 = document.getElementById(boot + '-on');
      if (on0 && on0.type === 'checkbox') on0.checked = true;
    }
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
  addEventListener('click', (e) => {
    if (e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest('a.permalink');
    if (!a || !navigator.clipboard || !navigator.clipboard.writeText) return;
    e.preventDefault();
    navigator.clipboard.writeText(a.href);
  });
})();
(() => {
  addEventListener('click', (e) => {
    const b = e.target.closest('.copy-md, .copy-txt');
    if (!b || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const src = b.getAttribute('data-src');
    if (!src || !navigator.clipboard || !navigator.clipboard.writeText) return;
    e.preventDefault();
    fetch(src).then((r) => { if (!r.ok) throw r; return r.text(); }).then((t) => navigator.clipboard.writeText(t));
  });
})();
`;

