# ADR-0080: PostgreSQL index compilation

- Status: accepted
- Date: 2026-08-01
- Extends: ADR-0007, ADR-0014, ADR-0079

## Decision

`@ultimabase/postgres-plugin` compiles every normalized field-level and composite
index as a Drizzle PostgreSQL index on the schema's private table. Ordinary
definitions use `index`; unique definitions use `uniqueIndex`. Declaration
order and field order remain unchanged.

Generated index names combine a readable table, field, and kind prefix with a
16-character SHA-256 fingerprint. The fingerprint input uses length-prefixed
components so underscores or other identifier characters cannot create
ambiguous inputs. The readable prefix is truncated on complete Unicode code
points so the complete name stays within PostgreSQL's 63-byte identifier
limit.

The compiled schema retains each index's generated name, normalized field
tuple, uniqueness, and private Drizzle index. Later upsert compilation uses
this metadata to validate and construct conflict targets without reconstructing
schema declarations. Duplicate normalized definitions fail setup instead of
producing redundant DDL.

## Consequences

Developers continue to declare `indexed: true`, `indexed: "unique"`, or a
schema-level composite index without naming physical database objects.
Generated names are deterministic across application processes and safe for
Unicode identifiers.

This issue creates desired metadata only. PostgreSQL catalog introspection and
direct synchronization remain owned by issues 511 and 512, so index
compilation does not introduce a temporary DDL implementation.
