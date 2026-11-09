---
name: audit
description: >
  Audit one UltimaBase package for three things: security holes, code that can
  go, and performance (gains still available, and regressions since the last
  release). An agent writes a read-only report, the main session verifies each
  finding and runs the benchmarks, fixes what is internal, and the user picks
  the fixes that change the public API. Use for
  "audit <package>", "/audit <package>".
---

# Package audit

Three questions, in this order:

1. **Security.** Can a caller read, write or run what its rules refuse? Can a
   request crash, hang or exhaust the server? Does a secret or another user's
   data leak?
2. **Code that can go.** Dead code, the same rule written twice, code the
   kernel or a dependency already does, options and branches nothing uses.
3. **Performance.** What is still slow on a hot path, and above all: did a fix
   since the reference release make something slower?

A finding is a concrete case that fails, leaks, costs or duplicates. Opinions
on style, naming or structure are not findings.

## Rules

- One package at a time. When its report holds no public choice, the next
  package starts at once; when it holds one, the user decides before the
  next starts, while the context is fresh, and the chosen fix is made then.
- A package of more than about 8,000 lines of production code is audited in
  slices of related files, one agent per slice, one after the other.
- Order, by risk: `ultimabase` (the kernel), `postgres`, `realtime` and
  `live`, `auth`, then `http`, `graphql`, `rest`, `files`, `jobs`,
  `password`, then the small ones: `acl`, `roles`, `soft-delete`,
  `maintenance`, `testing`, `create-ultimabase`.
- A recorded decision (`docs/decisions.md`) is never a finding, unless the
  code contradicts it or misses its stated goal. Cite the decision either way.
- What the tools already check is never a finding: formatting, types, lint,
  `any`, file length, line budgets, coverage.
- Every finding gives a concrete case: the input, the caller or the sequence
  of calls, and what goes wrong. Dead code is proved by a grep of the whole
  repository, `examples/` and `website/` included.
- Agents never run benchmarks, never edit the repository and never write
  files: the report comes back as text. The main session runs the benchmarks.
- A verified finding whose fix stays internal, and makes neither security
  nor performance worse, is fixed without asking (`AGENTS.md`, Working,
  point 4). One that changes the public API, what a developer writes or
  sees, waits for the user's choice. A trade-off between security and
  performance goes to the user, with its numbers.
- Every package's fixes go on one audit branch, one commit per fix, so that
  each audit reads the code the previous ones fixed. It becomes one pull
  request at the end, security fixes included: while one application runs
  UltimaBase, a hole waits for it like any other fix. Nothing is pushed and
  no pull request is opened without the user's confirmation.

## 1. Prepare

- State the "done" criterion: a verified report for `<package>`, its
  benchmark compared with the reference, and the user's choice of fixes.
- Advise the model and effort: the agent on Opus at high effort; the main
  session as it is.
- Audit in a checkout of the audit branch, in the scratchpad, never in the
  user's checkout; the agent runs its tests there and edits nothing. The
  first audit creates it:

  ```sh
  git fetch origin
  git worktree add -b audit/packages "$SCRATCHPAD/audit" origin/main
  cd "$SCRATCHPAD/audit" && yarn install --immutable
  ```

- The reference is the last release tag (`git tag --sort=-creatordate`,
  `v*`). List what changed in the package since then:
  `git log --oneline <tag>..origin/main -- packages/<package>`.

## 2. The agent's report

Start one agent (a single heavy agent at a time) with this brief, filled in:

> Audit `packages/<package>` of UltimaBase, read-only, in `<checkout>`. You may
> run its tests (`yarn vitest run packages/<package> --coverage.enabled=false`)
> and write probe tests under `<scratchpad>/probes/`, outside the repository;
> you may not edit the repository, write other files or run benchmarks.
>
> Map first: read `AGENTS.md`, the package's `src/index.ts`, its entry points
> (plugin hooks, routes, commands, functions), its tests, and the decisions it
> cites (`grep -n '^## D-' docs/decisions.md`, then read those entries). Say
> which load you assume: many users and several server processes on one
> PostgreSQL database. Since `<tag>`, these commits touched it: `<log>`.
>
> Look for, in this order:
>
> 1. Security: a rule a transport, a hook, a nested write, a relation, a
>    filter or a live read bypasses; Master reached by a caller who is not;
>    unvalidated `unknown` input; SQL built from input; a token, hash or
>    private field returned or logged; an error that tells what a caller may
>    not know; a request whose size, depth or count has no limit; a write
>    that fails half-done, or ends before the check that should stop it.
> 2. Code that can go: an export, option, branch or file nothing uses (grep
>    the repository, `examples/` and `website/`); the same rule in two places
>    or two packages; code the kernel, the platform or an installed
>    dependency already does. Count the lines that would go.
> 3. Performance: work done per request or per row that could be done once;
>    a query per item; a list or map that only grows; a hot path that
>    allocates, copies or serializes more than it needs; and anything the
>    commits since `<tag>` added to a hot path.
>
> A recorded decision is never a finding unless the code contradicts it or
> misses its goal. What the tools check (types, lint, budgets, coverage) is
> never a finding. Each finding needs a concrete case, and a probe test when
> you can write one.
>
> Report in English, as text, at most 20 findings, numbered, grouped as
> **Must fix**, **Should fix**, **Nice to have**. For each: a title, its
> `file:line`, then **What this is**, **Problem** (the concrete case),
> **Fix**, **If we skip it**, and for performance the cost you expect. End
> with: **Verdict**, **Lean** (lines that could go), **Performance leads**
> (what a benchmark should measure), **Not checked**.

