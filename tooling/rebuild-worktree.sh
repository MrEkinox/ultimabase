#!/bin/sh
# Creates an isolated rebuild worktree with dependencies installed.
# Usage: tooling/rebuild-worktree.sh <name> [base-ref]
#   -> ../claude-ultimabase-worktrees/<name> on branch rebuild/<name>
# If branch rebuild/<name> already exists (e.g. an interrupted WIP), it is reused.
set -e
REPO=$(cd "$(dirname "$0")/.." && pwd)
WT_ROOT="$REPO/../claude-ultimabase-worktrees"
mkdir -p "$WT_ROOT"
cd "$REPO"
if git show-ref --verify --quiet "refs/heads/rebuild/$1"; then
	git worktree add -q "$WT_ROOT/$1" "rebuild/$1"
else
	git worktree add -q "$WT_ROOT/$1" -b "rebuild/$1" "${2:-main}"
fi
cd "$WT_ROOT/$1"
YARN_CACHE_FOLDER="$REPO/.yarn/cache" yarn install --immutable > "$WT_ROOT/$1.install.log" 2>&1
echo "worktree $WT_ROOT/$1 ready (run yarn build before tests)"
