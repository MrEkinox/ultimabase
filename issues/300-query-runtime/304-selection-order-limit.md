# 304: Add selection, ordering, limit, and skip

- Status: completed
- Milestone: 3
- Packages: `@ultimabase/query`
- Depends on: 301
- ADR: ADR-0004, ADR-0055, ADR-0057

## Goal

Represent selected fields, deterministic ordering, limit, and offset. Pointer
inclusion is deferred to issue 737 so the schema can restrict it to exact
pointer fields; to-many relations remain independently queried.

## Acceptance criteria

- [x] Selected and ordered fields are schema-checked.
- [x] Limits reject invalid values.
- [x] Duplicate selection and ordering normalize predictably.

## Tests

- [x] Runtime and type tests.
