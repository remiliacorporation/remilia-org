# Agent instructions

## Shell

Use non-interactive file ops: `cp -f`, `mv -f`, `rm -f` / `rm -rf`.
For `ssh` / `scp`: `-o BatchMode=yes`.

## Content

Posts and drafts live in **Sanity Cloud** (project `8x9419lh`, dataset `production`).
This repo holds the Studio schema, bake pipeline, and hand-authored corporate HTML.

Posts use schema field `channel` = section id. Events are posts with gallery albums.
Press and Archive entries can store an external outlet URL plus a Firecrawl snapshot and commentary.
The section row reads Updates, Thought, Press, Archive (`ORG_SECTIONS`). The pooled index at
`/blog` (All) lists Updates and Thought; Press and Archive list only under `/blog/press` and
`/blog/archive` (`HOST_POOLED` in `packages/seo/src/urls.ts`).

## Build

```bash
pnpm install
pnpm dev              # Studio — http://localhost:3333
pnpm validate
pnpm typecheck
pnpm test
pnpm bake             # remilia.org: bake:corp then bake:org
pnpm bake:com         # remilia.com blog → deploy-com/a/blog/{news,events}
pnpm bake:net         # blog.remilia.net → deploy-net/{updates,dev-blog}
```

Sanity: project `8x9419lh`, dataset `production`.

The Studio (`sanity`, `react`, `styled-components`) is a **devDependency**: `pnpm dev`,
`validate`, `typecheck` and `deploy:studio` need it, the bake never imports it. A
production install is 30MB against 501MB for the full tree, so `netlify.toml` prunes
before baking. Keep bake-time needs (`tsx`, `@sanity/client`) in `dependencies`.

Every host bakes from `hosts/core/bake-host.ts` — same credentials, guards and
stylesheets — differing only in sections and output directory. `hosts/{org,com,net}/bake.ts`
are those three declarations. Section copy and chrome live in `hosts/core/sections.ts`.

Two surfaces, kept separate:

- **Blog** (generated, themed): `packages/renderer` markup + `hosts/core/theme.css`
  (the skin: tokens, hue/scheme/lattice/dither) + `hosts/core/blog/*.css` (the
  component system: base, chrome, controls, index, nav, prose, media, notes,
  layout, print — concatenated in that order). `packages/conformance`'s
  `auditDesignSystem` lints the concatenated sheet: colors/spacing/weights/borders
  must be tokens, no transitions, each token defined once.
- **Corporate** (hand-authored, fixed palette): `deploy/src/**` pages +
  `deploy/assets/css/site.css` — its own system; it does not consume theme.css.

com and net bake **blog sections only** — their storefront and product pages are not built
here — so their output is a fragment of a larger site and the internal-link check is off
for them (nothing under `deploy-com/` can satisfy `/favicon.ico`). Each needs its own
Netlify site with `publish = deploy-com` / `deploy-net` and the matching bake command.

Each host pins a default theme on `<html>` (`data-hue`/`data-dots`/`data-scheme`) from
`SITE_META` in `packages/seo/src/site.ts`: org red, dark, dense lattice; com red, dark,
no lattice; net blue, light, sparse lattice. A stored reader preference still wins.

Corporate HTML: edit `deploy/src/` (`.layer-base` only). `bake:corp` expands head partials
and drops any stale `.layer-fx` twin. Baked pages land in `deploy/` (gitignored). Generated
literature under `deploy/{updates,press,thought,archive}/` is gitignored — do not hand-edit.

Bake emits per post: HTML, `.md`, `.txt`. Per section: `index.html`, `index.md`,
`index.txt`, `rss.xml`, `atom.xml`, `sitemap.xml`, `llms.txt`. Production bakes
and Netlify Deploy Previews both use Sanity's published perspective.

## Netlify

`netlify.toml`: `publish = deploy`,
`command = "pnpm install --prod --frozen-lockfile && pnpm --filter @remilia/hosts bake"`.

Set `SANITY_TOKEN` or `SANITY_AUTH_TOKEN` in the Netlify site env (read access for `bake:org`).

