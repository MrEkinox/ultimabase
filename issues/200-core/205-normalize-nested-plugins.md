# 205: Normalize nested plugins

- Status: planned
- Milestone: 2
- Packages: `@ultimabase/core`
- Depends on: 204
- ADR: ADR-0003

## Goal

Flatten nested configuration into one graph while retaining parent relationships and source order.

## Acceptance criteria

- [ ] Children gain an implicit parent dependency.
- [ ] Nested and top-level duplicates are detected.
- [ ] Conflicting duplicate options fail.
- [ ] Normalization does not initialize plugins.

## Tests

- [ ] Deep nesting and duplicate fixtures.
