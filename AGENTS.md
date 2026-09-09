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
pnpm bake             # bake:corp then bake:org then bake:fx
cd hosts && node --import tsx --test bake-corp.test.ts bake-fx.test.ts
```

Sanity: project `8x9419lh`, dataset `production`.

Corporate HTML: edit `deploy/src/` (`.layer-base` only). `bake:corp` expands head partials;
`bake:fx` clones `.layer-fx` at build. Baked pages land in `deploy/` (gitignored). Generated
literature under `deploy/{updates,press,thought,archive}/` is gitignored — do not hand-edit.

Bake emits per post: HTML, `.md`, `.txt`. Per section: `index.html`, `index.md`,
`index.txt`, `rss.xml`, `atom.xml`, `sitemap.xml`, `llms.txt`. Drafts (`drafts.*`
in Sanity) are skipped at bake.

## Netlify

`netlify.toml`: `publish = deploy`, `command = "pnpm bake"`.

Set `SANITY_TOKEN` or `SANITY_AUTH_TOKEN` in the Netlify site env (read access for `bake:org`).
Without it the query returns nothing, so `bake:org` **fails** rather than publishing empty
sections over the live posts. Bake a genuinely empty section with `ALLOW_EMPTY_BAKE=1`.

Publishing in Studio does not rebuild remilia.org by itself. Wire a Sanity webhook to a
Netlify build hook (dataset `production`, filter `_type == "post"`), or run `pnpm bake`
locally and push.

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
