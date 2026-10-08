# Claude Code guide

@AGENTS.md

The imported [AGENTS.md](AGENTS.md) is the project contract and wins over
anything below. This file only adds how to work with Claude Code here, from
what worked (and what went wrong) during the rebuild recorded in
[docs/rebuild/HANDOFF.md](docs/rebuild/HANDOFF.md).

## Working agreement

- Answer the user in French; write code, comments, commits and repository
  documentation in English (except `docs/rebuild/HANDOFF.md`, which is French).
- Start every task by stating a verifiable "done" criterion (commands that must
  pass, files that must not change). If the request has none, propose one.
- Prove, do not assert: quote the command and its result for every claim of
  success. A check that was not run is reported as not run, never as passed.
- Interruptions are welcome. A user message during long work is answered
  first, then the work resumes.

## Authorizations

- Pushing, publishing, opening or merging pull requests, changing GitHub
  settings, force-pushing and deleting branches require explicit user
  confirmation every time. No durable authorization exists unless it is
  written in this section.
- The published rebuild lives on branch `rebuild` of
  `MrEkinox/ultimadatabase`; its `main` is the reference and is never
  rewritten without explicit confirmation.

## Long tasks

- Keep a handoff file current (scope, state, decisions, next verifiable
  action) and commit checkpoints often, so work survives context compaction or
  an interrupted session. Resume by verifying the handoff against the tree.
- Sub-agents work in isolated worktrees (`tooling/rebuild-worktree.sh <name>`),
  at most 3 or 4 at once: more saturates the machine and turns load-sensitive
  tests into false failures. Each agent commits checkpoints and reports files
  touched outside its scope, casts added and tests edited; the coordinator
  reviews the diff before merging with `--no-ff`.
- Multi-agent workflows are expensive: run one only when the user asks for it.

## Checks the test suites do not cover

Tests passing is necessary, not sufficient. During the rebuild these caught
regressions that every suite missed:

- `node tooling/rebuild/dx-audit.mjs <reference-root> .` compares hovers,
  completions and diagnostics with a built reference; renaming or inlining a
  private type alias can change editor text with every test green.
- `yarn vitest run --project website-content`: website pages list source files
  in their `sources` frontmatter, so deleting or renaming a module breaks it.
- `git diff -U0 <base> -- '*.test.ts' '*.test-d.ts'` must show only
  import-specifier changes; never edit a test body.
- Copies of user-controlled keys use `Object.fromEntries` or `Map`, never
  `object[key] = value` (several reference defects came from `__proto__` keys).

## Known load-sensitive tests

Validate on a calm machine before concluding anything from these failures:
`create-app-packed` (120 s timeout), `core-archive-declarations` (10 s),
the Typegen `hybrid-authoring` performance budget, and postgres-e2e cascades
after a 5 s timeout. `Schema … has not been compiled by an application` in
postgres-e2e is a pre-existing Vitest module-runner race, also present in the
reference ([VALIDATIONS.md](docs/rebuild/VALIDATIONS.md)). In GitHub CI the
`Complete coverage` job excludes performance suites, which run uninstrumented
in the package and transversal jobs instead.

## Project hook

`.claude/settings.json` runs Prettier on every file Claude writes or edits
inside the repository (silently, never failing the edit). Formatting is still
verified by `yarn format:check`.

## Useful commands

- `/code-review` reviews the current diff for bugs; `/simplify` cleans up
  reuse and duplication in changed code; `/security-review` reviews the branch.
- Plan mode proposes an approach before any edit, for changes worth agreeing
  on first.
