# 113: Implement isolated SchemaRegistry

- Status: done
- Milestone: 1
- Packages: `@ultimabase/schema`
- Depends on: 110
- ADR: ADR-0002

## Goal

Register and retrieve explicit schemas without global mutable state.

## Acceptance criteria

- [x] Duplicate class names fail with a typed error.
- [x] Registration order is stable.
- [x] Registry instances are isolated.
- [x] Lookup supports literal-name inference where possible.

## Tests

- [x] Parallel registries do not leak definitions.
