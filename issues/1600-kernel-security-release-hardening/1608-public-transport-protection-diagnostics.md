# 1608: Make public-transport protection diagnostics precise

- Status: planned
- Milestone: 16
- Packages: `@ultimabase/core`, transport contracts, `@ultimabase/testing`
- Depends on: 1603
- ADR: ADR-0205

## Goal

Ensure the public-transport warning describes what Core can actually prove
instead of implying that any installed protected-policy provider secures every
exposed operation.

## Acceptance criteria

- [ ] `UNPROTECTED_PUBLIC_TRANSPORT` semantics explicitly distinguish no policy provider, provider presence, declared coverage, and developer acknowledgement.
- [ ] A no-op or unrelated protected policy cannot silently claim complete transport protection unless an accepted explicit coverage contract proves it.
- [ ] If exact coverage cannot be determined generically, the diagnostic is renamed and documented as provider-presence information rather than a security guarantee.
- [ ] Diagnostic behavior remains product-neutral and does not name Access, ACL, authentication, or a community engine.
- [ ] One warning per protocol, exact acknowledgement, structured diagnostic data, and application isolation remain deterministic.
- [ ] Any durable coverage declaration or warning semantic change is recorded in an ADR.

## Tests

- [ ] Tests cover no provider, no-op provider, partial or unrelated provider, official Access, ACL, alternative policy, explicit acknowledgement, and multiple transports.
- [ ] Public and packed tests assert the exact diagnostic contract.

## Out of scope

- Proving business-policy correctness from arbitrary plugin callbacks.
- Installing a neutral policy stage when no provider exists.
- Requiring every transport to depend on Access.
