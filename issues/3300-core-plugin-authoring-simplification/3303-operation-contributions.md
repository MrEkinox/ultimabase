# 3303: Unify application-operation contributions

- Status: planned
- Milestone: 33
- Packages: `@ultimabase/core`, `@ultimabase/plugin-kit`
- Depends on: 3302
- ADR: ADR-0269

## Goal

Let an operation owner contribute one operation with its handler and optional
transport bindings without manually recreating declaration and capability
providers.

## Acceptance criteria

- [ ] One Core contribution correlates the exact operation, handler resource, owner, and optional bindings.
- [ ] Core derives internal handler and binding providers with deterministic identities.
- [ ] Independent transport bindings for an operation owned by another plugin remain possible.
- [ ] Explicit application transport selection and all privilege checks remain mandatory.
- [ ] Runtime, transaction, public-error, codec, planning, and disposal behavior is unchanged.

## Tests

- [ ] Core runtime, type, command-graph, REST, and GraphQL operation tests pass.

## Handoff

- Documentation impact: pending.
