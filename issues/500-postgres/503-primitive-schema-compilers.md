# 503: Compile primitive fields to PostgreSQL

- Status: planned
- Milestone: 5
- Packages: `@ultimabase/postgres`
- Depends on: 104, 105, 106, 107, 108, 502
- ADR: ADR-0007, ADR-0014

## Goal

Compile every first-release primitive field into PostgreSQL/Drizzle metadata.

## Acceptance criteria

- [ ] Required, nullable, defaults, arrays, JSONB, and enums map explicitly.
- [ ] UUID v7 and timestamps compile correctly.
- [ ] No compiler logic enters Schema.

## Tests

- [ ] Generated table metadata and live DDL fixtures.
