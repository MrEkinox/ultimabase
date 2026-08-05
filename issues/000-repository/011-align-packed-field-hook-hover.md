# 011: Align the packed field-hook hover contract

- Status: ready
- Milestone: 0
- Packages: `@ultimabase/core`, tooling
- Depends on: 009
- ADR: none

## Goal

Restore agreement between the native field-hook fixture and the hover asserted
against the built `@ultimabase/core` declarations.

## Observed failure

`yarn test:pack:built` fails in
`tests/e2e/core-native-field-hooks.e2e.test.ts`. The test expects
`NonDefaultedStringField<false, true, false, false>`, while the fixture declares
a non-list string field and the emitted hover reports
`NonDefaultedStringField<false, false, false, false>`.

## Acceptance criteria

- [ ] Confirm whether the fixture is intended to exercise a scalar or list field.
- [ ] Align the fixture and source plus packed hover assertions with that intended field state.
- [ ] Preserve exact hook input inference and keep callback implementation details out of hovers.
- [ ] `yarn test:pack:built` passes without weakening the declaration assertions.

## Tests

- [ ] Source language-service coverage passes for the chosen field state.
- [ ] Packed declaration language-service coverage passes after a clean build.

## Out of scope

- Changing field list inference solely to match the stale assertion.
- Changing the unified update-data contract.
