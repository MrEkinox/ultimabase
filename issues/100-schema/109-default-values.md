# 109: Implement schema default-value contracts

- Status: planned
- Milestone: 1
- Packages: `@ultimabase/schema`
- Depends on: 104, 105, 106, 107, 108
- ADR: ADR-0014

## Goal

Represent static values, runtime factories, and future database defaults without conflation.

## Acceptance criteria

- [ ] Default values match inferred field types.
- [ ] Factory outputs are checked.
- [ ] Metadata identifies runtime versus database-compilable defaults.

## Tests

- [ ] Invalid default types fail compilation.
