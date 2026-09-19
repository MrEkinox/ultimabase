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
- Tests cover diff boundaries, missing history, deleted suites, reverse
  dependencies, fixture chains, command routing, and full Vitest discovery parity.

Run the guards with `yarn vitest run --project unit tooling/ci`.
For a local read-only simulation, set `CI_BASE_SHA` to a full commit SHA and
`CI_CHANGED_FILES` to the action's JSON array of changed paths, then run
`node tooling/ci/plan.ts`. Yarn also observes uncommitted changes, so use a clean
checkout for an exact simulation. `node tooling/ci/plan.ts --full` shows every check.
On GitHub, **Run workflow** requests complete validation including global coverage.

See [ADR-0251](../../docs/adr/0251-affected-github-validation.md) for fallback and
coverage semantics. A partial run intentionally does not report global coverage.
