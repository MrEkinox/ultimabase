# ADR-0138: Drizzle-native PostgreSQL synchronization metadata

- Status: accepted
- Date: 2026-08-05
- Refines: ADR-0079, ADR-0080, ADR-0081, ADR-0082

## Context

The PostgreSQL compiler already creates complete private Drizzle tables for
every application schema and hidden relation join. Direct synchronization then
rebuilt columns, defaults, identities, indexes, and foreign keys from parallel
UltimaBase metadata before comparing that desired state with the live catalog.

Keeping two physical descriptions made every PostgreSQL compiler change a
cross-checked manual update. It also allowed query execution and schema
synchronization to disagree with the Drizzle table that actually executes
database operations.

Drizzle's public `getTableConfig()` API exposes the table name, columns,
table-level primary keys, indexes, and foreign keys, including their target
columns and referential actions. Column instances retain SQL type, nullability,
inline primary-key state, static defaults, and identity configuration.

## Decision

The compiled Drizzle table is the sole source of desired physical metadata for
PostgreSQL direct synchronization. The adapter normalizes `getTableConfig()`
into the existing detached `DesiredPostgresTable` comparison model because the
live `pg_catalog` snapshot and deterministic planner must remain independent of
mutable ORM objects.

This normalization validates the deliberately supported direct-sync subset:
simple named B-tree or GIN indexes, single-column foreign keys, supported
referential actions, and static defaults that the UltimaBase field compiler can
encode deterministically. Unsupported Drizzle metadata fails explicitly
instead of being approximated.

`postgresColumn({ renamedFrom })` remains a small UltimaBase overlay keyed by
the compiled Drizzle column name. Rename intent describes a transition from a
previous physical schema and therefore cannot be inferred from the desired
table alone.

Compiled schema and relation records no longer retain duplicate index or
foreign-key descriptions. Unique-upsert target validation reads the same
Drizzle index metadata used by synchronization and statement execution.

## Consequences

- Field, pointer, index, and relation compilers define physical metadata once.
- Direct synchronization keeps its deterministic detached planner and guarded
  SQL renderer without maintaining a parallel desired-schema declaration.
- Rename intent remains explicit and adapter-owned.
- Future Drizzle table features are accepted only when the direct policy can
  normalize and apply them safely; otherwise setup fails at the metadata
  boundary.
