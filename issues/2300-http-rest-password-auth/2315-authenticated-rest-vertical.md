# 2315: Verify the authenticated REST vertical

- Status: completed
- Milestone: 23
- Packages: all HTTP, REST, Password Auth, policy, and PostgreSQL packages
- Depends on: 2311, 2314
- ADR: ADR-0113, ADR-0224, ADR-0228, ADR-0234, ADR-0235

## Goal

Prove the complete Parse-inspired developer journey from local password sign-up
through session-authenticated REST and policy-protected PostgreSQL data.

## Acceptance criteria

- [x] A public example defines application schemas, PostgreSQL, HTTP, Hono,
      REST, Password Auth, Access, roles, and ACL only through package exports.
- [x] A client signs up, logs in, receives an opaque session, sends it through
      Bearer, reads its typed principal, performs allowed CRUD, and receives
      policy denial for forbidden work.
- [x] Logout revokes the session and subsequent reuse fails before Runtime.
- [x] Cookie mode proves its configured security and cross-site boundary without
      changing Bearer or transport-neutral session behavior.
- [x] Anonymous, authenticated, authenticated-plus-Master, invalid session,
      invalid Master, and cross-application requests retain exact authority,
      identity, audit, and error semantics.
- [x] REST exposes only explicitly configured Password Auth operations through
      the generic operation transport bridge.
- [x] No package gains a direct dependency on a concrete Access, role, ACL,
      database, REST, GraphQL, or authentication consumer contrary to the
      accepted graph.
- [x] Two applications and parallel workers retain isolated Users, credentials,
      sessions, policies, routes, authorities, and PostgreSQL schemas.

## Tests

- [x] Source, built, packed-package, JavaScript, generated TypeScript, browser
      Fetch, Hono, and PostgreSQL Testcontainers journeys pass.
- [x] Security regression tests assert redaction, enumeration resistance,
      invalid-session fail-closed behavior, and Master provenance.

## Out of scope

- GraphQL, SDKs, HTTP Basic, Better Auth, OAuth, MFA, password recovery, email
  delivery, administration, files, and realtime.
