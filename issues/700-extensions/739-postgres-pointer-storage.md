# 739: Compile and execute PostgreSQL pointers

- Status: completed
- Milestone: 7+
- Packages: `@ultimabase/postgres-plugin`
- Depends on: 508, 738
- ADR: ADR-0063, ADR-0078, ADR-0082, ADR-0118

## Goal

Map Core pointer contracts to PostgreSQL foreign keys without exposing Drizzle,
column names, or database-specific values to application code.

## Acceptance criteria

- [x] Pointer fields compile to target-compatible foreign-key columns with deterministic PostgreSQL-owned names.
- [x] Required, nullable, unique, indexed, and `restrict`, `cascade`, or `setNull` behavior compile without contradictory combinations.
- [x] Catalog introspection and direct schema policies understand managed pointer columns, foreign keys, indexes, and referential actions.
- [x] Pointer predicates, target scopes, and selection-aware inclusion compile to parameterized SQL.
- [x] Creates, updates, upserts, bulk operations, model commands, and hooks encode and decode immutable Pointer values consistently.
- [x] Unsupported adapter capabilities fail explicitly instead of silently storing an approximate scalar value.

## Tests

- [x] PostgreSQL unit and adapter integration tests cover metadata, introspection, schema drift, CRUD codecs, inclusion source values, referential actions, and SQL parameterization. The Docker-backed complete vertical remains isolated in issue 740.

## Out of scope

- Join tables, relation collections, transports, and migration file generation.
