# 108: Implement JSON, list, and object fields

- Status: completed
- Milestone: 1
- Packages: `@ultimabase/schema`
- Depends on: 102, 104, 105, 106, 107
- ADR: ADR-0002, ADR-0021

## Goal

Add safe JSON values, typed lists, and structured objects composed from existing
field definitions.

## Acceptance criteria

- [x] JSON defaults to a safe JSON value type rather than `any`.
- [x] Every developer field can preserve homogeneous list inference.
- [x] Object fields preserve nested field inference.
- [x] Nested lists and objects support arbitrary finite depth.
- [x] Circular field definitions are rejected.
- [x] Schema metadata contains no PostgreSQL or Drizzle storage concerns.

## Tests

- [x] Invalid JSON, object fields, and list defaults are rejected in fixtures.
