# remilia-content

Sanity studio + remilia.org static tree. One project (`8x9419lh`), one
`production` dataset. Editors pick a **section**; host + URL are derived:

| Host | Sections | Paths |
|---|---|---|
| .org | updates, press, thought, archive | `/updates`, `/press`, `/thought`, `/archive` |
| .com | news, events | `/a/news`, `/a/events` (retires `/a/studio`) |
| .net | dev-updates, dev-blog | `/updates`, `/blog` |

Posts use schema field `channel` = section id (`dev-updates` so GROQ never
collides with org `updates`). **Events** are posts (`channel: events` →
`/a/events`): write a description in the body and attach gallery **albums** —
same idea as Ghost posts on blog.remilia.org. Optional venue/start fields
feed Event JSON-LD. Albums stay first-class docs under Com.

**Host missions:** remilia.org = theory + NFTs (thought) / press releases /
company updates / archive (coverage via Firecrawl + secondary essays);
remilia.com = fashion / lifestyle / publishing (+ events);
remilia.net = software outside NFTs (RemiliaNET, wiki, miladychan).

**Archive:** external coverage & interviews set `origin: external` +
`externalUrl` / `outlet`; Firecrawl fills `archiveSnapshot`. Secondary
Substack/Paragraph (not core TL) use `origin: first-party` and keep body.

**remilia.org** lives in this repo (`deploy/`). [remilia-site](https://github.com/remiliacorp/remilia-site)
is archived. Later project archives go under `deploy/<name>/` (e.g. `/maker`).

```
deploy/                 Netlify publish root
  index.html            remilia.org/
  about/ careers.html contact/
  assets/
  updates|press|thought|archive/   generated — do not edit; gitignored
  maker/                (later) static archive
```

## Run

```
pnpm install
pnpm dev          # Studio — http://localhost:3399
pnpm bake:org     # writes deploy/{updates,press,thought,archive} from Sanity
pnpm validate
pnpm typecheck
```

Netlify: `publish = deploy`, build = `pnpm bake:org`. Studio stays on Sanity
(`pnpm run deploy:studio` → remilia.sanity.studio), not on remilia.org.

Publishing in Studio does **not** update remilia.org by itself. Netlify rebuilds
on git push, or when you hit a [build hook](https://docs.netlify.com/manage/webhooks/build-hooks/).
To go live on Sanity publish, add a Sanity webhook → that Netlify hook (dataset
`production`, filter `_type == "post"`). Until then: `pnpm bake:org` locally or
push, then deploy.

Root `llms.txt` maps the host. Each section has its own `llms.txt` because
posts change. A static archive under `/maker` only needs a line in the root
`llms.txt` unless it is a large corpus.

### Section cheatsheet

Also in Studio under **Section cheatsheet**:

- **Updates** — company essays/memos (Christmas, Level-2, Admin Reveal, …).
- **Press** — org corporate statements only.
- **Thought** — org/product-relevant thought leadership (theory + NFTs).
- **Archive** — external coverage/interviews (Firecrawl snapshot) + secondary Substack/Paragraph.
- **News** (.com) — fashion, lifestyle brand, publishing, **and brand press releases** (HIKKI Punks, Atelier, FRUiTS, launches).
- **Events** (.com) — event writeups + galleries.
- **Dev blog** (.net) — RemiliaNET Alpha, wiki, miladychan. **Dev updates** — other net product notes (vault, etc.).

### Route / re-route posts

```
SANITY_TOKEN=… pnpm --filter @remilia/hosts exec node --import tsx migrate-channels.ts --all --write
FIRECRAWL_API_KEY=… SANITY_TOKEN=… pnpm --filter @remilia/hosts exec node --import tsx archive-firecrawl.ts --write
FIRECRAWL_API_KEY=… SANITY_TOKEN=… pnpm --filter @remilia/hosts exec node --import tsx miladychan-import.ts --write
```

Miladychan (`blog.miladychan.org`) imports into `dev-blog`, alongside RemiliaNET Alpha notes and the wiki launch.

## Shape

- `deploy/` — hand-authored remilia.org pages (former remilia-site)
- `hosts/org/` — org section chrome + `bake.ts` (default outDir = `deploy/`)
- `schemaTypes/documents/` — `post`, `event`, `album`, `author`, `tag`, `org`
- `schemaTypes/objects/` — `seo`, `blockContent`
- `structure.ts` — Org / Com / Net desks with section filters
- `lib/access.ts` — `CHANNEL_EDITORS` soft-lock by section

Write posts in Studio’s **Portable Text** editor (`body`). Bake emits HTML plus
`.md` / `.txt` siblings, RSS, JSON-LD, per-section `llms.txt`. Vault import:
`md-import` fills `body`.

## Ghost import (published posts, no admin)

Public sitemap + each post page → Portable Text. Drafts/scheduled are not on
the public site.

```
pnpm --filter @remilia/hosts import:ghost -- --out ghost-posts.ndjson
npx sanity dataset import ghost-posts.ndjson --dataset production --replace
```

Everything lands as `channel: press`. Retag events/dev posts in Studio.
`blog.remilia.org/{slug}/` stays the `migration.legacyUrl` for the 301 map.

## Markdown import (optional)

```
pnpm --filter @remilia/hosts exec node --import tsx md-import.ts ./vault --channel press --out posts.ndjson
npx sanity dataset import posts.ndjson production --replace
pnpm bake:org
```

Supported in imported Markdown: `##`/`###`/`####`, `**bold**` `*em*` `` `code` ``,
`[links](url)`, `[[wikilinks]]`, `[^n]` footnotes, images, lists, quotes.

## remilia.org notes (from remilia-site)

- Canonical is https://remilia.org/ (not www). Shop/atelier is https://remilia.com/.
- `/jobs` lists Ashby’s public board in page JS; apply URLs stay on Ashby.
- `assets/css/ashby-custom.css` is for Ashby admin, not this deploy.
- Do not deploy `font-test.html`. `_redirects` / `_headers` ship in `deploy/`.
- Default ink `#f00` is below WCAG AA by brand; `prefers-contrast: more` uses `#b00000`.

## Studio deploy

`pnpm deploy` is a pnpm builtin. Use `pnpm run deploy:studio` (`sanity deploy`).
`npx sanity login` first (Admin or a token with `deployStudio` + `deploySchema`).
After a Studio version bump, deploy once even if auto-updates are on —
auto-updates only bump the Sanity shell, **not** custom structure/schema.

### Why hosted Studio looks empty

`remilia.sanity.studio` was last deployed **2026-08-29** with the old desks
(Press / Studio→Journal / Devblog) filtering `press` / `studio` / `devblog`.
The dataset was since retagged into the ratified map (`updates`, `thought`,
`archive`, `news`, `events`, `dev-blog`, `dev-updates`, …), so those old panes
show nothing (or one leftover Press post).

Until an Admin redeploys:

1. Run Studio locally: `pnpm dev` → http://localhost:3333
2. Or Vision → `*[_type=="post" && channel=="dev-blog"]` (etc.)

Where content actually is (production counts):

| Desk (after deploy) | channel | ~count |
| --- | --- | --- |
| Org → Updates | `updates` | 5 |
| Org → Press | `press` | 1 (org statements only) |
| Org → Thought | `thought` | 30 |
| Org → Archive | `archive` | 56 |
| Com → News | `news` | 7 (brand PRs live here) |
| Com → Events | `events` | 27 |
| Net → Dev blog | `dev-blog` | 16 |
| Net → Dev updates | `dev-updates` | 2 |
