# 307: Define terminal Operation AST

- Status: planned
- Milestone: 3
- Packages: `@ultimabase/query`
- Depends on: 301
- ADR: ADR-0004

## Goal

Represent reads, creates, updates, upserts, deletes, counts, and existence checks.

## Acceptance criteria

- [ ] Singular and bulk operations are distinct.
- [ ] Operation options cannot create master authority.
- [ ] Update expressions are separated from input objects.

## Tests

- [ ] Exhaustive operation matching tests.
