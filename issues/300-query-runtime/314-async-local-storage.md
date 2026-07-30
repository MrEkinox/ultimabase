# 314: Add AsyncLocalStorage context

- Status: planned
- Milestone: 3
- Packages: `@ultimabase/runtime`
- Depends on: 313
- ADR: ADR-0013

## Goal

Provide scoped contextual access without mutable singleton state.

## Acceptance criteria

- [ ] Helpers fail with `MISSING_EXECUTION_CONTEXT` outside a scope.
- [ ] Nested and concurrent scopes restore correctly.
- [ ] Explicit injection remains the primary transport API.

## Tests

- [ ] Concurrent async chains never leak engines.
