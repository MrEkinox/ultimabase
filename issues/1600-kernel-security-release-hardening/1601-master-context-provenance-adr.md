# 1601: Decide Master context provenance and plugin trust

- Status: ready
- Milestone: 16
- Packages: `@ultimabase/core`, repository documentation
- Depends on: 1509
- ADR: ADR-0071, ADR-0128, ADR-0191, ADR-0204

## Goal

Define the exact authority provenance and in-process plugin trust model for
Master contexts before changing the public or Runtime implementation.

## Acceptance criteria

- [ ] A new accepted ADR records whether a Master `RequestContext` is valid only for the exact `MasterAuthority` and application that issued it.
- [ ] The ADR distinguishes transport input, application server code, ordinary plugin code, privileged plugin code, and framework-owned trusted paths.
- [ ] The ADR decides whether `useMasterKey: true` remains available to all trusted server-side callers or requires an explicit owner-scoped authority contract.
- [ ] The ADR defines the intended relationship between `authority:elevate`, raw Master grants, audited trusted elevation, and nested plugin operations.
- [ ] Foreign-authority, foreign-application, unbound anonymous, already-bound anonymous, and application-issued Master contexts each have one explicit expected outcome.
- [ ] The minimal implementation and migration consequences are documented without introducing plugin-specific authority concepts into Core.

## Tests

- [ ] The ADR includes a concrete regression matrix covering direct schema terminals, explicit operation contexts, plugin operations, Runtime contributors, transports, and application isolation.

## Out of scope

- Implementing the chosen provenance model before the ADR is accepted.
- Moving Master configuration or credential verification out of Core.
- Treating plugin privileges as an operating-system sandbox.
