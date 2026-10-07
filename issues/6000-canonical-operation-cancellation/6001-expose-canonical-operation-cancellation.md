# 6001: Expose canonical operation cancellation

- Status: completed
- Milestone: 60
- Packages: `@ultimabase/core`, `@ultimabase/hooks-plugin`
- Depends on: none
- ADR: ADR-0274

## Goal

Expose Core's existing cooperative cancellation check as the one canonical
package-root helper and remove Hooks' exact implementation copy.

## Acceptance criteria

- [x] `@ultimabase/core` exports one documented
      `throwIfOperationCancelled(signal, internalDetails?)` helper.
- [x] The helper remains a no-op for an active signal and throws the exact
      existing `OPERATION_CANCELLED` failure for an aborted signal.
- [x] Timeout and request-abort reasons remain normalized without copying an
      environment-owned abort reason into diagnostics.
- [x] Hooks imports the Core helper and keeps its existing cancellation timing,
      errors, diagnostics, and transaction behavior.
- [x] No duplicate cancellation implementation or compatibility alias remains.
- [x] Production TypeScript removes more lines than it adds.
- [x] Runtime, type, package-export, and repository-wide validation pass.
- [x] Documentation impact is recorded.

## Tests

- [x] Focused Core tests cover active, aborted, timeout, and diagnostic-detail
      behavior through the public export.
- [x] Compile-time coverage protects the public signature.
- [x] Existing Hooks cancellation tests pass against the Core implementation.

## Out of scope

- Detaching work with `Promise.race` or forcibly terminating JavaScript.
- Changing cancellation checkpoints, adapter interruption, or transaction
  semantics.
- Adding another cancellation error code or exposing raw abort reasons.

## Documentation impact

Both. ADR-0274 records the public boundary and its deliberate limits; the Core
and Hooks package READMEs plus the website error, plugin-authoring, and Hooks
pages document the canonical package-root helper and its cooperative semantics.

## Outcome

`@ultimabase/core` now exports `throwIfOperationCancelled` from its package
root. Core remains the sole implementation owner, and Hooks consumes that
helper directly instead of maintaining its exact 29-line copy. The helper keeps
the existing active-signal no-op, normalized timeout/request reasons, safe
diagnostic merge, and `OPERATION_CANCELLED` error contract.

Production TypeScript adds 13 lines and removes 31, a net reduction of 18.
Tests add 79 lines without removing coverage: runtime behavior, the exact public
signature, the package-root export, and the explicit export inventory are all
protected.

## Validation

- focused Core and Hooks validation: 3 files, 16 tests, no type errors
- `yarn workspace @ultimabase/core test`: 267 files, 1,360 tests
- `yarn workspace @ultimabase/hooks-plugin test`: 20 files, 83 tests
- compiled package-root export E2E: 1 file, 2 tests
- `yarn website:validate`: 17 files, 66 tests
- `yarn constraints`
- `yarn check:issues`
- `yarn typecheck`
- `yarn test`: 546 files, 2,588 tests, no type errors
- `yarn lint`: 0 errors; 76 pre-existing file-budget warnings reported
- `yarn build`: every package passed build, API checks, and package linting
- `yarn test:coverage`: 621 files, 2,835 tests, no type errors, 433.38 seconds
- coverage: 90.92% statements, 84.45% branches, 96.07% functions, 91.48% lines
