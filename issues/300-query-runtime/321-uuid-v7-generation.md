# 321: Generate UUID v7 identifiers

- Status: done
- Milestone: 3
- Packages: `@ultimabase/runtime`
- Depends on: 111, 320
- ADR: ADR-0014

## Goal

Generate valid UUID v7 identifiers before database insertion.

## Acceptance criteria

- [x] IDs are generated for singular and bulk creates.
- [x] Generation consumes the schema `uuid` kind and `uuidVersion: 7` metadata.
- [x] Ordering follows UUID v7 timestamp semantics without claiming strict uniqueness order.
- [x] Generation is injectable for deterministic tests.

## Tests

- [x] Format, timestamp, collision, and deterministic-fixture tests.
