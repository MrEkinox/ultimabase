# 102: Define the generic field contract

- Status: done
- Milestone: 1
- Packages: `@ultimabase/schema`
- Depends on: 101
- ADR: ADR-0002, ADR-0014

## Goal

Define immutable field metadata and common options without database-specific types.

## Acceptance criteria

- [x] Validation, default, immutable, indexed, description, and extensions are represented.
- [x] Required and nullable cannot both be true.
- [x] Field kind literals are preserved.

## Tests

- [x] Type tests reject invalid combinations.

## Implementation notes

- Kept the contract type-only so concrete field factories can own runtime construction.
- Grouped required and nullable states under `validation` with a union that rejects contradictory metadata.
- Combined regular and unique single-field indexes under `indexed`.
- Preserved exact field kinds, options, and base value types for later schema inference.
