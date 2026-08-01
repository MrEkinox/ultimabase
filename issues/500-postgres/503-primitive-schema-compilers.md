# 503: Compile primitive fields to PostgreSQL

- Status: ready
- Milestone: 5
- Packages: `@ultimabase/postgres`
- Depends on: 104, 105, 106, 107, 108, 502, 517
- ADR: ADR-0007, ADR-0014, ADR-0017, ADR-0038

## Goal

Compile every first-release primitive field into PostgreSQL/Drizzle metadata.

## Acceptance criteria

- [ ] Required, nullable, defaults, objects, arrays, JSONB, and enums map explicitly.
- [ ] JSON, object, and array fields use JSONB by default.
- [ ] Nested Dates have a lossless adapter-owned codec.
- [ ] Unsupported nested indexes fail setup instead of being ignored.
- [ ] Static defaults compile without executing runtime factories.
- [ ] System `uuidVersion`, `generatedOn`, and timestamp metadata compile correctly.
- [ ] No compiler logic enters Schema.

## Tests

- [ ] Generated table metadata and live DDL fixtures.
