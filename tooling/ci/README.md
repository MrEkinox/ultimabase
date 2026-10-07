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
  guards once, even when no package build or complete coverage is selected.
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

Run the guards with `yarn vitest run --project unit tooling/ci`.
For a local read-only simulation, set `CI_BASE_SHA` to a full commit SHA and
`CI_CHANGED_FILES` to the action's JSON array of changed paths, then run
`node tooling/ci/plan.ts`. Yarn also observes uncommitted changes, so use a clean
checkout for an exact simulation. `node tooling/ci/plan.ts --full` shows every check.
On GitHub, **Run workflow** requests complete validation including global coverage.

The complete coverage job sets `ULTIMABASE_COVERAGE_WORKERS=2`. The root Yarn
script expands this into the CLI worker bound, defaulting to four locally.
Performance projects retain their one-worker limit and Vitest's isolated serial
scheduling. Do not replace this with `VITEST_MAX_WORKERS`: Vitest applies that
native override after resolving `fileParallelism: false`, allowing benchmarks
to compete with other suites. The discovery regression resolves the real Yarn
command and Vitest projects for both environments without executing their tests.

Use `yarn validate` for the ordinary local format, type, test, lint, and build
contract. Use `yarn validate:full` before completing a debt reduction or
behavior-preserving refactor; it extends that contract with complete coverage,
issue metadata, dependency constraints, and public-documentation validation.

See [ADR-0251](../../docs/adr/0251-affected-github-validation.md) for fallback and
coverage semantics. A partial run intentionally does not report global coverage.
