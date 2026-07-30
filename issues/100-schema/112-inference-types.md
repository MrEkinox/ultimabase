# 112: Export object, create, and update inference

- Status: planned
- Milestone: 1
- Packages: `@ultimabase/schema`
- Depends on: 110, 111
- ADR: ADR-0014

## Goal

Implement `InferObject`, `InferCreateInput`, and `InferUpdateInput`.

## Acceptance criteria

- [ ] Optional, nullable, required, immutable, and defaulted fields infer correctly.
- [ ] No public result contains `any`.
- [ ] Extension metadata can affect inference through typed contracts.

## Tests

- [ ] Exhaustive type matrix for primitive options.
