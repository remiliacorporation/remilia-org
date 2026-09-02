# Ops & migration

Scripts live under `hosts/` (`pnpm --filter @remilia/hosts <script>`). Tokens
come from the environment — never commit them.

```bash
# Retag imported posts into the ratified section map
SANITY_TOKEN=… pnpm --filter @remilia/hosts migrate:channels -- --all --write

# Firecrawl external archive URLs → archive snapshot field
FIRECRAWL_API_KEY=… SANITY_TOKEN=… pnpm --filter @remilia/hosts archive:firecrawl -- --write

# Ghost public sitemap → NDJSON → Sanity
pnpm --filter @remilia/hosts import:ghost -- --out ghost-posts.ndjson
npx sanity dataset import ghost-posts.ndjson production --replace

# Markdown vault
pnpm --filter @remilia/hosts import:md -- ./vault --channel press --out posts.ndjson

# Draft-only until section map is confirmed
SANITY_TOKEN=… pnpm --filter @remilia/hosts unpublish:posts -- --write

# Post polish (excerpts, quotes, footnotes, SEO, tags)
SANITY_TOKEN=… pnpm --filter @remilia/hosts polish:posts -- --write
```

Studio deploy: `pnpm run deploy:studio` (`npx sanity login` first).
`pnpm deploy` is a pnpm builtin — do not use it for Studio.

## remilia.org deploy notes

- Canonical host is `https://remilia.org/` (not www).
- `/jobs` embeds Ashby’s public board; apply URLs stay on Ashby.
- `deploy/assets/css/ashby-custom.css` is for Ashby admin CSS, not the site.
- Do not publish `font-test.html`. `_redirects` / `_headers` ship in `deploy/`.
