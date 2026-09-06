# 2313: Add Password Auth sessions and operations

- Status: planned
- Milestone: 23
- Packages: `@ultimabase/password-auth-plugin`, `@ultimabase/core`, `@ultimabase/typegen`
- Depends on: 2312
- ADR: ADR-0113, ADR-0193, ADR-0224, ADR-0234, ADR-0235

## Goal

Add opaque revocable sessions and transport-neutral authentication operations
to Password Auth through the existing plugin operation and request-value
boundaries.

## Acceptance criteria

- [ ] `signUp`, `login`, `logout`, and refresh are nominal versioned plugin
      operations with exact immutable input, result, error, and transaction
      contracts.
- [ ] Session tokens are cryptographically random opaque values, returned only
      at creation or rotation, stored only through a non-reversible verifier,
      and never accepted by Query terminals.
- [ ] Session storage and verifier metadata receive no automatic REST or GraphQL
      schema route, Typegen field, event, hook payload, or serialization path.
- [ ] Ordinary application Query and operation handles cannot inspect or mutate
      session storage; only the exact Password Auth callbacks authorized by the
      ADR-0234 and ADR-0235 can execute its internal persistence path.
- [ ] Sessions have explicit creation, idle or absolute expiration, revocation,
      rotation, User ownership, and application isolation semantics.
- [ ] Login verifies the configured password hash, upgrades stale parameters
      when required, and cannot disclose whether a User or credential failed.
- [ ] Logout invalidates the exact session and refresh rotates rather than
      extending reusable credential material silently.
- [ ] A validated session derives immutable principal and session context values
      while retaining anonymous Core authority.
- [ ] Any temporary internal authority used to resolve credentials or sessions
      is audited, never escapes as caller authority, and is absent from the
      derived public request context.
- [ ] `runWithSession()` validates one raw token before entering an
      application-owned asynchronous execution scope and never retains the raw
      token in Runtime data.
- [ ] Authentication establishes identity only; Access and other policies make
      every authorization decision.

## Tests

- [ ] Sign-up, login, invalid credentials, expiration, revocation, rotation,
      concurrent refresh, password-hash upgrade, logout, and application
      isolation tests.
- [ ] Operation transport, Runtime context propagation, Typegen, JavaScript,
      packed-package, transaction, and secret-redaction tests.

## Out of scope

- HTTP transport, cookies, password recovery, email verification, MFA, OAuth,
  device management, HTTP Basic, and Better Auth.
