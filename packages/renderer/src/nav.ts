import { esc } from "./html";

/**
 * Left rail: every post on the host, one flat date-sorted list (the no-JS
 * crawl surface). Controls (search / category / sort) are progressive — a
 * ~40-line inline filter (NAV_JS) fuzzy-filters and reorders the
 * already-present <li>s client-side. With JS off the full list still
 * renders and the native <datalist> gives substring typeahead.
 */
export interface NavPost {
  title: string;
  url: string;
  date: string;
  category: string;
}

export function leftRail(posts: NavPost[], label: string): string {
  const byDate = [...posts].sort((a, b) => b.date.localeCompare(a.date));
  const cats = [...new Set(posts.map((p) => p.category))].sort();
  const options = byDate
    .map((p) => `<option value="${esc(p.title)}"></option>`)
    .join("");
  const catOpts = cats.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
  const items = byDate
    .map(
      (p) =>
        `<li data-title="${esc(p.title)}" data-date="${esc(p.date)}" data-cat="${esc(p.category)}"><a href="${esc(p.url)}">${esc(p.title)}</a><span class="nav-meta"><time datetime="${esc(p.date)}">${p.date.slice(0, 10)}</time> · ${esc(p.category)}</span></li>`,
    )
    .join("\n");
  return `<div class="post-nav rail">
<input type="checkbox" id="nav-toggle" class="disclosure">
<label for="nav-toggle" class="disclosure-label">${esc(label)}</label>
<form class="nav-search" role="search" onsubmit="return false">
<input type="search" id="post-filter" list="post-titles" placeholder="Filter posts…" aria-label="Filter posts" autocomplete="off">
<datalist id="post-titles">${options}</datalist>
<div class="nav-controls">
<label>Category <select id="post-cat"><option value="">All</option>${catOpts}</select></label>
<label>Sort <select id="post-sort"><option value="date">Newest</option><option value="az">A–Z</option></select></label>
</div>
</form>
<ul class="nav-all">
${items}
</ul>
<p class="nav-empty" hidden>No matching posts.</p>
</div>`;
}

/** Inline, dependency-free. Fuzzy = subsequence match with streak scoring. */
export const NAV_JS = `(() => {
  const q = document.getElementById('post-filter');
  const cat = document.getElementById('post-cat');
  const sort = document.getElementById('post-sort');
  const list = document.querySelector('.post-nav .nav-all');
  const empty = document.querySelector('.post-nav .nav-empty');
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
    const c = cat ? cat.value : '';
    const mode = sort ? sort.value : 'date';
    const rows = items.map((li) => {
      const catOk = !c || li.dataset.cat === c;
      const sc = query ? score(query, li.dataset.title) : 0;
      const show = catOk && (query ? sc >= 0 : true);
      li.hidden = !show;
      return { li, sc, show };
    });
    const shown = rows.filter((r) => r.show);
    shown.sort((a, b) => {
      if (query) return b.sc - a.sc;
      if (mode === 'az') return a.li.dataset.title.localeCompare(b.li.dataset.title);
      return b.li.dataset.date.localeCompare(a.li.dataset.date);
    });
    for (const { li } of shown) list.appendChild(li);
    if (empty) empty.hidden = shown.length > 0;
  };
  q.addEventListener('input', apply);
  cat && cat.addEventListener('change', apply);
  sort && sort.addEventListener('change', apply);
})();
`;
