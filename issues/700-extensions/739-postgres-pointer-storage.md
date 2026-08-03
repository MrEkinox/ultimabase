# 739: Compile and execute PostgreSQL pointers

- Status: planned
- Milestone: 7+
- Packages: `@ultimabase/postgres`
- Depends on: 508, 738
- ADR: ADR-0063, ADR-0078, ADR-0082, ADR-0118

## Goal

Map Core pointer contracts to PostgreSQL foreign keys without exposing Drizzle,
column names, or database-specific values to application code.

## Acceptance criteria

- [ ] Pointer fields compile to target-compatible foreign-key columns with deterministic PostgreSQL-owned names.
- [ ] Required, nullable, unique, indexed, and `restrict`, `cascade`, or `setNull` behavior compile without contradictory combinations.
- [ ] Catalog introspection and direct schema policies understand managed pointer columns, foreign keys, indexes, and referential actions.
- [ ] Pointer predicates, target scopes, and selection-aware inclusion compile to parameterized SQL.
- [ ] Creates, updates, upserts, bulk operations, model commands, and hooks encode and decode immutable Pointer values consistently.
- [ ] Unsupported adapter capabilities fail explicitly instead of silently storing an approximate scalar value.

## Tests

- [ ] PostgreSQL unit and integration tests cover metadata, introspection, schema drift, CRUD, inclusion, referential actions, and SQL parameterization.

## Out of scope

- Join tables, relation collections, transports, and migration file generation.
