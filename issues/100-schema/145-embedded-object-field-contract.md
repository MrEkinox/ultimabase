# 145: Define the embedded object field contract

- Status: completed
- Milestone: 1
- Packages: `@ultimabase/core`, `@ultimabase/postgres-plugin`
- Depends on: 108, 126, 326, 416
- ADR: ADR-0165

## Goal

Make `objectField` accept only fields that can behave as values inside one
embedded stored document, while preserving exact nested input resolution and
Access behavior for every concrete occurrence.

## Acceptance criteria

- [x] Pointer and relation fields are rejected as direct or recursively nested
      object children in TypeScript and at the runtime declaration boundary.
- [x] Integer and bigint fields using `autoIncrement` are rejected as embedded
      children because their generation requires a dedicated database column.
- [x] Nested scalar field Access receives the exact concrete value and path for
      each object and list occurrence.
- [x] Nested field `resolveInput` preserves deterministic child-before-parent
      traversal and runs once for every supplied occurrence.
- [x] PostgreSQL keeps object values in one JSONB column and continues to reject
      unsupported nested index metadata during setup.
- [x] Public documentation explains when an explicit relationship schema is
      required instead of an embedded object.

## Tests

- [x] Compile-time tests reject unsupported embedded field declarations.
- [x] Runtime declaration tests reject malformed untyped declarations.
- [x] Runtime Access and hook tests cover nested object and list occurrences.
- [x] PostgreSQL compiler and codec tests retain JSONB storage and nested value
      round trips.
