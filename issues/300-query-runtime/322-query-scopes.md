# 322: Add reusable query scopes

- Status: planned
- Milestone: 3
- Packages: `@ultimabase/query`
- Depends on: 306
- ADR: ADR-0005

## Goal

Compose typed query transformations through `.use(scope)` without capturing an engine.

## Acceptance criteria

- [ ] Scope input and output preserve schema inference.
- [ ] Scope application remains immutable.
- [ ] Scopes can be composed and reused.

## Tests

- [ ] Branching, composition, and invalid-schema type tests.
