# 139: Limit field defaults to values and factories

- Status: done
- Milestone: 1
- Packages: schema
- Depends on: 109, 137
- ADR: ADR-0038

## Goal

Keep the field `default` option limited to a static field value or a
zero-argument runtime factory that returns one field value.

## Acceptance criteria

- [x] `FieldDefault<TValue>` contains only `TValue` and `() => TValue`.
- [x] `DatabaseDefault`, its classifier, and database plan descriptors are removed.
- [x] Database-specific expressions remain possible only through plugin-owned metadata.
- [x] Static and runtime defaults preserve exact inference and inert compilation.
- [x] Public exports and documentation describe only the two supported forms.
- [x] Typecheck, tests, lint, build, package validation, and coverage pass.

## Tests

- [x] Static defaults remain copied and represented by static plans.
- [x] Runtime factories remain stored without execution and compile to runtime plans.
- [x] Built archives no longer expose removed database-default contracts.

## Out of scope

- Defining a PostgreSQL-specific default extension.
- Executing runtime factories inside Schema.
