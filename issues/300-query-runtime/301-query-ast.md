# 301: Define Query AST

- Status: completed
- Milestone: 3
- Packages: `@ultimabase/query`
- Depends on: 112
- ADR: ADR-0004, ADR-0052

## Goal

Represent schema, selection, where, ordering, and pagination without execution details.

## Acceptance criteria

- [x] Nodes are immutable discriminated unions.
- [x] AST contains no transport or SQL values.
- [x] Schema and field names are typed where constructed from classes.

## Tests

- [x] Exhaustive-node compile-time tests.
