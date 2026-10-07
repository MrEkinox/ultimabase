# 2317: Implement the HTTP browser boundary

- Status: completed
- Milestone: 23
- Packages: `@ultimabase/http-plugin`, `@ultimabase/server-hono-plugin`
- Depends on: 2305, 2321
- ADR: ADR-0224, ADR-0226

## Goal

Make explicitly authorized cross-origin browser requests possible without
weakening application selection, credential verification, or Runtime policy.

## Acceptance criteria

- [x] Cross-origin access is disabled by default and enabled only through an
      explicit immutable origin, method, header, credential, and cache policy.
- [x] Each server provider resolves one effective policy; applications sharing
      it must declare structurally identical policies, and a mismatch rejects
      the conflicting application before its route or listener effects while
      leaving already mounted applications unchanged.
- [x] Wildcard origins cannot compose with credential-enabled requests,
      session cookies, Authorization, or Master-key transport.
- [x] Preflight recognizes the canonical application ID, Master key,
      Authorization, content, and correlation header names needed by installed
      HTTP routes without receiving their future values.
- [x] Preflight is infrastructure-only: it selects no application, resolves no
      request context or credential, performs no Master audit, and invokes no
      route handler, Runtime stage, hook, policy, or adapter.
- [x] Every real request following preflight still requires the canonical
      application ID and passes through normal application and authority
      resolution.
- [x] Origin reflection, preflight caching, and `Vary` behavior are safe for
      shared caches and multiple mounted applications.
- [x] Rejections expose no registered application ID, route inventory,
      credential, or secret information.
- [x] Supplying an existing Hono application has one documented CORS owner and
      cannot silently produce duplicate or contradictory headers.
- [x] Externally managed browser policy causes UltimaBase to emit no CORS
      headers; mixing external and UltimaBase ownership fails explicitly where
      ownership can be validated.
- [x] Documentation states that CORS is neither authentication,
      authorization, CSRF protection, nor a defense against non-browser
      clients.

## Tests

- [x] Real browser tests cover allowed and rejected origins, simple requests,
      preflight, Bearer headers, cookie credentials, Master headers, cache
      variation, and an existing Hono application.
- [x] Tests prove preflight never reaches application context, audit, Runtime,
      hooks, policies, or persistence.

## Out of scope

- TLS termination, reverse-proxy trust, rate limiting, compression, CSP, CSRF,
  browser token storage, frontend bundling, and deployment presets.
