# 2313: Add Password Auth sessions and operations

- Status: completed
- Milestone: 23
- Packages: `@ultimabase/password-auth-plugin`, `@ultimabase/core`, `@ultimabase/typegen`
- Depends on: 2312
- ADR: ADR-0113, ADR-0193, ADR-0224, ADR-0234, ADR-0235

## Goal

Add opaque revocable sessions and transport-neutral authentication operations
to Password Auth through the existing plugin operation and request-value
boundaries.

## Acceptance criteria

- [x] `signUp`, `login`, `logout`, and refresh are nominal versioned plugin
      operations with exact immutable input, result, error, and transaction
      contracts.
- [x] Session tokens are cryptographically random opaque values, returned only
      at creation or rotation, stored only through a non-reversible verifier,
      and never accepted by Query terminals.
- [x] Session storage and verifier metadata receive no automatic REST or GraphQL
      schema route, Typegen field, event, hook payload, or serialization path.
- [x] Ordinary application Query and operation handles cannot inspect or mutate
      session storage; only the exact Password Auth callbacks authorized by the
      ADR-0234 and ADR-0235 can execute its internal persistence path.
- [x] Sessions have explicit creation, idle or absolute expiration, revocation,
      rotation, User ownership, and application isolation semantics.
- [x] Login verifies the configured password hash, upgrades stale parameters
      when required, and cannot disclose whether a User or credential failed.
- [x] Logout invalidates the exact session and refresh rotates rather than
      extending reusable credential material silently.
- [x] A validated session derives immutable principal and session context values
      while retaining anonymous Core authority.
- [x] Any temporary internal authority used to resolve credentials or sessions
      is audited, never escapes as caller authority, and is absent from the
      derived public request context.
- [x] `runWithSession()` validates one raw token before entering an
      application-owned asynchronous execution scope and never retains the raw
      token in Runtime data.
- [x] Authentication establishes identity only; Access and other policies make
      every authorization decision.

## Tests

- [x] Sign-up, login, invalid credentials, expiration, revocation, rotation,
      concurrent refresh, password-hash upgrade, logout, and application
      isolation tests.
- [x] Operation transport, Runtime context propagation, Typegen, JavaScript,
      packed-package, transaction, and secret-redaction tests.

## Out of scope

- HTTP transport, cookies, password recovery, email verification, MFA, OAuth,
  device management, HTTP Basic, and Better Auth.

## Verification

- Password Auth publishes the four exact operations, opaque digest-backed
  sessions, immutable principal and safe session request values, and the
  application-owned `runWithSession()` execution helper without adding a Core
  authority mode.
- PostgreSQL tests prove rolling and absolute expiry, revocation, one-winner
  compare-and-swap rotation, User cascade cleanup, application isolation,
  password-policy upgrades, audited sign-up, transaction rollback, and explicit
  REST operation selection. The PostgreSQL private-store predicate now compiles
  `null` compare-and-swap expectations with SQL `IS NULL`.
- Core operation errors accept the existing namespaced form and the uppercase
  constant identifiers required by ADR-0235; malformed mixed forms remain
  rejected.
- `yarn constraints`, `yarn check:issues`, `yarn format:check`, `yarn typecheck`,
  `yarn test`, `yarn lint`, `yarn build`, `yarn test:pack:built`, and
  `yarn test:e2e:built` passed. The complete suite passed 404 files and 1,942
  tests, the packed-package suite passed 23 files and 118 tests, and the built
  E2E suite passed 61 files and 241 tests. Lint retained 77 pre-existing
  centralized line-budget warnings and no errors.
