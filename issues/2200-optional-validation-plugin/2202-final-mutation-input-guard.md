# 2202: Add a final mutation-input guard boundary

- Status: ready
- Milestone: 22
- Packages: `@ultimabase/core`, `@ultimabase/plugin-kit`
- Depends on: 2201
- ADR: ADR-0223

## Goal

Add one generic, rejection-only Runtime behavior stage after final Core
structural mutation validation and before value-dependent enforcement so an
optional plugin can validate the final mutation candidate without replacing it.

## Acceptance criteria

- [ ] `RuntimeBehaviorStages` exposes one mutation-only guard receiving the
      final structurally validated operation plus stable singular or explicitly
      prepared bulk targets.
- [ ] The guard returns no replacement value and therefore can only continue or
      reject execution.
- [ ] Providers compose sequentially in deterministic plugin graph order with
      application-local callback attribution and normal cancellation checks.
- [ ] The stage runs after every input transformer and Core's final structural
      revalidation, but before enforcement reevaluation, before observers, and
      before persistence.
- [ ] Master authority does not skip the stage.
- [ ] No provider means no composed callback, placeholder dispatcher, or
      validation-specific Runtime allocation.
- [ ] Existing `beforeOperation`, prepared-target observers, Hooks, Access,
      protected constraints, transactions, and Runtime replacement semantics
      remain unchanged.
- [ ] The Runtime behavior capability version and every affected public contract
      are updated deliberately; no legacy protocol remains in parallel.
- [ ] The boundary uses existing `runtime:intercept` privilege enforcement and
      introduces no concrete validator, field option, or validation-provider
      capability in Core.
- [ ] Public exports and English JSDoc describe the ordering and rejection-only
      invariant.

## Tests

- [ ] Runtime tests prove exact order around structural validation, transformed
      input, enforcement reevaluation, observers, and persistence.
- [ ] Composition tests prove zero, one, and multiple providers, deterministic
      ordering, errors, cancellation, and per-application isolation.
- [ ] Type tests prove the operation and prepared-target input shapes and reject
      an operation-transforming handler.
- [ ] Capability, privilege, Runtime replacement, packed-package, and JavaScript
      tests cover the updated public protocol.

## Out of scope

- Moving Standard Schema code or the `validation` option.
- Adding a generic lifecycle-hook alias or public target-loading toggle.
- Allowing validators to transform logical operations.
