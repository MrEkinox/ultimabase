# 2315: Verify the authenticated REST vertical

- Status: planned
- Milestone: 23
- Packages: all HTTP, REST, Password Auth, policy, and PostgreSQL packages
- Depends on: 2311, 2314
- ADR: ADR-0113, ADR-0224 and the issue 2302 REST and 2318 Password Auth contracts

## Goal

Prove the complete Parse-inspired developer journey from local password sign-up
through session-authenticated REST and policy-protected PostgreSQL data.

## Acceptance criteria

- [ ] A public example defines application schemas, PostgreSQL, HTTP, Hono,
      REST, Password Auth, Access, roles, and ACL only through package exports.
- [ ] A client signs up, logs in, receives an opaque session, sends it through
      Bearer, reads its typed principal, performs allowed CRUD, and receives
      policy denial for forbidden work.
- [ ] Logout revokes the session and subsequent reuse fails before Runtime.
- [ ] Cookie mode proves its configured security and cross-site boundary without
      changing Bearer or transport-neutral session behavior.
- [ ] Anonymous, authenticated, authenticated-plus-Master, invalid session,
      invalid Master, and cross-application requests retain exact authority,
      identity, audit, and error semantics.
- [ ] REST exposes only explicitly configured Password Auth operations through
      the generic operation transport bridge.
- [ ] No package gains a direct dependency on a concrete Access, role, ACL,
      database, REST, GraphQL, or authentication consumer contrary to the
      accepted graph.
- [ ] Two applications and parallel workers retain isolated Users, credentials,
      sessions, policies, routes, authorities, and PostgreSQL schemas.

## Tests

- [ ] Source, built, packed-package, JavaScript, generated TypeScript, browser
      Fetch, Hono, and PostgreSQL Testcontainers journeys pass.
- [ ] Security regression tests assert redaction, enumeration resistance,
      invalid-session fail-closed behavior, and Master provenance.

## Out of scope

- GraphQL, SDKs, HTTP Basic, Better Auth, OAuth, MFA, password recovery, email
  delivery, administration, files, and realtime.
