# 744: Compile and execute PostgreSQL relations

- Status: done
- Milestone: 7+
- Packages: `@ultimabase/postgres`
- Depends on: 739, 743
- ADR: ADR-0078, ADR-0082, ADR-0098, ADR-0118

## Goal

Implement owning join storage, inverse traversal, scoped reads, and atomic
relation mutations behind the portable database adapter.

## Acceptance criteria

- [x] Owning relations compile to deterministic PostgreSQL-owned join tables with source and target foreign keys.
- [x] Join storage enforces composite uniqueness and indexes both traversal directions.
- [x] Source or target deletion cleans up join rows without deleting the related objects.
- [x] Inverse relations reuse their owner's join storage or mapped pointer column and create no duplicate table or column.
- [x] Scoped Query reads, counts, exists, ordering, first cursor pages, and selections compile to parameterized SQL with private Access constraints preserved.
- [x] `connect`, `disconnect`, `set`, and `clear` execute atomically and report deterministic typed outcomes.
- [x] Catalog introspection and direct schema policies recognize managed relation storage without claiming unrelated tables.

## Tests

- [x] PostgreSQL unit and integration tests cover every topology, duplicate edges, cleanup, schema drift, query clauses, Access constraints, and rollback.

## Out of scope

- Hidden edge metadata, transport batching, REST, GraphQL, migration file generation, and resumed opaque cursor tokens tracked by issue 341.
