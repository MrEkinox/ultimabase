# 504: Compile indexes

- Status: completed
- Milestone: 5
- Packages: `@ultimabase/postgres-plugin`
- Depends on: 114, 503
- ADR: ADR-0007

## Goal

Compile unique, composite, and ordinary indexes.

## Acceptance criteria

- [x] Names are deterministic and length-safe.
- [x] Unique composites can become upsert targets.

## Tests

- [x] Compiled Drizzle table-catalog assertions.

Live `pg_catalog` assertions belong to issue 511, which compares the desired
metadata produced here with real database state.
