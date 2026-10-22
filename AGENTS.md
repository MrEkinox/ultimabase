# UltimaBase agent guide

The contract for every coding agent and contributor.

## Decisions

[docs/decisions.md](docs/decisions.md) is agreed and binding; record a new
decision there before building on a choice it does not cover.
[docs/roadmap.md](docs/roadmap.md) tracks the current phase.

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

Tick a roadmap item in the commit that completes it.

## Code quality

- No `any` in any form. Validate `unknown` at untrusted boundaries.
- Production code files stay under 400 lines (Oxlint `max-lines`); tests and
  documentation are exempt.
- Each package has a line budget for its production code in
  `line-budgets.json`, checked by `yarn budgets` (D-69). A new package gets its
  budget in the commit that creates it; a budget changes only in a commit that
  says why.
- Every bug fix gets a regression test.
- Each package covers at least 90 % of its production code on lines,
  statements, functions and branches, checked by `yarn test` (D-85). No
  coverage-ignore comments.

## Validation

`yarn validate` (format, types, lint, budgets, tests) must pass before a merge
into `main` and must stay under one minute (D-06). Tests that need PostgreSQL
are named `*.postgres.test.ts` and run with `yarn test:postgres`, outside
`yarn validate`. Report any check that failed or was not run.

Rules live in tools (types, lint, CI checks) rather than in documents: to
understand a change, read this file and the package it touches, nothing else.
