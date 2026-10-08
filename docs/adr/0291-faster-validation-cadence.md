# ADR-0291: Run each suite once and validate fully before merging

- Status: accepted
- Date: 2026-10-08
- Refines: ADR-0275
- Approval: the user delegated this decision on 2026-10-08

## Context

`yarn validate:full` took about 18 minutes (1,085 s on the reference
machine): `yarn test` ran unit, type and performance suites (315 s), then
`test:coverage` ran the same unit and type suites again with V8 coverage plus
the E2E projects (492 s). Performance budgets also ran under coverage, where
instrumentation distorts their timings; the Typegen `hybrid-authoring` budget
failed twice that way and passed alone. GitHub CI already excludes them from
coverage. ADR-0275 also required the full gate before every debt-reduction
commit, which made multi-step work wait for the slowest command after each
checkpoint.

## Decision

- `yarn validate:full` runs every suite once: format, typecheck, lint, build,
  performance budgets without instrumentation, then complete coverage
  (unit, type, E2E and PostgreSQL E2E projects) excluding performance files,
  dependency constraints and public documentation. It checks exactly what it
  checked before.
- `yarn validate:affected` runs the GitHub affected plan locally
  (`tooling/ci/local.ts`): the same planner and commands, scoped to the
  changes since the merge base with `main`, uncommitted files included. When
  shared inputs change, the plan is complete and it runs `yarn validate:full`.
- Cadence: focused tests and `yarn validate:affected` gate intermediate
  commits; `yarn validate:full` gates every merge into `main`; GitHub CI
  remains the final check.

## Consequences

Nothing reaches `main` without the complete gate. A failure found only by the
complete gate is fixed on the branch before merging. `yarn validate` keeps its
ordinary contract for quick local runs.
