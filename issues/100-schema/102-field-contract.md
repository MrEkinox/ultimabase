# 102: Define the generic field contract

- Status: done
- Milestone: 1
- Packages: `@ultimabase/schema`
- Depends on: 101
- ADR: ADR-0002, ADR-0014

## Goal

Define immutable field metadata and common options without database-specific types.

## Acceptance criteria

- [x] Required, nullable, default, immutable, unique, index, and description are represented.
- [x] Required and nullable cannot both be true.
- [x] Field kind literals are preserved.

## Tests

- [x] Type tests reject invalid combinations.

## Implementation notes

- Kept the contract type-only so concrete field factories can own runtime construction.
- Represented required and nullable states as a union that rejects contradictory metadata.
- Preserved exact field kinds, options, and base value types for later schema inference.
