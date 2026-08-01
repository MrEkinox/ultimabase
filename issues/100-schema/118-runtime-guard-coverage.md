# 118: Complete Schema runtime guard coverage

- Status: done
- Milestone: 1
- Packages: `@ultimabase/schema`
- Depends on: 114, 116, 117

## Goal

Exercise the defensive runtime boundaries used when JavaScript or dynamically
forged metadata bypasses the public TypeScript contracts.

## Acceptance criteria

- [x] Invalid list depth metadata is rejected by declaration and plan
      compilation boundaries.
- [x] Unsupported, circular, invalid-Date, and non-plain object defaults are
      rejected.
- [x] Malformed nested object definitions are rejected.
- [x] Invalid field-level index metadata is rejected.
- [x] `schema/src` reaches 100% statements, branches, functions, and lines.

## Tests

- [x] Regression tests cover every previously unexecuted runtime guard.
