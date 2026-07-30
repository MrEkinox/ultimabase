# 301: Define Query AST

- Status: planned
- Milestone: 3
- Packages: `@ultimabase/query`
- Depends on: 112
- ADR: ADR-0004

## Goal

Represent schema, selection, where, ordering, and pagination without execution details.

## Acceptance criteria

- [ ] Nodes are immutable discriminated unions.
- [ ] AST contains no transport or SQL values.
- [ ] Schema and field names are typed where constructed from classes.

## Tests

- [ ] Exhaustive-node compile-time tests.
