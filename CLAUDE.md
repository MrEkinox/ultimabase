# Claude Code guide

@AGENTS.md

The imported [AGENTS.md](AGENTS.md) is the project contract and wins over
anything below. This file only adds how to work with Claude Code here, from
what worked (and what went wrong) during the package-by-package rebuild.

## Working agreement

- Answer the user in French; write code, comments, commits and repository
  documentation in English (except handoffs under `docs/handoff/`, which are
  French).
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
- `main` of `MrEkinox/ultimadatabase` holds the rebuilt implementation and is
  never rewritten without explicit confirmation. Work happens on branches
  merged into `main` after review.
- The tags `reference-archive` and `rebuild-archive` hold the archived history;
  pushing or moving them requires confirmation like any other push.

## Long tasks

- Keep a handoff file current under `docs/handoff/` (scope, state, decisions,
  next verifiable action) and commit checkpoints often, so work survives
  context compaction or an interrupted session. Resume by verifying the
  handoff against the tree.
- Sub-agents work in isolated worktrees (`git worktree add ../<name> -b <branch>`,
  then `YARN_CACHE_FOLDER=<repo>/.yarn/cache yarn install --immutable`),
  at most 3 or 4 at once: more saturates the machine and turns load-sensitive
  tests into false failures. Each agent commits checkpoints and reports files
  touched outside its scope, casts added and tests edited; the coordinator
  reviews the diff before merging with `--no-ff`.
- Multi-agent workflows are expensive: run one only when the user asks for it.

## Checks the test suites do not cover

Tests passing is necessary, not sufficient. During the rebuild these caught
regressions that every suite missed:

- `node tooling/dx-audit/run.mjs <baseline-root> .` compares hovers,
  completions and diagnostics with a built baseline (a worktree of `main`);
  renaming or inlining a private type alias can change editor text with every
  test green.
- `yarn vitest run --project website-content`: website pages list source files
  in their `sources` frontmatter, so deleting or renaming a module breaks it.
- For a behavior-preserving change, `git diff -U0 <base> -- '*.test.ts' '*.test-d.ts'`
  must show only import-specifier changes; never edit a test body to make it
  pass.
- Copies of user-controlled keys use `Object.fromEntries` or `Map`, never
  `object[key] = value` (several reference defects came from `__proto__` keys).
- `yarn install --immutable`: `validate:full` does not check that `yarn.lock` matches the manifests, and CI fails when it does not.
- `yarn website:test` (browser and accessibility suite) when a change touches `apps/website`: `validate:full` does not run it, and CI does.

## Known load-sensitive tests

Validate on a calm machine before concluding anything from these failures:
`create-app-packed` (120 s timeout), `core-archive-declarations` (10 s),
and postgres-e2e cascades after a timeout ([load-sensitive suites](tests/README.md#load-sensitive-suites)). In GitHub CI the
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
