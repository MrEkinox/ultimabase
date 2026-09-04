# 2305: Implement the Hono server provider

- Status: planned
- Milestone: 23
- Packages: `@ultimabase/server-hono-plugin`, `@ultimabase/http-plugin`
- Depends on: 2303
- ADR: ADR-0009, ADR-0224, ADR-0226

## Goal

Provide the first Node.js HTTP server implementation for the shared HTTP
capability without making Hono a dependency of REST, GraphQL, or Core.

## Acceptance criteria

- [ ] Create a complete publishable `packages/server-hono-plugin` workspace
      exporting `honoServerPlugin()`.
- [ ] An existing Hono application can be supplied without the plugin taking
      ownership of its lifecycle.
- [ ] Otherwise the plugin creates and owns a server listening on configurable
      host and port, with port `1337` as the documented default.
- [ ] All application routes are mounted through the HTTP plugin's immutable
      route graph and standard Fetch handler contract.
- [ ] The Node boundary preserves original sensitive-header cardinality before
      constructing the normalized Fetch request and rejects ambiguity before
      application selection.
- [ ] Single-application, shared multi-application, and externally owned Hono
      assembly follow the accepted ownership contract without a global mutable
      registry or partial route registration.
- [ ] Startup occurs only after route and capability validation; stop and
      disposal close only resources owned by the exact application instance.
- [ ] Startup failure, address conflicts, repeated lifecycle calls, and aborted
      startup clean up deterministically.
- [ ] Hono and `@hono/node-server` remain private implementation dependencies.
- [ ] The manifest declares `environment:network`; it declares
      `environment:process` only if the implementation directly uses process
      APIs, and requests no unnecessary Core privilege.

## Tests

- [ ] Existing-app, auto-server, host, port, startup failure, graceful shutdown,
      repeated lifecycle, multiple application, and parallel worker tests.
- [ ] Public exports, archive allowlist, ATTW, publint, and packed consumer tests.

## Out of scope

- REST, GraphQL, authentication, TLS termination, reverse-proxy trust, CORS,
  rate limiting, compression, and deployment presets.
