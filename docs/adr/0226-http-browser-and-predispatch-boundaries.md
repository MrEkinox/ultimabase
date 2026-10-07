# ADR-0226: HTTP browser and pre-dispatch boundaries are server-consistent

- Status: accepted
- Date: 2026-09-03
- Refines: ADR-0009, ADR-0209, ADR-0224
- Depends on: ADR-0009, ADR-0209, ADR-0224
- Refined by: ADR-0228, ADR-0241

## Context

Browser clients need custom application, Master, Authorization, content, and
correlation headers. Cross-origin requests therefore require a CORS preflight.
The preflight communicates the future method and header names, but not the
future application-ID header value or credentials, so it cannot select one
mounted UltimaBase application.

Application selection, Master verification, and session resolution also happen
before REST, GraphQL, or another route handler executes. Their failures need a
safe HTTP response even though no protocol-specific error encoder has begun.

When several UltimaBase applications share one server provider, per-application
browser policies or early-error contracts could make the same preflight URL
ambiguous and could produce cache-dependent security behavior.

## Decision

### Browser access is explicit and disabled by default

The HTTP plugin defines an immutable browser-origin policy contract. A concrete
server provider enforces it. Cross-origin responses and preflight are absent
unless the developer explicitly enables the policy.

One server provider has one effective browser policy. Applications mounted into
the same provider must declare structurally identical policies. A mismatch
rejects the conflicting application before it registers routes or changes
listener state; already mounted applications remain unchanged. Policies are
never unioned, intersected, or selected from an application ID that preflight
does not contain.

An existing externally owned server may instead declare that browser policy is
externally managed. In that mode UltimaBase emits no CORS headers. Mixing
external and UltimaBase ownership, or installing duplicate owners, is a startup
configuration error where the provider can identify it; UltimaBase does not
pretend it can introspect arbitrary external middleware.

UltimaBase does not permit wildcard origins with credential-enabled requests,
session cookies, Authorization, or Master-key transport. Those browser modes
use explicit origins and cache-safe `Vary` behavior.

### Preflight performs no application work

An accepted preflight may be answered without an application ID. It evaluates
only the server's effective browser policy, requested method, requested header
names, origin, and cache contract. It never:

- selects or reveals an application;
- parses an application-ID, Master, Authorization, cookie, or session value;
- creates a request context or invokes a credential resolver;
- performs Master verification or audit;
- invokes a route, Runtime stage, hook, policy, operation, or adapter.

Every subsequent application request still requires its canonical application
ID and complete normal request processing. CORS is not authentication,
authorization, CSRF protection, or a defense against non-browser clients.

### HTTP owns failures before route dispatch

The HTTP plugin owns one minimal protocol-neutral JSON error boundary for
application selection, malformed or duplicate security-sensitive headers,
context resolution, Master verification, and other failures before a route
handler begins. It includes a safe stable code, public message, and request ID,
and contains no registered application identity, route inventory, credential,
stack, plugin configuration, or internal diagnostic.

REST, GraphQL, and other transports own errors only after their selected handler
begins. The first HTTP and REST wire-contract decision fixes the exact early
envelope, status mapping, request-ID rules, and compatibility with REST errors
before implementation.

Duplicate application-ID, Master, Authorization, cookie, content-length, and
correlation headers fail closed according to that contract. A body-size limit is
enforced while consuming the stream rather than trusting `Content-Length`.
The server-provider boundary must preserve enough original header-cardinality
information to prove that rule or reject an input it cannot prove safe before
application work; a normalized Fetch header map is not assumed to retain that
evidence.

## Consequences

- A shared server never guesses an application from preflight.
- Multi-application CORS behavior is deterministic and cache-safe.
- Early credential and application failures have one owner and cannot leak
  protocol internals.
- Existing Hono applications retain explicit ownership instead of receiving
  silent duplicate middleware.

## Non-goals

- Treating CORS as a security boundary for Master or sessions.
- Defining cookie CSRF protection; the Password Auth contract owns it.
- Adding rate limiting, TLS termination, reverse-proxy trust, compression, CSP,
  browser token storage, or deployment presets.
