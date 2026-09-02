# Agent instructions

## Shell

Use non-interactive file ops: `cp -f`, `mv -f`, `rm -f` / `rm -rf`.
For `ssh` / `scp`: `-o BatchMode=yes`.

## Build

```bash
pnpm install
pnpm validate
pnpm typecheck
pnpm bake
cd hosts && node --import tsx --test bake-fx.test.ts
```

Sanity: project `8x9419lh`, dataset `production`.

Corporate HTML: edit `.layer-base` only; run `pnpm bake:fx` (or full `pnpm bake`) to
regenerate `.layer-fx`. Generated literature under `deploy/{updates,press,thought,archive}/`
is gitignored — do not hand-edit.

Studio deploy: `pnpm run deploy:studio` (not `pnpm deploy`).
