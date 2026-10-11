# ADR-0323: HTTP foundation defaults and the Hono server

- Status: accepted
- Date: 2026-10-11
- Refines: the HTTP and Hono plugin records, ADR-0303 (`ultimabase.health()`), ADR-0312
  (environment defaults), ADR-0313 (warnings and hints), ADR-0316 (`httpRoutes`); applies
  ADR-0288
- Approval: decisions of the HTTP and Hono reviews (`docs/handoff/revue-plugins/http.md`,
  decisions 1 to 14, and `hono.md`, decisions 1 to 9, validated by the user on 2026-10-09);
  record accepted by the user on 2026-10-11
- Already implemented elsewhere: Hono listen defaults (ADR-0312), capability hints and the
  "nothing can answer" warnings (ADR-0313), `httpRoutes` for plugins (ADR-0316)

## Context

`httpPlugin` requires an `appId` and an application header, answers a preflight without policy
with 401, configures CORS through `browser` without a simple origin list, enables Master with
`{ enabled: true }`, has no timeout by default, no rate limit, security headers, access log or
global body limit, and serves no health route. Applications must write a plugin to add a route.
The Hono server waits for in-flight requests without bound on shutdown, cannot compress, always
requires a browser-policy owner in existing-application mode, and its package is named
`server-hono-plugin` while its factory is `honoServerPlugin`.

## Decision

**HTTP foundation (`@ultimabase/http-plugin`).**

1. **Optional application header.** Without the header a request goes to the only application
   of the process; a mismatching header is refused; `appId` is optional (default `'main'`);
   `requireApplicationId: true` restores the strict mode for several applications behind one
   proxy. An unknown `appId` answers `HTTP_APPLICATION_UNKNOWN` (404).
2. **CORS by origins.** `browser: { origins: ['https://app.example.com'], credentials? }`;
   allowed methods come from the mounted routes and allowed headers from the installed plugins'
   declarations (`Content-Type`, `Authorization` with authentication, the Master header only when
   Master is enabled). A preflight without a policy is refused with
   "CORS is not enabled: configure browser.origins" instead of 401.
3. **`master: true`** replaces `master: { enabled: true }`.
4. **Application routes without a plugin.** `httpPlugin({ routes: { 'GET /health/deep': handler } })`
   takes the same record as the plugin helper `httpRoutes` (ADR-0316), one vocabulary for both;
   the handler receives the request and its context.
5. **Built-in health route**, on by default at `/health`: 200 or 503 from `ultimabase.health()`,
   the path configurable, `health: false` to remove it. It serves every transport.
6. **Defaults.** `requestTimeoutMs` 30 000; body limit 1 MB for every route
   (`bodyLimit`, overridable per route and by a transport); security headers
   `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and HSTS on HTTPS, each
   configurable.
7. **Rate limiting by client address.** `trustProxy` (a hop count or trusted proxy addresses),
   `rateLimit: { default: { perMinute } }` with an in-memory store by default and a replaceable
   store; plugins may add stricter limits for their routes (authentication).
8. **Access log.** `accessLog: true` logs method, path, status, duration and request id through
   the application logger, never bodies or secrets.
9. **Port-free testing.** `ultimabase.plugin(httpPlugin).fetch(request)` runs a request through
   the same path as the network, without a server; a request missing network-connection headers
   gets a clear message.

**Hono server (`@ultimabase/hono-server-plugin`).**

10. **Renamed package** `@ultimabase/hono-server-plugin` (from `server-hono-plugin`), matching
    `honoServerPlugin`.
11. **Bounded shutdown.** `shutdownTimeoutMs` (default 10 000) bounds the wait for in-flight
    requests, then remaining connections are closed.
12. **Compression.** `compression: true`, off by default.
13. **`browserPolicyOwner`** is required in existing-application mode only when CORS is enabled.

## Consequences

- Documented: TLS and HTTP/2 come from the proxy or platform; a plugin must later be able to take
  over a connection (Realtime) and receive `multipart` bodies (Files); ETag and OpenTelemetry
  come later.
- Tests: header-less routing and `requireApplicationId`, 404 for an unknown application, CORS
  origins, derived methods and headers, preflight refusal message, `master: true`, application
  routes, health route states and options, timeout, body limits, security headers on HTTP and
  HTTPS, rate limiting behind proxies and store replacement, access log without bodies,
  `fetch()` testing, Hono rename, bounded shutdown, compression, optional policy owner; DX audit.
- Documentation impact: both (HTTP and Hono pages and READMEs, deployment notes).

## Out of scope

The REST, GraphQL, explorer and preset changes (migration 6.6b and 6.6c), servers for Bun, Deno
and Workers, ETag, OpenTelemetry.
