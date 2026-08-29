# remilia-content

Sanity studio + remilia.org static tree. One project (`8x9419lh`), one
`production` dataset. Editors pick a **section**; host + URL are derived:

| Host | Sections | Paths |
|---|---|---|
| .org | updates, press, thought, archive | `/updates`, `/press`, `/thought`, `/archive` |
| .com | news, events | `/a/news`, `/a/events` (retires `/a/studio`) |
| .net | net-updates, devblog | `/updates`, `/blog` |

Posts use schema field `channel` = section id (`net-updates` so GROQ never
collides with org `updates`). **Events** are document type `event` (not a
post channel) under the Com desk — same host surface as news, path `/a/events`.
Albums attach to events.

**Archive:** `origin` is `first-party` or `external`. External entries set
`externalUrl`, `outlet`, optional `commentary`; `/archive/<slug>` is the
citing record and HTML canonical points at the original when we are not the
publisher.

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

- **Updates** (.org) — routine notes, shipping logs, small announcements.
- **Press** — formal releases / major launches meant to be cited as press.
- **Thought** — essays, longform, positions.
- **Archive** — notable writing by or about Remilia (incl. external coverage).
- **News** (.com) — brand/journal posts (replaces `/a/studio`).
- **Updates** (.net, id `net-updates`) — product/network routine notes.
- **Devblog** — engineering depth and changelogs.

### Retiring `/a/studio`

Migrate existing journal posts:  
`SANITY_TOKEN=… pnpm --filter @remilia/hosts exec node --import tsx migrate-studio-to-news.ts --write`  
Com publish root should ship `hosts/com/_redirects` (`/a/studio` → `/a/news`,
`/a/studio/events` → `/a/events`).

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
`npx sanity login` first. After a Studio version bump, deploy once even if
auto-updates are on.
