# 748: Add an HTTP Basic authentication plugin

- Status: deferred
- Milestone: future
- Packages: future `@ultimabase/http-basic-auth-plugin`
- Depends on: 2304
- ADR: ADR-0224

## Goal

Provide the RFC HTTP Basic username-and-password request scheme for explicit
internal, service-to-service, development, or legacy use cases without turning
it into the default UltimaBase User authentication product.

## Acceptance criteria

- [ ] The package integrates only through the shared HTTP request-context
      capability and never imports REST, GraphQL, Hono, or Password Auth.
- [ ] Credentials are decoded and verified by one configured owner and never
      enter metadata, logs, errors, operations, hooks, or persistence plans.
- [ ] Missing, malformed, invalid, cross-application, and ambiguous credentials
      have explicit fail-closed and challenge behavior.
- [ ] TLS expectations, browser credential caching, replay exposure, rate
      limiting, and deployment warnings are documented before implementation.
- [ ] The plugin derives typed identity but grants no Access permission and
      cannot select Master authority.

## Tests

- [ ] Protocol, redaction, challenge, replay-boundary, application isolation,
      public export, and real HTTP tests.

## Out of scope

- User registration, password storage, sessions, cookies, Bearer tokens,
  Password Auth, Better Auth, authorization, and Master verification.
