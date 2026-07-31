# 309: Implement BoundQuery

- Status: done
- Milestone: 3
- Packages: `@ultimabase/query`, `@ultimabase/runtime`
- Depends on: 306, 307
- ADR: ADR-0005, ADR-0061

## Goal

Provide the immutable, selection-aware binding facade used by RequestEngine and
future typed terminal methods.

## Acceptance criteria

- [x] `Query.bind(engine)` returns `BoundQuery` without a Runtime import.
- [x] Bound builder methods preserve the engine and return new instances.
- [x] Selection changes result inference.
- [x] Binding does not mutate the reusable query.
- [x] `RequestEngine.query(schema)` remains owned by issue 313.
- [x] Executable terminal methods remain owned by issues 315 and 316.

## Tests

- [x] Binding, immutability, builder parity, and result inference tests.
