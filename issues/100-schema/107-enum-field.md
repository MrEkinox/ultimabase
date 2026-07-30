# 107: Implement enumField

- Status: planned
- Milestone: 1
- Packages: `@ultimabase/schema`
- Depends on: 102
- ADR: ADR-0002

## Goal

Infer a literal union from an immutable list of enum values.

## Acceptance criteria

- [ ] Empty enums are rejected.
- [ ] Duplicate values are rejected.
- [ ] Output and input retain the exact union.

## Tests

- [ ] Runtime validation metadata and compile-time union tests.
