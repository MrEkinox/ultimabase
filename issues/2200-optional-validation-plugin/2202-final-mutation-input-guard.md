# 2202: Add a final mutation-input guard boundary

- Status: completed
- Milestone: 22
- Packages: `@ultimabase/core`, Runtime documentation
- Depends on: 2201
- ADR: ADR-0223

## Goal

Add one generic, rejection-only Runtime behavior stage after final Core
structural mutation validation and before value-dependent enforcement so an
optional plugin can validate the final mutation candidate without replacing it.

## Acceptance criteria

- [x] `RuntimeBehaviorStages` exposes one mutation-only guard receiving the
      final structurally validated operation plus stable singular or explicitly
      prepared bulk targets.
- [x] The guard returns no replacement value and therefore can only continue or
      reject execution.
- [x] Providers compose sequentially in deterministic plugin graph order with
      application-local callback attribution and normal cancellation checks.
- [x] The stage runs after every input transformer and Core's final structural
      revalidation, but before enforcement reevaluation, before observers, and
      before persistence.
- [x] Master authority does not skip the stage.
- [x] No provider means no composed callback, placeholder dispatcher, or
      validation-specific Runtime allocation.
- [x] Existing `beforeOperation`, prepared-target observers, Hooks, Access,
      protected constraints, transactions, and Runtime replacement semantics
      remain unchanged.
- [x] The Runtime behavior capability version and every affected public contract
      are updated deliberately; no legacy protocol remains in parallel.
- [x] The boundary uses existing `runtime:intercept` privilege enforcement and
      introduces no concrete validator, field option, or validation-provider
      capability in Core.
- [x] Public exports and English JSDoc describe the ordering and rejection-only
      invariant.

## Tests

- [x] Runtime tests prove exact order around structural validation, transformed
      input, enforcement reevaluation, observers, and persistence.
- [x] Composition tests prove zero, one, and multiple providers, deterministic
      ordering, errors, cancellation, and per-application isolation.
- [x] Type tests prove the operation and prepared-target input shapes and reject
      an operation-transforming handler.
- [x] Capability, privilege, Runtime replacement, packed-package, and JavaScript
      tests cover the updated public protocol.

## Completion evidence

- The Runtime behavior capability now exposes the rejection-only
  `guardMutationInput` stage at version `3.0.0` with deterministic sequential
  composition, callback attribution, cancellation, and application-local
  materialization.
- Focused Core tests passed: 4 files and 21 tests, including public type checks.
- The full test suite passed: 344 files and 1,734 tests.
- The focused public JavaScript and TypeScript language-service E2E suite passed:
  1 file and 2 tests.
- `yarn constraints`, `yarn check:issues`, `yarn typecheck`, `yarn lint`,
  `yarn format:check`, and `yarn build` passed. Lint reported only reviewed
  repository line-budget warnings and no errors.

## Out of scope

- Moving Standard Schema code or the `validation` option.
- Adding a generic lifecycle-hook alias or public target-loading toggle.
- Allowing validators to transform logical operations.
