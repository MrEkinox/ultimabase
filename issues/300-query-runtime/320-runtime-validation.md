# 320: Execute normalization and validation

- Status: completed
- Milestone: 3
- Packages: `@ultimabase/runtime`, `@ultimabase/schema`
- Depends on: 115, 307, 312
- ADR: ADR-0004, ADR-0038, ADR-0039

## Goal

Apply schema validation plans before access checks and hooks.

## Acceptance criteria

- [x] Create, update, bulk, and upsert inputs use the correct plan.
- [x] Defaults are applied without mutating caller input.
- [x] Scalar constraints and defaults are read from each plan's declared field.
- [x] `autoNow` fields share the operation clock and application timezone.
- [x] Scalar leaves pass through Schema's public `snapshotScalarFieldValue` boundary.
- [x] Runtime default factories execute once per created object.
- [x] Database defaults remain owned by the database adapter.
- [x] Master does not bypass validation by default.
- [x] Validation errors contain field paths.

## Tests

- [x] Runtime and bulk validation matrices.
