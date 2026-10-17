# GitHub check selection

These scripts are internal to `.github/workflows/ci.yml`; they do not filter
ordinary local Yarn commands.

- `dorny/paths-filter` supplies changed paths; Yarn's `workspaces list --since`
  with `--recursive` supplies affected packages and their transitive dependants.
- `plan.ts` adapts these standard outputs and publishes job outputs and a workflow
  summary. It does not implement Git diff detection or a dependency graph.
- `selection.ts` adds documentation, shared-input fallbacks, and individual
  integration consumers. Explicit dynamic consumers cover archive enumeration and
  generated applications. Keep additional computed fixture dependencies here.
- `run.ts` validates the plan and invokes the selected formatting, documentation,
  lint, type, and runtime commands with argument arrays rather than shell strings.
  Documentation-only runs include architecture routing and checkpoint/backlog
  guards once, even when no package build is selected. An affected package's
  job runs all its suites and enforces its own coverage thresholds; a package
  selected only as a consumer runs its selected suites without coverage
  ([package coverage](../../tests/README.md#package-coverage)).
  Complete selection invokes the same repository-wide `yarn format:check` gate
  as local validation; affected selection retains the narrower changed-file check.
- Every package must re-export `tooling/vitest/package.config.ts` from its local
  `vitest.config.ts`; otherwise package-root type tests inherit incompatible root globs.
  The real Vitest inventory check compares every package with root discovery.
- Root `tsconfig.json` references every package so `yarn typecheck` emits its
  declarations before checking repository-wide tests on a clean checkout. The
  compiler inventory regression checks this independently of existing `dist`.
- Tests cover diff boundaries, missing history, deleted suites, reverse
  dependencies, fixture chains, command routing, and full Vitest discovery parity.

- `typescript-7.ts` type-checks packages, tests, examples and the `Register`
  cycle cases with the pinned TypeScript 7 compiler for the `TypeScript 7` job,
  scheduled with the build ([test guide](../../tests/README.md#typescript-7)).

Run the guards with `yarn vitest run --project unit tooling/ci`.
For a local read-only simulation, set `CI_BASE_SHA` to a full commit SHA and
`CI_CHANGED_FILES` to the action's JSON array of changed paths, then run
`node tooling/ci/plan.ts`. Yarn also observes uncommitted changes, so use a clean
checkout for an exact simulation. `node tooling/ci/plan.ts --full` shows every check.
On GitHub, **Run workflow** requests complete validation: every package job
measures its coverage. Selected packages run in at most five jobs
(`groupPackages`), heaviest first into the lightest job: each job pays about a
minute of setup and GitHub bills every job by the started minute. A job checks
all its packages and fails once, naming every package that failed.

Use `yarn validate` for the ordinary local format, type, test, lint, and build
contract. `yarn validate:affected` (`local.ts`) runs this planner and `run.ts`
locally for the changes since the merge base with `main`, including uncommitted
files. `yarn validate:package <name...>` (`package.ts`) runs one package's job
with all its suites. `yarn validate:full` is the complete gate before merging into `main`
([ADR-0291](../../docs/adr/0291-faster-validation-cadence.md)).

See [ADR-0251](../../docs/adr/0251-affected-github-validation.md) for fallback
semantics and the [ADR-0342 amendment](../../docs/adr/0342-local-gate-without-coverage.md#amendment-2026-10-17-coverage-per-package)
for package coverage.
