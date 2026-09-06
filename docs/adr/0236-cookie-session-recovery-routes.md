# ADR-0236: Cookie credential issuance ignores one stale session cookie

- Status: accepted
- Date: 2026-09-06
- Refines: ADR-0235
- Depends on: ADR-0113, ADR-0226, ADR-0235

## Context

ADR-0235 requires every present invalid session credential to fail before route
dispatch. It also makes the Password Auth session cookie `HttpOnly` and assigns
`/auth/v1/sign-up` and `/auth/v1/login` the job of issuing and replacing that
cookie.

A browser automatically sends an existing cookie to both issuance routes. If a
session was revoked, deleted, rotated without the response reaching the client,
or otherwise became invalid before its cookie expiry, strict resolution would
reject login before the route could replace the credential. Browser JavaScript
cannot remove the `HttpOnly` cookie, leaving no recovery path.

## Decision

The Password Auth HTTP resolver treats its configured session cookie as absent
only on `/auth/v1/sign-up` and `/auth/v1/login`. Those operations authenticate
new credentials and do not inherit an existing session identity. A successful
response replaces the cookie.

The exception does not create a general invalid-credential fallback:

- `Authorization` remains strictly validated on every route;
- simultaneous Bearer and configured cookie sources remain ambiguous and fail;
- logout, refresh, REST, GraphQL, and every other route still reject a present
  malformed, expired, revoked, foreign, or unknown session before dispatch;
- all four cookie routes still require the exact application ID, JSON media
  type, non-null allowed Origin, credentialed exact-origin browser policy, and
  the preflight contract from ADR-0226 and ADR-0235;
- unsafe requests authenticated by a cookie apply the same Origin and JSON
  proof outside the four authentication routes.

The recovery exception attaches no principal, changes no Core authority, grants
no authorization, and exposes no raw cookie value to a handler.

## Consequences

- A stale `HttpOnly` cookie cannot lock a browser out of sign-up or login.
- Credential-consuming routes retain fail-closed behavior.
- Cookie recovery stays local to the two exact issuance paths and cannot become
  an anonymous fallback for application behavior.

## Non-goals

- Client-side cookie management, logout-all, device sessions, automatic refresh,
  OAuth, password recovery, or a generic authentication recovery hook.