Save the agent's report in the scratchpad as `audit-<package>.md`.

## 3. Verify every finding

The main session checks each finding before the user sees it:

- A bug or a hole: a probe test that fails on `origin/main`. Compare ids or
  values, not counts, so that a probe cannot pass by accident.
- A missing test: mutate the code the test would guard; the suite still
  passing proves the gap.
- Code that can go: the grep, then remove it in a scratch copy and run the
  package's tests and `yarn validate`.
- A performance lead: a measure, as in step 4. Unmeasured, it stays
  "plausible".

Give each finding a verdict: **real** (with its proof), **plausible** (not
proved, say why), or **false positive** (dropped, say why).

## 4. Performance

The main session runs the benchmark that covers the package, on the reference
tag and on `origin/main` (or the fix branch), back to back on the same calm
machine, three times each, and compares the medians:

| Package                           | Benchmark                       |
| --------------------------------- | ------------------------------- |
| `ultimabase`, `postgres`          | `bench/writes`, `bench/compare` |
| `rest`, `graphql`, `http`, `auth` | `bench/http`                    |
| `realtime`, `live`                | `bench/realtime` (chosen cases) |
| types of `ultimabase`             | `bench/typing`                  |

- The reference runs in a checkout of its own, installed there
  (`yarn install --immutable`): `node_modules/ultimabase` must link to its
  own `packages/ultimabase`, or Node finds another one higher up.
- Each bench's `README.md` says how to run it; PostgreSQL is on
  `localhost:54318` unless `BENCH_DATABASE_URL` says otherwise.
- Every run has a hard limit (`perl -e 'alarm shift; exec @ARGV' <s> ...`)
  and, when it runs in the background, a fallback wake-up.
- A difference inside the spread of the three runs is noise, not a finding. A
  slowdown beyond it is a finding: name the commit that caused it
  (`git bisect` on the bench when the log does not tell).
- A package no benchmark covers: say so, and propose a case only when a
  performance lead needs one.

## 5. Sort

Split the real findings in two:

- **Internal:** the fix changes nothing a developer writes or sees, and the
  benchmark shows no slowdown. Fix it now, as in step 7, and choose the best
  fix yourself; a choice no decision covers is recorded as one.
- **Public:** the fix changes an export, a type, an option, a default, a
  route, a shape, an error or documented behaviour, or trades security
  against performance. Keep it for the user, with real before/after code.

A bug fix that brings the code back to what the documentation already says
is internal.

## 6. Report to the user

In French (`CLAUDE.md`), short, the result first:

- the findings, one line each, with their verdict and proof;
- the internal fixes made, with their commits;
- the public choices, each with before/after code and a recommendation;
- the benchmark table: case, reference, now, change;
- the lines that could go, and the fixes not worth doing, with why.

With public choices, wait for the user's answer and make the chosen fixes;
without, start the next package.

## 7. Fix

On the audit branch, for the internal fixes and the public ones the user
chose:

- each bug fix with a regression test that fails without it;
- a new or amended decision before the code it governs;
- the documentation of `website/content/docs/` (never a frozen version);
- a changeset, a line budget moved in the commit that says why;
- `yarn validate` passing, its result quoted;
- the benchmark run again when a fix touches a hot path.

Remove the audit worktree with `git worktree remove` once the pull request
is merged. Tick the roadmap's audit item only when every package is audited.

## Lessons

Add here what each audit teaches: a false positive's cause, a missed finding,
a step that cost more than it found. The skill improves one audit at a time.

- `auth` (2026-11-09, trial in the manner of Ponytail's `/ponytail-audit`): 4
  findings, 0 false positives. A sub-agent cannot write files, and without
  dependencies it cannot run a probe: hence the checkout of step 1 and the
  report as text. A new public export needs a documented example
  (`scripts/docs.test.ts`): weigh that before proposing one.
- `ultimabase`, slices 1 and 2 (2026-11-09): a passing suite does not guard a
  fix. A cache's reset and a value's normalisation in two `memory()` fixes
  survived their mutation until a test was added for each: mutate every line
  a fix adds, and keep the line only if a test then fails.
- `ultimabase`, slice 3 (2026-11-09): `tsc -p .` misses what `yarn typecheck`
  and `yarn lint` catch (isolated declarations, a value of type `any`
  returned): check each fix with those, not with `tsc` alone. A commit message
  or changeset states only what a probe showed: one said that `update` picked
  any row, the probe showed it refused.
- `ultimabase`, benchmark (2026-11-09): the reference checkout had no
  `node_modules`, so its benchmark imported an older `ultimabase` from a
  parent folder and showed gains no commit made. A gain or a loss no commit
  explains is checked before it is reported.
