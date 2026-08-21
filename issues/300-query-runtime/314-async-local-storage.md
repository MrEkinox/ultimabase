# 314: Add AsyncLocalStorage context

- Status: completed
- Milestone: 3
- Packages: `@ultimabase/runtime`
- Depends on: 313
- ADR: ADR-0013, ADR-0066

## Goal

Provide scoped contextual access without mutable singleton state.

## Acceptance criteria

- [x] Helpers fail with `MISSING_EXECUTION_CONTEXT` outside a scope.
- [x] Nested and concurrent scopes restore correctly.
- [x] Explicit injection remains the primary transport API.

## Tests

- [x] Concurrent async chains never leak engines.
