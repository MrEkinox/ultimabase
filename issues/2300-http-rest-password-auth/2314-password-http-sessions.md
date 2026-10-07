# 2314: Resolve Password Auth sessions over HTTP

- Status: completed
- Milestone: 23
- Packages: `@ultimabase/password-auth-plugin`, `@ultimabase/http-plugin`
- Depends on: 2304, 2313
- ADR: ADR-0113, ADR-0224, ADR-0226, ADR-0235, ADR-0236, ADR-0237

## Goal

Integrate Password Auth sessions with the shared HTTP context pipeline through
Bearer tokens by default and an explicitly configured secure cookie option.

## Acceptance criteria

- [x] Password Auth contributes an owned HTTP context resolver without REST,
      GraphQL, Hono, or Core importing the password plugin.
- [x] `Authorization: Bearer` is the documented default session transport.
- [x] A cookie transport is opt-in and requires explicit secure, HttpOnly,
      SameSite, path, domain, expiration, and cross-site request protections.
- [x] Cookie and cross-origin operation requires the exact effective server
      browser policy accepted by ADR-0226 and the CSRF contract accepted by
      ADR-0235.
- [x] A missing session credential preserves the anonymous context; a present
      malformed, expired, revoked, or invalid credential fails before the
      handler and never falls back to anonymous execution.
- [x] Ambiguous simultaneous credential sources fail rather than selecting one
      by precedence.
- [x] Successful validation attaches exact immutable principal and session
      values while retaining Core authority and every existing safe context
      field.
- [x] A simultaneous valid Master key may elevate the same context while
      retaining principal identity for audit; neither credential leaks.
- [x] The resolver performs no authorization and grants no Access permission.

## Tests

- [x] Bearer, cookie, missing, malformed, expired, revoked, ambiguous,
      cross-application, concurrent, session-plus-Master, and secret-redaction
      matrices.
- [x] Fake HTTP and real Hono tests prove identical resolver behavior.

## Out of scope

- HTTP Basic, OAuth, Better Auth, browser SDK storage policy, refresh-token
  automation, password recovery, and authorization decisions.

## Verification

- Password Auth now contributes the default strict Bearer resolver and an
  explicit cookie route family that executes the same four operation tokens.
  Cookie responses expose only safe principal and session data while the raw
  token remains in the secure host-only cookie.
- ADR-0236 limits stale-cookie recovery to sign-up and login. ADR-0237 lets
  generic HTTP resolvers validate and consume the one effective immutable
  browser policy without a reverse capability dependency. Cookie mode also
  requires HTTP as a non-ordering compatible peer.
- PostgreSQL and real-listener tests prove missing, malformed, expired,
  revoked, ambiguous, foreign, concurrent, session-plus-Master, rotation,
  logout, CSRF, stale-cookie recovery, isolation, and secret-redaction cases.
- `yarn constraints`, `yarn check:issues`, `yarn format:check`, `yarn typecheck`,
  `yarn test`, `yarn lint`, `yarn build`, `yarn test:pack:built`, and
  `yarn test:e2e:built` passed. The complete suite passed 406 files and 1,950
  tests, the packed-package suite passed 23 files and 118 tests, and the built
  E2E suite passed 62 files and 246 tests. Lint retained 77 pre-existing
  centralized line-budget warnings and no errors.
