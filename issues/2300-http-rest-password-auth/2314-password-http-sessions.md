# 2314: Resolve Password Auth sessions over HTTP

- Status: planned
- Milestone: 23
- Packages: `@ultimabase/password-auth-plugin`, `@ultimabase/http-plugin`
- Depends on: 2304, 2313
- ADR: ADR-0113, ADR-0224, ADR-0226, ADR-0235

## Goal

Integrate Password Auth sessions with the shared HTTP context pipeline through
Bearer tokens by default and an explicitly configured secure cookie option.

## Acceptance criteria

- [ ] Password Auth contributes an owned HTTP context resolver without REST,
      GraphQL, Hono, or Core importing the password plugin.
- [ ] `Authorization: Bearer` is the documented default session transport.
- [ ] A cookie transport is opt-in and requires explicit secure, HttpOnly,
      SameSite, path, domain, expiration, and cross-site request protections.
- [ ] Cookie and cross-origin operation requires the exact effective server
      browser policy accepted by ADR-0226 and the CSRF contract accepted by
      ADR-0235.
- [ ] A missing session credential preserves the anonymous context; a present
      malformed, expired, revoked, or invalid credential fails before the
      handler and never falls back to anonymous execution.
- [ ] Ambiguous simultaneous credential sources fail rather than selecting one
      by precedence.
- [ ] Successful validation attaches exact immutable principal and session
      values while retaining Core authority and every existing safe context
      field.
- [ ] A simultaneous valid Master key may elevate the same context while
      retaining principal identity for audit; neither credential leaks.
- [ ] The resolver performs no authorization and grants no Access permission.

## Tests

- [ ] Bearer, cookie, missing, malformed, expired, revoked, ambiguous,
      cross-application, concurrent, session-plus-Master, and secret-redaction
      matrices.
- [ ] Fake HTTP and real Hono tests prove identical resolver behavior.

## Out of scope

- HTTP Basic, OAuth, Better Auth, browser SDK storage policy, refresh-token
  automation, password recovery, and authorization decisions.
