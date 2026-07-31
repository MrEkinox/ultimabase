# 109: Implement schema default-value contracts

- Status: completed
- Milestone: 1
- Packages: `@ultimabase/schema`
- Depends on: 104, 105, 106, 107, 108
- ADR: ADR-0014, ADR-0038

## Goal

Represent static values and runtime factories without conflation.

## Acceptance criteria

- [x] Default values match inferred field types.
- [x] Factory outputs are checked.
- [x] Metadata distinguishes static values from runtime factories.

## Tests

- [x] Invalid default types fail compilation.
