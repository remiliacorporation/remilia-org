#!/usr/bin/env bash
# Netlify "ignore builds" command.
#
# Exit 0 cancels the build, non-zero proceeds. Most commits in this repo touch
# renderer internals, tests or docs and cannot change a single published byte,
# yet every push spent a full install-and-bake cycle. Only build when the
# commit range touches something the deployed output is made of.
#
# Content changes never reach us as a commit, so anything that is not a plain
# git push — a Studio webhook, a scheduled build, a manual retry — always builds.
set -uo pipefail

# Build-hook and scheduled builds: content may have changed with no commit.
if [ -n "${INCOMING_HOOK_TITLE:-}" ] || [ -n "${INCOMING_HOOK_BODY:-}" ] ||
	[ -n "${INCOMING_HOOK_URL:-}" ]; then
	echo "build: triggered by hook, not a commit"
	exit 1
fi

# First build on a branch, or a rebuild of the same commit (manual retry).
if [ -z "${CACHED_COMMIT_REF:-}" ] || [ -z "${COMMIT_REF:-}" ] ||
	[ "${CACHED_COMMIT_REF}" = "${COMMIT_REF}" ]; then
	echo "build: no previous deploy to compare against"
	exit 1
fi

# Paths the deployed output is built from. Tests and docs are excluded: they
# cannot change a byte under deploy/.
if git diff --quiet "${CACHED_COMMIT_REF}" "${COMMIT_REF}" -- \
	deploy \
	hosts \
	packages \
	schemaTypes \
	structure \
	lib \
	netlify \
	netlify.toml \
	package.json \
	pnpm-lock.yaml \
	sanity.config.ts \
	':!**/*.test.ts' \
	':!**/*.md'; then
	echo "skip: no change to anything the deploy is built from"
	exit 0
fi

echo "build: deploy inputs changed"
git diff --name-only "${CACHED_COMMIT_REF}" "${COMMIT_REF}" -- \
	deploy hosts packages schemaTypes structure lib netlify netlify.toml \
	package.json pnpm-lock.yaml sanity.config.ts \
	':!**/*.test.ts' ':!**/*.md' | head -20
exit 1
