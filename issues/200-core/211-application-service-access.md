# 211: Expose application service lookup

- Status: ready
- Milestone: 2
- Packages: `@ultimabase/core`
- Depends on: 203, 209
- ADR: ADR-0044, ADR-0050

## Goal

Let framework packages resolve plugin-provided services from an initialized
application without exposing its mutable `ServiceRegistry`.

## Acceptance criteria

- [ ] `FrameworkApplication` exposes required and optional lookup through typed `ServiceToken` identities.
- [ ] Lookup is unavailable before plugin setup completes and after disposal.
- [ ] Callers cannot provide, replace, enumerate, or dispose application services through this boundary.
- [ ] Service ownership, isolation, and disposal semantics remain unchanged.
- [ ] Public documentation distinguishes application service consumption from plugin-owned registration.

## Tests

- [ ] Runtime and compile-time tests preserve exact service inference.
- [ ] Missing, pre-initialization, post-disposal, and cross-application lookups are covered.

## Out of scope

- Runtime pipeline assembly belongs to issue 323.
- Concrete database service registration belongs to issue 501.
