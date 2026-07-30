# 113: Implement isolated SchemaRegistry

- Status: planned
- Milestone: 1
- Packages: `@ultimabase/schema`
- Depends on: 110
- ADR: ADR-0002

## Goal

Register and retrieve explicit schemas without global mutable state.

## Acceptance criteria

- [ ] Duplicate class names fail with a typed error.
- [ ] Registration order is stable.
- [ ] Registry instances are isolated.
- [ ] Lookup supports literal-name inference where possible.

## Tests

- [ ] Parallel registries do not leak definitions.
