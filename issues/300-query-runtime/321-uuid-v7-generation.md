# 321: Generate UUID v7 identifiers

- Status: planned
- Milestone: 3
- Packages: `@ultimabase/runtime`
- Depends on: 111, 320
- ADR: ADR-0014

## Goal

Generate valid UUID v7 identifiers before database insertion.

## Acceptance criteria

- [ ] IDs are generated for singular and bulk creates.
- [ ] Generation consumes the schema `uuid` kind and `uuidVersion: 7` metadata.
- [ ] Ordering follows UUID v7 timestamp semantics without claiming strict uniqueness order.
- [ ] Generation is injectable for deterministic tests.

## Tests

- [ ] Format, timestamp, collision, and deterministic-fixture tests.
