# 744: Compile and execute PostgreSQL relations

- Status: planned
- Milestone: 7+
- Packages: `@ultimabase/postgres`
- Depends on: 739, 743
- ADR: ADR-0078, ADR-0082, ADR-0098, ADR-0118

## Goal

Implement owning join storage, inverse traversal, scoped reads, and atomic
relation mutations behind the portable database adapter.

## Acceptance criteria

- [ ] Owning relations compile to deterministic PostgreSQL-owned join tables with source and target foreign keys.
- [ ] Join storage enforces composite uniqueness and indexes both traversal directions.
- [ ] Source or target deletion cleans up join rows without deleting the related objects.
- [ ] Inverse relations reuse their owner's join storage or mapped pointer column and create no duplicate table or column.
- [ ] Scoped Query reads, counts, exists, ordering, cursors, and selections compile to parameterized SQL with private Access constraints preserved.
- [ ] `connect`, `disconnect`, `set`, and `clear` execute atomically and report deterministic typed outcomes.
- [ ] Catalog introspection and direct schema policies recognize managed relation storage without claiming unrelated tables.

## Tests

- [ ] PostgreSQL unit and integration tests cover every topology, duplicate edges, cleanup, schema drift, query clauses, Access constraints, and rollback.

## Out of scope

- Hidden edge metadata, transport batching, REST, GraphQL, and migration file generation.
