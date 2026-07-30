# 503: Compile primitive fields to PostgreSQL

- Status: planned
- Milestone: 5
- Packages: `@ultimabase/postgres`
- Depends on: 104, 105, 106, 107, 108, 502
- ADR: ADR-0007, ADR-0014, ADR-0017, ADR-0018

## Goal

Compile every first-release primitive field into PostgreSQL/Drizzle metadata.

## Acceptance criteria

- [ ] Required, nullable, defaults, objects, arrays, JSONB, and enums map explicitly.
- [ ] JSON, object, and array fields use JSONB by default.
- [ ] Nested Dates have a lossless adapter-owned codec.
- [ ] Unsupported nested indexes fail setup instead of being ignored.
- [ ] Static and named database defaults compile without executing runtime defaults.
- [ ] UUID v7 and timestamps compile correctly.
- [ ] No compiler logic enters Schema.

## Tests

- [ ] Generated table metadata and live DDL fixtures.
