# Agent instructions

## Shell

Use non-interactive file ops: `cp -f`, `mv -f`, `rm -f` / `rm -rf`.
For `ssh` / `scp`: `-o BatchMode=yes`.

## Content

Posts and drafts live in **Sanity Cloud** (project `8x9419lh`, dataset `production`).
This repo holds the Studio schema, bake pipeline, and hand-authored corporate HTML.

Posts use schema field `channel` = section id. Events are posts with gallery albums.
Archive entries can store an external outlet URL plus a Firecrawl snapshot and commentary.

## Build

```bash
pnpm install
pnpm dev              # Studio — http://localhost:3333
pnpm validate
pnpm typecheck
pnpm test
pnpm bake             # remilia.org: bake:corp then bake:org then bake:fx
pnpm bake:com         # remilia.com blogs → deploy-com/{a/news,a/events}
pnpm bake:net         # remilia.net blogs → deploy-net/{updates,blog}
```

Sanity: project `8x9419lh`, dataset `production`.

The Studio (`sanity`, `react`, `styled-components`) is a **devDependency**: `pnpm dev`,
`validate`, `typecheck` and `deploy:studio` need it, the bake never imports it. A
production install is 30MB against 501MB for the full tree, so `netlify.toml` prunes
before baking. Keep bake-time needs (`tsx`, `@sanity/client`) in `dependencies`.

Every host bakes from `hosts/core/bake-host.ts` — same credentials, guards and
stylesheets — differing only in sections and output directory. `hosts/{org,com,net}/bake.ts`
are those three declarations. Section copy and chrome live in `hosts/core/sections.ts`;
the theme layer is `hosts/core/theme.css`, shared by all three.

com and net bake **blog sections only** — their storefront and product pages are not built
here — so their output is a fragment of a larger site and the internal-link check is off
for them (nothing under `deploy-com/` can satisfy `/favicon.ico`). Each needs its own
Netlify site with `publish = deploy-com` / `deploy-net` and the matching bake command.

Each host pins a default theme on `<html>` (`data-hue`/`data-dots`/`data-scheme`) from
`SITE_META` in `packages/seo/src/site.ts`: org red, light, dense lattice; com red, dark,
no lattice; net blue, light, sparse lattice. A stored reader preference still wins.

Corporate HTML: edit `deploy/src/` (`.layer-base` only). `bake:corp` expands head partials;
`bake:fx` clones `.layer-fx` at build. Baked pages land in `deploy/` (gitignored). Generated
literature under `deploy/{updates,press,thought,archive}/` is gitignored — do not hand-edit.

Bake emits per post: HTML, `.md`, `.txt`. Per section: `index.html`, `index.md`,
`index.txt`, `rss.xml`, `atom.xml`, `sitemap.xml`, `llms.txt`. Drafts (`drafts.*`
in Sanity) are skipped at bake.

## Netlify

`netlify.toml`: `publish = deploy`, `command = "pnpm bake"`.

Set `SANITY_TOKEN` or `SANITY_AUTH_TOKEN` in the Netlify site env (read access for `bake:org`).

`bake:org` proves the credential before writing a file, and refuses to publish an empty
section. A missing token (tokenless reads answer empty, not an error), an expired or
forbidden token (401/403), and a zero-post dataset all abort the build, so the previous
deploy stays live with its posts intact. Only `ALLOW_EMPTY_BAKE=1` can publish an empty
section — never set it in the Netlify env.

Publishing in Studio does not rebuild remilia.org by itself. Wire a Sanity webhook to a
Netlify build hook (dataset `production`, filter `_type == "post"`), or run `pnpm bake`
locally and push.

## Fallbacks

Renamed or moved posts: fill **Previous paths** on the post. Each entry becomes an
unforced 301 (page plus `.md`/`.txt`) in that section's `bake:redirects:<section>` block
in `_redirects`. Unforced, so a real page always wins.

Each section ends its block with `<section>/*  <section>/404.html  404`, so a miss lands
on that section's 404 (latest posts + index + maps) rather than the corporate one.

`netlify/edge-functions/not-found.ts` covers what `_redirects` cannot express:
mixed-case section URLs 301 to lowercase (`/Updates/Post` → `/updates/post`), and a
missing `.md`/`.txt`/`.xml`/`.json` answers in its own format instead of serving HTML
under a machine-readable URL. `SECTION_PREFIXES` in `lib/paths.ts` is duplicated for the
Deno runtime; a test in `packages/seo` fails if it drifts from `CHANNEL_BASEPATH`.

Every section bakes tag and author archives (`<section>/tags/<term>/`,
`<section>/authors/<term>/`) with their own RSS and sitemap entries, plus a term
directory at `<section>/tags/` and `<section>/authors/`. Listings paginate at 20 posts
per page (`<section>/page/2/`) with `rel=prev`/`rel=next`.

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
head partials; `bake:fx` clones `.layer-fx` at build for the print filter — no client JS.
Details: [/about](https://remilia.org/about).

## License

[Viral Public License (VPL)](https://viralpubliclicense.org/) — see [LICENSE](LICENSE).
