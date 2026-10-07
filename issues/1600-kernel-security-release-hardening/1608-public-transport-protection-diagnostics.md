# 1608: Make public-transport protection diagnostics precise

- Status: completed
- Milestone: 16
- Packages: `@ultimabase/core`, transport contracts, `@ultimabase/testing`
- Depends on: 1603
- ADR: ADR-0205

## Goal

Ensure the public-transport warning describes what Core can actually prove
instead of implying that any installed protected-policy provider secures every
exposed operation.

## Acceptance criteria

- [x] The former `UNPROTECTED_PUBLIC_TRANSPORT` semantics are replaced by an
      exact distinction between no policy provider, provider presence, unverified
      coverage, and developer acknowledgement.
- [x] A no-op or unrelated protected policy cannot silently claim complete transport protection unless an accepted explicit coverage contract proves it.
- [x] If exact coverage cannot be determined generically, the diagnostic is renamed and documented as provider-presence information rather than a security guarantee.
- [x] Diagnostic behavior remains product-neutral and does not name Access, ACL, authentication, or a community engine.
- [x] One warning per protocol, exact acknowledgement, structured diagnostic data, and application isolation remain deterministic.
- [x] Any durable coverage declaration or warning semantic change is recorded in an ADR.

## Tests

- [x] Tests cover no provider, no-op provider, partial or unrelated provider, official Access, ACL, alternative policy, explicit acknowledgement, and multiple transports.
- [x] Public and packed tests assert the exact diagnostic contract.

## Completion evidence

- ADR-0209 records that arbitrary policy callbacks cannot prove complete public
  transport coverage. Core deliberately adds no self-asserted complete-coverage
  boolean; a future executable coverage protocol requires its own ADR.
- The canonical warning is now
  `UNVERIFIED_PUBLIC_TRANSPORT_PROTECTION`. Its immutable `policy` data reports
  `providerPresence` as `none` or `present`, while `coverage` remains
  `unverified` in both cases. The message and implementation use no concrete
  policy-product vocabulary.
- `acknowledgeUnverifiedProtection: true` is the only accepted acknowledgement.
  The misleading `acknowledgeUnprotected`,
  `UnprotectedPublicTransportWarning`, and `UNPROTECTED_PUBLIC_TRANSPORT`
  contracts were removed rather than retained as parallel aliases.
- Focused Core tests cover no provider, no-op and unrelated policies, two
  protocols, exact acknowledgement, removal of the prior option, and
  application isolation. Public E2E tests prove the same provider-present but
  unverified result for official Access, independent ACL, and an alternative
  policy engine using package-root exports.

## Commands passed

- `yarn typecheck`.
- Focused Core Runtime tests: 2 files and 13 tests.
- Source public transport matrix: 1 file and 3 tests through `coverage-e2e`.
- Built public exports: 2 files and 9 tests through `e2e`.
- `yarn test`: 344 files and 1,868 runtime/type tests.
- `yarn test:pack:built`: 17 files and 85 packed-consumption tests.
- `yarn lint` with zero errors; existing centralized file-size warnings remain.
- `yarn format:check`, `yarn constraints`, and `yarn build`, including attw and
  publint.

## Out of scope

- Proving business-policy correctness from arbitrary plugin callbacks.
- Installing a neutral policy stage when no provider exists.
- Requiring every transport to depend on Access.
