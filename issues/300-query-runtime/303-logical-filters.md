# 303: Add and, or, and not filters

- Status: completed
- Milestone: 3
- Packages: `@ultimabase/query`
- Depends on: 302
- ADR: ADR-0004, ADR-0054

## Goal

Compose nested filter nodes deterministically.

## Acceptance criteria

- [x] Empty logical groups have defined behavior.
- [x] Normalization flattens safe redundant nesting.
- [x] Input queries are never mutated.

## Tests

- [x] Nested normalization and immutability tests.
