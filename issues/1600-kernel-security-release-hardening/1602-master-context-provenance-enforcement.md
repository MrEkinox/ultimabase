# 1602: Enforce application-owned Master provenance

- Status: planned
- Milestone: 16
- Packages: `@ultimabase/core`, `@ultimabase/testing`
- Depends on: 1601
- ADR: ADR-0206

## Goal

Implement the accepted Master provenance boundary so an application never
accepts authority created or audited by an unrelated `MasterAuthority`.

## Acceptance criteria

- [ ] Every Master context carries unforgeable internal provenance for its exact issuing authority without exposing credentials or a public mutable brand.
- [ ] Application binding rejects a Master context not issued by that application's configured authority before an operation or plugin effect runs.
- [ ] Anonymous contexts retain the binding and application-isolation behavior accepted by issue 1601.
- [ ] Trusted `useMasterKey`, explicit grant elevation, nested server operations, and Master audit events follow the accepted trust model exactly.
- [ ] Plugin operations and Runtime contributors cannot substitute a foreign Master context through a public execution path.
- [ ] Core remains independent from Access, Hooks, ACL, Roles, transports, and concrete plugins.
- [ ] Public documentation and hover text explain the supported trusted server-side path without teaching unsafe context construction.

## Tests

- [ ] Runtime tests reject a self-created foreign authority, a second application's authority, a forged lookalike, and an inherited foreign Master context.
- [ ] Runtime tests preserve legitimate application-issued Master use and prove exactly one application-owned audit event per elevation.
- [ ] Public-package, plugin-operation, Runtime-provider, transport, and application-isolation tests cover the complete issue-1601 regression matrix.

## Out of scope

- Changing Access or ACL policy semantics.
- Introducing user or system authority modes into Core.
- Adding a general plugin sandbox.
