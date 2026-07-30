# 303: Add and, or, and not filters

- Status: planned
- Milestone: 3
- Packages: `@ultimabase/query`
- Depends on: 302
- ADR: ADR-0004

## Goal

Compose nested filter nodes deterministically.

## Acceptance criteria

- [ ] Empty logical groups have defined behavior.
- [ ] Normalization flattens safe redundant nesting.
- [ ] Input queries are never mutated.

## Tests

- [ ] Nested normalization and immutability tests.
