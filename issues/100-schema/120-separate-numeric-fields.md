# 120: Separate integer and float fields

- Status: completed
- Milestone: 1
- Packages: `@ultimabase/schema`
- Depends on: 105, 115
- ADR: ADR-0024

## Goal

Replace the mode-based numeric factory with explicit integer and float field
contracts.

## Acceptance criteria

- [x] `intField()` exposes safe-integer ranges and `autoIncrement`.
- [x] `floatField()` exposes finite ranges and `validation.finite`.
- [x] Field kinds and validation plans discriminate `int` from `float`.
- [x] `numberField`, its mode, and its public types are removed.
- [x] Numeric range normalization remains shared internally.
- [x] Decimal values remain outside the JavaScript number contract.

## Tests

- [x] Runtime and type tests independently cover both factories.
- [x] Inference and validation-plan tests use the new field kinds.
- [x] Public exports no longer expose the replaced API.
