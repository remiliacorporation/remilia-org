# remilia-org

Sanity Studio + static site generator for [remilia.org](https://remilia.org/) and the
shared Remilia content graph (org / com / net).

**Content lives in Sanity Cloud**, not in this git repo. Beads (`bd`) holds agent task
tracking only — see [docs/beads-sync.md](docs/beads-sync.md). This repo is intended to
be **public** for Netlify’s free GitHub deploy tier.

## Host map

| Host | Role | Sections | Paths |
| --- | --- | --- | --- |
| **remilia.org** | Corporate + literature | updates, press, thought, archive | `/updates`, `/press`, `/thought`, `/archive` |
| **remilia.com** | Fashion / brand / shop / culture | news, events | `/a/news`, `/a/events` |
| **remilia.net** | Software + engineering blog | dev-updates, dev-blog | `/updates`, `/blog` |

Posts use schema field `channel` = section id (`dev-updates` avoids GROQ collision with
org `updates`). Events are posts with gallery albums. Archive entries can store a
Firecrawl snapshot of an external outlet plus our commentary.

**remilia.org** is not the digital storefront, community encyclopedia, or RemiliaNET.
Shop: [remilia.com](https://remilia.com/). Encyclopedia:
[wiki.remilia.org/Remilia_Corporation](https://wiki.remilia.org/Remilia_Corporation).
Hiring: [/careers](https://remilia.org/careers).

## Where data lives

| What | Where | In git? |
| --- | --- | --- |
| **Posts & drafts** | Sanity project `8x9419lh`, dataset `production` | No — fetched at bake time via API token |
| **Published static HTML** | `deploy/{updates,press,thought,archive}/` after `pnpm bake` | Generated dirs are **gitignored** |
| **Corporate pages** | `deploy/` (about, home, careers, contact) | Yes — hand-authored |
| **Agent issues / memories** | Beads Dolt DB → private `remilia-beads` remote | No — see [docs/beads-sync.md](docs/beads-sync.md) |
| **Studio UI** | Hosted at `remilia.sanity.studio` (`pnpm run deploy:studio`) | Schema + structure in this repo |

Draft posts live in Sanity under the `drafts.*` document namespace. Bake skips them
(`!(_id in path("drafts.**"))` in the GROQ query). Unpublished posts with a
`publishedAt` backdate stay in Sanity but do not emit to `deploy/` until published.

## Run

```bash
pnpm install
pnpm dev              # Studio — http://localhost:3333
pnpm bake             # bake:org (literature) then bake:fx (print FX twins)
pnpm validate
pnpm typecheck
```

### Netlify

`netlify.toml`: `publish = deploy`, `command = pnpm bake`.

Set in the Netlify site env (not in git):

- `SANITY_TOKEN` or `SANITY_AUTH_TOKEN` — read access for `bake:org`

Publishing in Studio does **not** rebuild remilia.org automatically. Wire a Sanity
webhook → Netlify build hook (dataset `production`, filter `_type == "post"`), or push /
run `pnpm bake` locally.

### Going public

1. Create private [remilia-beads](docs/beads-sync.md) and run `bd dolt push` (Beads sync
   must not live on the public code remote).
2. Confirm no secrets tracked: `git ls-files | rg -i 'env|token|secret'`.
3. GitHub → Settings → Change visibility → **Public**, then connect Netlify.

## How it is built

One Sanity content graph feeds three public hosts; `channel` selects host and URL path.

On **remilia.org**, literature is baked to static files. Each published post emits:

- HTML + `.md` + `.txt` siblings
- Section indexes
- `rss.xml`, `atom.xml`, `sitemap.xml`, `llms.txt`

External archive entries keep the outlet URL as HTML canonical. Root `sitemap.xml`,
`robots.txt`, `llms.txt`, and `llms-full.txt` cover corporate pages; section maps sit
beside each index. Reading does not require JavaScript.

```
deploy/                 Netlify publish root
  index.html about/ careers.html contact/
  assets/css/site.css   corporate chrome + print FX
  updates|press|thought|archive/   generated — gitignored
hosts/org/bake.ts       org section bake
hosts/bake-fx.ts        print FX twin injection
packages/renderer/      Portable Text → HTML, excerpt polish
packages/seo/           channels, feeds, sitemaps
schemaTypes/            Sanity documents + objects
structure.ts            Org / Com / Net Studio desks
```

Import / migration scripts: [docs/ops.md](docs/ops.md).

## Standards

- HTML5: one `H1`, landmarks, skip link, `lang` on `<html>`
- CSS without a framework; brand ink `#f00` (AA via `prefers-contrast: more`)
- Feeds: RSS 2.0 and Atom (RFC 4287)
- Discovery: `rel=canonical`, Open Graph, Twitter Cards, `sitemap.xml`, `robots.txt`,
  `llms.txt` / `llms-full.txt`
- JSON-LD ([schema.org](https://schema.org/)): `Organization`, `AboutPage`,
  `BlogPosting`, `BreadcrumbList`, `Event` where applicable
- Literature: Portable Text → semantic HTML, blockquotes, footnotes; images with `alt`

## Print surface (corporate pages)

Authors maintain one tree: `.layer-base` (readable document). At build time,
`bake:fx` clones a decorative `.layer-fx` twin:

- `aria-hidden`, `inert`, `data-nosnippet`, `pointer-events: none`
- Embed `src` blanked so SoundCloud/YouTube do not double-load
- SVG filter `#print-fx` (`feTurbulence` + `feDisplacementMap`) misregisters ink
- Crest / photo cells: `#dither-3` desaturate + three-level posterize + ink overlay
- Hover sync via `:has()` from base → FX layer
- `prefers-reduced-motion` disables displacement; print CSS hides FX layer

See [/about](https://remilia.org/about) for the live document.

## Studio

```bash
pnpm run deploy:studio   # NOT `pnpm deploy` (pnpm builtin)
npx sanity login         # Admin or token with deployStudio + deploySchema
```

Project: `8x9419lh` · Dataset: `production` · Hosted: `remilia.sanity.studio`

## License

All rights reserved unless otherwise noted. Site content © Remilia.
