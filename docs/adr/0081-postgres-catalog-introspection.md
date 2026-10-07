# ADR-0081: PostgreSQL catalog introspection

- Status: accepted
- Date: 2026-08-01
- Extends: ADR-0008, ADR-0079, ADR-0080

## Decision

`@ultimabase/postgres-plugin` reads live columns, indexes, and constraints through
parameterized `pg_catalog` queries and converts driver rows into one detached,
immutable snapshot. Tables are sorted by physical name; columns retain ordinal
position, while indexes and constraints retain catalog name order.

The introspector receives the compiled catalog's exact table names. Matching
tables are marked `managed`; every other table-like object remains visible but
is marked unrelated. Ownership is never inferred from a name prefix or from a
database comment.

The normalized snapshot retains column type, nullability, static default
expression, and identity mode; index fields, method, uniqueness, primary-key
status, and definition; and constraint kind, fields, and definition. Driver
rows cross an `unknown` boundary and are validated before use.

Structures the direct policy cannot safely reproduce are reported separately.
This includes unsupported column types, generated columns, views and foreign
tables, partitioned tables, non-B-tree or partial/expression/included-column
indexes, and constraint kinds other than primary or unique. The introspector
does not coerce these structures into the nearest supported shape.

## Consequences

Issue 512 can compare desired compiled metadata with live state without issuing
its own ad hoc catalog queries. Unrelated structures remain distinguishable,
so direct synchronization can restrict destructive decisions to the configured
policy and managed table set.

Catalog introspection stays private to the PostgreSQL package. Developers see
it through automatic startup schema policies rather than a Drizzle or
`pg_catalog` API.
