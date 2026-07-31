# 308: Add atomic update operators

- Status: done
- Milestone: 3
- Packages: `@ultimabase/query`
- Depends on: 307
- ADR: ADR-0004, ADR-0060

## Goal

Add typed `set`, `unset`, `increment`, and `decrement` expressions.

## Acceptance criteria

- [x] Operators are restricted by field kind and mutability.
- [x] System fields cannot be updated.
- [x] Conflicting operations on one field fail normalization.

## Tests

- [x] Positive and negative type tests.
