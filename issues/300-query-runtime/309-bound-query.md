# 309: Implement BoundQuery

- Status: planned
- Milestone: 3
- Packages: `@ultimabase/query`, `@ultimabase/runtime`
- Depends on: 306, 307
- ADR: ADR-0005

## Goal

Bind immutable queries to a RequestEngine and expose typed terminal methods.

## Acceptance criteria

- [ ] `Query.bind(engine)` returns `BoundQuery`.
- [ ] `requestEngine.query(schema)` returns a bound class instance.
- [ ] Selection changes result inference.
- [ ] Binding does not mutate the reusable query.

## Tests

- [ ] Terminal and result inference tests.
