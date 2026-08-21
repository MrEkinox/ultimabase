# 307: Define terminal Operation AST

- Status: completed
- Milestone: 3
- Packages: `@ultimabase/query`
- Depends on: 301, 302, 303
- ADR: ADR-0004, ADR-0059

## Goal

Represent reads, creates, updates, upserts, deletes, counts, and existence checks.

## Acceptance criteria

- [x] Singular and bulk operations are distinct.
- [x] Operation options cannot create master authority.
- [x] Update expressions are separated from input objects.

## Tests

- [x] Exhaustive operation matching tests.
