# Beads sync (private remote)

Issue tracking uses [Beads](https://github.com/gastownhall/beads) (`bd`). **Sanity posts and drafts are not stored here** — they live in Sanity Cloud (see README). Beads only holds agent task notes, memories, and audit metadata.

Cross-machine sync uses a **private** Dolt remote, separate from the public `remilia-org` code repo.

## One-time setup (maintainer)

1. Create a **private** empty repo, e.g. `remiliacorporation/remilia-beads`.
2. Point this project at it:

```bash
bd config set sync.remote git+https://github.com/remiliacorporation/remilia-beads.git
bd dolt remote add origin git+https://github.com/remiliacorporation/remilia-beads.git
bd dolt push --force
```

3. Remove any old Dolt ref from the public code repo (if it exists):

```bash
git push origin :refs/dolt/data
```

4. Confirm `remilia-org` has **no** `refs/dolt/*` on GitHub (Settings → or `git ls-remote origin 'refs/dolt/*'`).

## Daily use

```bash
bd dolt push    # after closing/updating issues
bd dolt pull    # on another machine after clone
```

Local-only (never commit): `.beads/interactions.jsonl`, `.beads/embeddeddolt/`, `.beads/backup/`.

Tracked in git: `.beads/config.yaml` (includes `sync.remote` URL — no secrets), hooks, `metadata.json`.
