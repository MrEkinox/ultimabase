# 102: Define the generic field contract

- Status: planned
- Milestone: 1
- Packages: `@ultimabase/schema`
- Depends on: 101
- ADR: ADR-0002, ADR-0014

## Goal

Define immutable field metadata and common options without database-specific types.

## Acceptance criteria

- [ ] Required, nullable, default, immutable, unique, index, description, and examples are represented.
- [ ] Required and nullable cannot both be true.
- [ ] Field kind literals are preserved.

## Tests

- [ ] Type tests reject invalid combinations.
