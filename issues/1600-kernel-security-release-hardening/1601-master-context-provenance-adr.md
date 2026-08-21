# 1601: Decide Master context provenance and plugin trust

- Status: completed
- Milestone: 16
- Packages: `@ultimabase/core`, repository documentation
- Depends on: 1509
- ADR: ADR-0071, ADR-0128, ADR-0191, ADR-0204, ADR-0206

## Goal

Define the exact authority provenance and in-process plugin trust model for
Master contexts before changing the public or Runtime implementation.

## Acceptance criteria

- [x] A new accepted ADR records whether a Master `RequestContext` is valid only for the exact `MasterAuthority` and application that issued it.
- [x] The ADR distinguishes transport input, application server code, ordinary plugin code, privileged plugin code, and framework-owned trusted paths.
- [x] The ADR decides whether `useMasterKey: true` remains available to all trusted server-side callers or requires an explicit owner-scoped authority contract.
- [x] The ADR defines the intended relationship between `authority:elevate`, raw Master grants, audited trusted elevation, and nested plugin operations.
- [x] Foreign-authority, foreign-application, unbound anonymous, already-bound anonymous, and application-issued Master contexts each have one explicit expected outcome.
- [x] The minimal implementation and migration consequences are documented without introducing plugin-specific authority concepts into Core.

## Tests

- [x] The ADR includes a concrete regression matrix covering direct schema terminals, explicit operation contexts, plugin operations, Runtime contributors, transports, and application isolation.

## Decision evidence

- ADR-0206 binds every Master context to its exact application and authority.
- Application server code retains the concise trusted terminal API.
- A plugin-owned callback requires its exact `authority:elevate` privilege only
  when it initiates a new elevation; caller-selected Master execution is
  inherited without manufacturing a new grant.
- Direct public `MasterAuthority.elevate()` context minting is removed by the
  implementation issue 1602, while credential verification and opaque grants
  remain Core-owned.
- The ADR records the explicit in-process trust limitation and the complete
  source, Runtime, plugin, transport, and application-isolation regression
  matrix for issue 1602.

## Out of scope

- Implementing the chosen provenance model before the ADR is accepted.
- Moving Master configuration or credential verification out of Core.
- Treating plugin privileges as an operating-system sandbox.
