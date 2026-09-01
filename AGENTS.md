# Agent instructions

Issue tracking is **bd (beads)**. Run `bd prime` for workflow context.

```bash
bd ready
bd show <id>
bd update <id> --claim
bd close <id>
bd dolt push
```

Use `bd` for task tracking (not markdown TODO lists). Use `bd remember` for
durable project memory. Issues live in a local Dolt DB; sync uses
`refs/dolt/data` on the git remote. See
[SYNC_CONCEPTS.md](https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md).

Skill: `.agents/skills/beads/SKILL.md`

## Shell

Always use non-interactive file ops (`cp -f`, `mv -f`, `rm -f` / `rm -rf`).
Prefer `ssh`/`scp` with `-o BatchMode=yes`.

## Build

```bash
pnpm install
pnpm validate
pnpm typecheck
pnpm bake          # bake:org + bake:fx
cd hosts && node --import tsx --test bake-fx.test.ts
```

Corporate pages: edit `.layer-base` only; `bake:fx` regenerates `.layer-fx`.
Ops/import recipes: [docs/ops.md](docs/ops.md).
