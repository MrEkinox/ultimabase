# 308: Add atomic update operators

- Status: planned
- Milestone: 3
- Packages: `@ultimabase/query`
- Depends on: 307
- ADR: ADR-0004

## Goal

Add typed `set`, `unset`, `increment`, and `decrement` expressions.

## Acceptance criteria

- [ ] Operators are restricted by field kind and mutability.
- [ ] System fields cannot be updated.
- [ ] Conflicting operations on one field fail normalization.

## Tests

- [ ] Positive and negative type tests.
