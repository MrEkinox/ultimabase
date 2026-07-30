# 110: Implement defineSchema

- Status: planned
- Milestone: 1
- Packages: `@ultimabase/schema`
- Depends on: 103, 104, 105, 106, 107, 108, 109
- ADR: ADR-0002, ADR-0014

## Goal

Create immutable schema definitions while preserving class and field literals.

## Acceptance criteria

- [ ] `className`, field keys, kinds, and extensions remain inferable.
- [ ] Definitions are immutable from the public API.
- [ ] Reserved system field collisions fail.

## Tests

- [ ] Mutation attempts fail or have no effect.
- [ ] Literal inference has compile-time coverage.
