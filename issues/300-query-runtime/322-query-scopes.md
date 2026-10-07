# 322: Add reusable query scopes

- Status: completed
- Milestone: 3
- Packages: `@ultimabase/query`
- Depends on: 306
- ADR: ADR-0005, ADR-0074

## Goal

Compose typed query transformations through `.use(scope)` without capturing an engine.

## Acceptance criteria

- [x] Scope input and output preserve schema inference.
- [x] Scope application remains immutable.
- [x] Scopes can be composed and reused.

## Tests

- [x] Branching, composition, and invalid-schema type tests.
