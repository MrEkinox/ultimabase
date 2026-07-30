# 114: Add table naming, indexes, and constraints

- Status: planned
- Milestone: 1
- Packages: `@ultimabase/schema`
- Depends on: 110
- ADR: ADR-0014

## Goal

Represent plural snake-case table naming, overrides, indexes, unique indexes, and declarative constraints.

## Acceptance criteria

- [ ] `BlogPost` maps deterministically to `blog_posts`.
- [ ] Explicit table names are validated.
- [ ] Composite index field names are schema-checked.
- [ ] No SQL appears in the contract.

## Tests

- [ ] Naming edge cases and invalid index fields are covered.
