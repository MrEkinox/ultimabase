# UltimaBase agent guide

The contract for every coding agent and contributor.

## Current phase

UltimaBase restarts from a clean base. Until [docs/decisions.md](docs/decisions.md)
is agreed with the maintainer, no product code is written: discuss, then record
each decision there.

The previous implementation is reference material, never a contract. Read it
from the `codex-archive` tag (`git worktree add ../ultimadatabase-old codex-archive`);
reuse an idea, a test or a known pitfall only when a decision calls for it.

## Working

1. Inspect Git status and preserve unrelated changes. Never push, publish or
   change GitHub state without explicit confirmation.
2. Work on a focused branch; isolate parallel work in its own `git worktree`.
3. Implement only what a recorded decision, a failing test or the maintainer
   asks for. No speculative APIs, options, packages or infrastructure.
4. Stop and ask before a choice that is not covered by a recorded decision.

## Code quality

- No `any` in any form. Validate `unknown` at untrusted boundaries.
- Files stay under 400 lines; size budgets per package come with the first
  package.
- Every bug fix gets a regression test.

## Validation

`yarn validate` (format, types, lint, tests) must pass before a merge into
`main`. Report any check that failed or was not run.
