# ADR-0078: PostgreSQL-owned physical table naming

- Status: accepted
- Date: 2026-08-01
- Refines: ADR-0002, ADR-0007, ADR-0014

## Decision

`@ultimabase/postgres-plugin` derives default physical table names from schema class
names using `inflection.tableize()`. This provides deterministic English
pluralization and `snake_case`, including irregular nouns, without placing
database naming logic in Schema or Runtime.

Developers may attach `postgresTable({ name })`, a `postgres.table` schema
extension owned by `@ultimabase/postgres-plugin`. Its non-empty name is preserved
verbatim; UltimaBase does not impose casing, pluralization, or character rules
on explicit names.

Resolved names enter Drizzle identifier APIs and are never concatenated into
raw SQL. Core's extension-handler validation requires `postgresPlugin` whenever
a schema declares this PostgreSQL-owned extension.

## Consequences

Portable schemas keep predictable PostgreSQL defaults while legacy or
deliberately styled databases retain exact identifiers. `@ultimabase/schema`
remains unaware of physical storage names.

An explicit dot is part of one quoted table identifier, not implicit PostgreSQL
schema qualification. A future schema-selection option must use a separate
typed contract rather than reinterpret existing table names.
