# 5401: Consolidate plugin lifecycle cleanup

- Status: completed
- Milestone: 54
- Package: `@ultimabase/core`
- Depends on: 3006
- ADR: ADR-0049, ADR-0190, ADR-0207, ADR-0258

## Goal

Make normal disposal and failed setup/start rollback share one private resource
release sequence without changing deterministic teardown or error behavior.

## Acceptance criteria

- [x] One private sequence owns active-plugin stop, initialized-plugin disposal,
      application-capability disposal, and the terminal disposed state.
- [x] Normal disposal waits for an existing stop promise while failure rollback
      cleans directly without waiting on a promise that may depend on startup.
- [x] Reverse dependency order and exact plugin-owner attribution remain unchanged.
- [x] Original and cleanup failures retain their existing ordering and messages.
- [x] Repeated and concurrent setup, start, stop, and dispose remain idempotent.
- [x] No public export, phase, callback, behavior, or recovery path changes.
- [x] Production TypeScript removes more lines than it adds.
- [x] Focused and repository-wide validation pass.
- [x] Documentation impact is recorded.

## Out of scope

- Changing lifecycle states, ordering, ownership, or application-slot release.
- Changing capability materialization or disposal internals.
- Adding retry, force-reset, hot reload, or replacement behavior.

## Documentation impact

Internal engineering documentation. The milestone, issue, invariants, and line
audit are recorded here and in `CURRENT_PLAN.md`. No package README, public
website page, or ADR changes because the public lifecycle, ordering, errors,
plugin authoring contract, and application ownership semantics remain unchanged.

## Outcome

`#releaseResources()` now owns active-plugin stop, initialized-plugin and
owner-capability disposal, application-capability disposal, error collection,
and the terminal `disposed` state. Normal disposal passes an existing stop
promise when present; failed setup or startup deliberately does not, so a
concurrent `stop()` that awaits the failing startup cannot form a promise cycle.

The same change removes the one-use reverse and disposed helpers, avoids
redundant promise assignment, and lets the failure collector accept the
existing synchronous or PromiseLike lifecycle callback contract directly.
Reverse graph order, exact plugin-owner attribution, and every error message
and aggregation order remain unchanged.

## Quantitative audit

Production TypeScript adds 42 lines and removes 58, a net reduction of 16.
`lifecycle-manager.ts` falls from 403 to 387 lines and no longer emits a
file-budget warning. No tests, public declarations, or generated files change;
the existing concurrency, rollback, ordering, attribution, idempotency, and
error-aggregation suite directly covers the consolidated path.

## Validation

- Focused lifecycle validation: 3 files, 26 tests
- `yarn workspace @ultimabase/core test`: 266 files, 1,354 tests
- `yarn typecheck`
- `yarn test`: 545 files, 2,582 tests, no type errors
- `yarn lint`: 0 errors; 49 Core, 26 package, and 2 workspace pre-existing
  file-budget warnings
- `yarn build`: every package passed build, API checks, and package linting
