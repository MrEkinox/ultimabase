# 2318: Decide the Password Auth v1 contract

- Status: completed
- Milestone: 23
- Packages: `@ultimabase/password-auth-plugin`, architecture documentation
- Depends on: 2311
- ADR: ADR-0234, ADR-0235

## Goal

Accept the exact local Password Auth v1 identity, credential, session, and HTTP
contract before implementation creates a durable security or developer-facing
surface.

## Acceptance criteria

- [x] An accepted ADR fixes the default User schema identity and the supported
      schema extension or composition boundary.
- [x] User, credential, and session schema visibility is explicit; internal
      storage receives no automatic REST or GraphQL route and ordinary Query or
      Typegen surfaces expose no secret verifier.
- [x] The ADR decides how Password Auth alone reads and mutates its private
      credential and session storage without granting ordinary application
      queries access, issuing raw adapter calls, or relying on Access being
      installed.
- [x] If the decision reuses audited internal Master elevation, its
      `authority:elevate` privilege, authority-configuration requirement,
      per-request audit cost, failure behavior, and non-propagation into the
      caller context are explicit; a new protected storage mechanism requires
      its own ADR and issue before 2312 starts.
- [x] Username normalization, uniqueness, casing, length, and public failure
      behavior are explicit; email login is not included accidentally.
- [x] Password length, normalization, rejection, hashing, parameter upgrade,
      and secret-retention boundaries are explicit.
- [x] The password-hashing dependency is selected only after current security,
      maintenance, native-runtime, package, and deployment evidence is
      reviewed.
- [x] Opaque session token generation, verifier storage, expiration,
      revocation, rotation, refresh, concurrency, and application isolation
      semantics are fixed.
- [x] `signUp`, `login`, `logout`, and refresh inputs, results, stable public
      errors, transaction boundaries, and enumeration resistance are fixed.
- [x] The typed principal and session request values remain distinct from Core
      authority and grant no authorization.
- [x] Bearer remains the default HTTP transport; optional cookie naming,
      attributes, origin behavior, and CSRF protection are explicit before
      cookie mode can ship.
- [x] Realistic direct-operation, Fetch, and TypeScript examples are reviewed
      before the ADR becomes accepted.

## Tests

- [x] `yarn check:issues` and `yarn format:check` pass for the decision change.

## Completion evidence

- ADR-0234 accepts exact owner-private plugin storage and issue 2322 schedules
  its implementation before Password Auth.
- ADR-0235 records the explicitly approved Password Auth v1 identity,
  credential, hashing, session, operation, Master, Bearer, cookie, and CSRF
  contracts.
- Current Node, Argon2, NIST, RFC 9106, OWASP password-storage, and OWASP CSRF
  evidence is linked from ADR-0235.
- `yarn check:issues` passed.
- `yarn format:check` passed.

## Out of scope

- Implementing Password Auth, HTTP, REST, or database behavior.
- Email login, password recovery, email verification, MFA, OAuth, HTTP Basic,
  Better Auth, device management, or a frontend SDK.
