# 110: Implement defineSchema

- Status: completed
- Milestone: 1
- Packages: `@ultimabase/schema`
- Depends on: 103, 104, 105, 106, 107, 108, 109
- ADR: ADR-0002, ADR-0014

## Goal

Create immutable schema definitions while preserving class and field literals.

## Acceptance criteria

- [x] `className`, field keys, kinds, and extensions remain inferable.
- [x] Definitions are immutable from the public API.
- [x] Reserved system field collisions fail.

## Tests

- [x] Mutation attempts fail or have no effect.
- [x] Literal inference has compile-time coverage.
