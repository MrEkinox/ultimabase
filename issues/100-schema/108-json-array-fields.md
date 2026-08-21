# 108: Implement JSON, list, and object fields

- Status: completed
- Milestone: 1
- Packages: `@ultimabase/schema`
- Depends on: 102, 104, 105, 106, 107
- ADR: ADR-0002, ADR-0021, ADR-0091

## Goal

Add safe JSON values, typed lists, and structured objects composed from existing
field definitions.

## Acceptance criteria

- [x] JSON roots use safe object-or-array documents while nested values retain every portable JSON primitive without `any`.
- [x] Every developer field can preserve homogeneous list inference.
- [x] Object fields preserve nested field inference.
- [x] Nested lists and objects support arbitrary finite depth.
- [x] Circular field definitions are rejected.
- [x] Schema metadata contains no PostgreSQL or Drizzle storage concerns.

## Tests

- [x] Invalid JSON, object fields, and list defaults are rejected in fixtures.
