# 205: Normalize nested plugins

- Status: done
- Milestone: 2
- Packages: `@ultimabase/core`
- Depends on: 204
- ADR: ADR-0046

## Goal

Flatten nested configuration into one graph while retaining parent relationships and source order.

## Acceptance criteria

- [x] Children gain an implicit parent dependency.
- [x] Nested and top-level duplicates are detected.
- [x] Conflicting duplicate options fail.
- [x] Distinct plugins occupying the same exclusive slot fail.
- [x] Normalization does not initialize plugins.

## Tests

- [x] Deep nesting, duplicate, and exclusive-slot fixtures.
