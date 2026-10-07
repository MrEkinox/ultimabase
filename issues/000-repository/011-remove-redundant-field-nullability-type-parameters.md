# 011: Remove redundant field nullability type parameters

- Status: completed
- Milestone: 0
- Packages: `@ultimabase/core`, tooling
- Depends on: 009
- ADR: ADR-0133

## Goal

Remove the obsolete `TNullable` parameter from compact field aliases and restore
agreement between source and packed field-hook hovers.

## Observed failure

ADR-0133 derives persisted nullability from required presence. The compact field
types still expose the former `TNullable` boolean even though
`ScalarFieldInferenceState` ignores it. Source coverage therefore expects
`NonDefaultedStringField<false, false, false, false>`, while packed coverage
expects the semantically derived nullable state as
`NonDefaultedStringField<false, true, false, false>`.

The disagreement is not a scalar-versus-list mismatch: the second boolean is
the obsolete nullability parameter. Keeping it makes public hovers misleading
and duplicates a fact already derived from `TRequired`.

## Acceptance criteria

- [x] Remove `TNullable` from shared scalar inference helpers and every built-in field facade.
- [x] Keep `TRequired` as the single source for persisted nullability and create presence.
- [x] Align source and packed hover assertions with the compact parameter list.
- [x] Preserve exact hook input inference and keep callback implementation details out of hovers.
- [x] `yarn test:pack:built` passes without weakening the declaration assertions.

## Tests

- [x] Source language-service coverage passes for the chosen field state.
- [x] Packed declaration language-service coverage passes after a clean build.

## Out of scope

- Changing field list or required-presence inference.
- Changing the unified update-data contract.
