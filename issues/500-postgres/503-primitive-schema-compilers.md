# 503: Compile primitive fields to PostgreSQL

- Status: done
- Milestone: 5
- Packages: `@ultimabase/postgres`
- Depends on: 104, 105, 106, 107, 108, 502, 517
- ADR: ADR-0007, ADR-0014, ADR-0017, ADR-0038

## Goal

Compile every first-release primitive field into PostgreSQL/Drizzle metadata.

## Acceptance criteria

- [x] Required, nullable, defaults, objects, arrays, JSONB, and enums map explicitly.
- [x] JSON, object, and array fields use JSONB by default.
- [x] Nested temporal strings and native structured values have a lossless adapter-owned codec.
- [x] Unsupported nested indexes fail setup instead of being ignored.
- [x] Static defaults compile without executing runtime factories.
- [x] System `uuidVersion`, `generatedOn`, and timestamp metadata compile correctly.
- [x] No compiler logic enters Schema.

## Tests

- [x] Generated table metadata and application-setup fixtures.

Live DDL belongs to issue 512, which consumes this compiled catalog. Keeping it
there avoids a temporary second schema synchronization implementation in this
metadata-only issue.
