# 115: Compile primitive validation plans

- Status: completed
- Milestone: 1
- Packages: `@ultimabase/schema`
- Depends on: 104, 105, 106, 107, 108, 109, 112
- ADR: ADR-0002, ADR-0020

## Goal

Compile primitive field metadata into transport-neutral normalization and validation plans without Zod or another source of truth.

## Acceptance criteria

- [x] Required, nullable, defaults, constraints, and unknown fields are represented.
- [x] Plans distinguish create and update behavior.
- [x] Validation issues carry stable paths and codes.

## Tests

- [x] Primitive success/failure matrix.