`bake:org` proves the credential and requires at least one post in the selected
dataset perspective before writing files; individual sections may be intentionally
empty. A missing token, an expired or forbidden token (401/403), and a zero-post
dataset abort the build, so the previous deploy stays live. The bake asks for a token
whatever the dataset allows: a private dataset answers a tokenless read empty, not with
an error, and this dataset answered tokenless reads with its published documents when
observed on 2026-11-13, so treat everything published as public. `ALLOW_EMPTY_BAKE=1` overrides the dataset-wide guard and must
never be set in the Netlify environment.

Netlify Deploy Previews bake published content, like production. Their URLs answer
without a login (observed 2026-11-13), and draft content must never be exposed on an
unprotected preview URL. The bake still honors `SANITY_PERSPECTIVE=drafts`, which also
includes scheduled posts: set it for the deploy-preview context only after Deploy
Previews are protected in the Netlify site settings.

Publishing in Studio does not rebuild remilia.org by itself. Wire a Sanity webhook to a
Netlify build hook (dataset `production`, filter `_type == "post"`), or run `pnpm bake`
locally and push.

## Fallbacks

Renamed or moved posts: fill **Previous paths** on the post. Each entry becomes an
unforced 301 (page plus `.md`/`.txt`) in that section's `bake:redirects:<section>` block
in `_redirects`. Unforced, so a real page always wins.

Each section ends its block with `<section>/*  <section>/404.html  404`, so a miss lands
on that section's 404 (latest posts + index + maps) rather than the corporate one.

A page past a listing's end (`<section>/page/9`, and the same under `tags`, `authors`
and `months`) 301s to the listing's first page, so a listing that shrinks leaves no 404.

`blog.remilia.org` (the old Ghost blog) is meant to be a domain alias of the remilia.org
Netlify site. `bake:org` writes forced host rules for it in `bake:redirects:legacy-host`:
each Ghost post filed under a remilia.org section 301s from its old URL (with or without
the trailing slash) to `remilia.org/blog/<section>/<slug>`, matched on the post's
`migration.legacyUrl`; every other path there (`/`, `/ghost`, `/rss/`, tag and author
pages, and Ghost posts filed under com or net sections) 301s to `remilia.org/blog`. The
edge function passes that host straight through to these rules.

`netlify/edge-functions/not-found.ts` covers what `_redirects` cannot express:
mixed-case section URLs 301 to lowercase (`/Updates/Post` → `/updates/post`), a page's
`.html` twin 301s to its slashless URL (`/about.html` → `/about`; org only, the com and
net sites run no edge function), and a
missing `.md`/`.txt`/`.xml`/`.json` answers in its own format instead of serving HTML
under a machine-readable URL. `SECTION_PREFIXES` in `lib/paths.ts` is duplicated for the
Deno runtime; a test in `packages/seo` fails if it drifts from `CHANNEL_BASEPATH`.

Every section bakes tag and author archives (`<section>/tags/<term>`,
`<section>/authors/<term>`) with their own RSS and sitemap entries, plus a term
directory at `<section>/tags` and `<section>/authors`. Listings paginate at 20 posts
per page (`<section>/page/2`) with `rel=prev`/`rel=next`. Page URLs have no trailing
slash. A listing of more than one page also bakes `search.json`, the index its search
box loads.

`bake:org` fails on dead internal links once every section is on disk; override with
`ALLOW_BROKEN_LINKS=1`. Future-dated posts stay out until a bake runs after their date,
so scheduling needs a periodic or webhook-driven build.

## Build spend

Every push to `main` is a production build, and each one reinstalls a ~500MB dependency
tree to run a 2-second bake. `netlify/ignore-build.sh` (wired as `[build] ignore`) cancels
builds whose commit range touches only tests or docs. Studio webhooks, scheduled builds
and manual retries always build, since content changes arrive without a commit.

Land related work in one merge rather than a merge per change, and keep deploy previews
off for branches nobody reviews in the browser — previews cost the same minutes as
production builds.

## Studio

```bash
pnpm run deploy:studio
npx sanity login
```

Hosted at `remilia.sanity.studio`. Do not use `pnpm deploy` (pnpm builtin).

## Corporate pages

Edit `.layer-base` only in `deploy/src/` (about, home, careers, contact). `bake:corp` merges
head partials; the `print-fx` filter prints the spread ink pass from that one layer —
no twin, no client JS.
Details: [/about](https://remilia.org/about).

## License

[Viral Public License (VPL)](https://viralpubliclicense.org/) — see [LICENSE](LICENSE).
