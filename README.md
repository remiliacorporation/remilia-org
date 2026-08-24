# remilia-content

Sanity studio for the Remilia content graph. One project (`8x9419lh`), one
`production` dataset, one `post` type fanned out to three sites by `channel`:

| Channel | Publishes to |
|---|---|
| `press` | remilia.org/press |
| `studio` | remilia.com/a/studio (+ events, albums) |
| `devblog` | remilia.net/blog |

Full plan: `remilia-site/BLOG-MIGRATION.md` (ratified 2026-08-23).

## Run

```
pnpm install
pnpm dev          # http://localhost:3399 (CORS origin already registered)
pnpm validate     # sanity schema validate
pnpm typecheck
```

## Shape

- `schemaTypes/documents/` — `post` (channel-required), `event`, `album`,
  `author`, `tag`, `org` (singleton, Organization JSON-LD source of truth)
- `schemaTypes/objects/` — `seo` (per-doc overrides), `blockContent`
  (presentation-neutral; Ghost Koenig card objects land after the export
  audit)
- `structure.ts` — three desks (Press / Studio / Devblog); Events + Albums
  under Studio; `org` singleton pinned
- `lib/access.ts` — `CHANNEL_EDITORS` soft-lock (UI-level; content-scoped
  roles are Enterprise-only). Fill emails per channel to lock desks.

## SEO/LLM invariants enforced by the schema

- `channel` required → canonical URL is always derived, never hand-picked
- `slug` lowercase-hyphen regex + per-channel uniqueness (async check)
- `excerpt` required (meta description / RSS / llms.txt line)
- `publishedAt` required (RSS, sitemap lastmod, JSON-LD dates)
- alt text required on cover, body, event, and album images
- `event.startsAt` required (Event JSON-LD), end-after-start check
- `seo` object is overrides-only; `noIndex` per doc; `canonical` only for
  syndication
- content is structured blocks, never raw HTML

## Studio deploy (later)

`pnpm deploy` → `studio.remilia.org`, `noindex`, never on a public sitemap.
