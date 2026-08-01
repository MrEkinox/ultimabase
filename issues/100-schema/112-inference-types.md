# 112: Export object, create, and update inference

- Status: done
- Milestone: 1
- Packages: `@ultimabase/schema`
- Depends on: 110, 111
- ADR: ADR-0014, ADR-0019

## Goal

Implement `InferObject`, `InferCreateInput`, and `InferUpdateInput`.

## Acceptance criteria

- [x] Optional, nullable, required, immutable, and defaulted fields infer correctly.
- [x] Auto-incremented integer fields do not require a generated value in create inputs.
- [x] System `generatedOn` and `immutable` metadata controls create and update inputs without reserved-name checks.
- [x] No public result contains `any`.
- [x] Extension metadata can affect inference through typed contracts.

## Tests

- [x] Exhaustive type matrix for primitive options.
