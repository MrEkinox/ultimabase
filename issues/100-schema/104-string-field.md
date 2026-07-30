# 104: Implement stringField

- Status: done
- Milestone: 1
- Packages: `@ultimabase/schema`
- Depends on: 102
- ADR: ADR-0002

## Goal

Implement string field metadata and inference.

## Acceptance criteria

- [x] Literal options are preserved.
- [x] Required, optional, nullable, and default behavior infer correctly.
- [x] Length and pattern constraints remain declarative.

## Tests

- [x] Runtime metadata tests.
- [x] Positive and negative type tests.

## Implementation notes

- `stringField()` produces frozen metadata and preserves literal options through overloads.
- String constraints use `validation.length.min`, `validation.length.max`, and `validation.match`.
- Length ranges are checked when metadata is created, while match evaluation remains a declarative runtime concern.
- Field extension lists are copied, frozen, and checked for duplicate names through the shared extension boundary.
