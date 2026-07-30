# 115: Compile primitive validation plans

- Status: planned
- Milestone: 1
- Packages: `@ultimabase/schema`
- Depends on: 104, 105, 106, 107, 108, 109, 112
- ADR: ADR-0002

## Goal

Compile primitive field metadata into transport-neutral normalization and validation plans without Zod or another source of truth.

## Acceptance criteria

- [ ] Required, nullable, defaults, constraints, and unknown fields are represented.
- [ ] Plans distinguish create and update behavior.
- [ ] Validation issues carry stable paths and codes.

## Tests

- [ ] Primitive success/failure matrix.
