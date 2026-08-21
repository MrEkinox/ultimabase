# 110: Implement defineSchema

- Status: completed
- Milestone: 1
- Packages: `@ultimabase/schema`
- Depends on: 103, 104, 105, 106, 107, 108, 109
- ADR: ADR-0002, ADR-0014
- Replaced by: 143

## Goal

Create immutable schema definitions while preserving class and field literals.

The factory delivered by this historical issue was later replaced by the
immutable `Schema` constructor in issue 143 and ADR-0093.

## Acceptance criteria

- [x] `className`, field keys, kinds, and extensions remain inferable.
- [x] Definitions are immutable from the public API.
- [x] Reserved system field collisions fail.

## Tests

- [x] Mutation attempts fail or have no effect.
- [x] Literal inference has compile-time coverage.
