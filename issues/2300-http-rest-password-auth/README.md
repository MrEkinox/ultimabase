# Milestone 23 — HTTP, REST, and password authentication

- Status: in-progress

Deliver the first public client-to-PostgreSQL vertical through optional official
HTTP, Hono, REST, and Password Auth plugins. The milestone preserves one
Runtime pipeline, application-owned Master provenance, optional policy engines,
and transport-independent GraphQL.

## Execution order

1. [x] [2301 — Decide HTTP, REST, and Password Auth boundaries](2301-http-rest-password-auth-boundaries.md)
2. [x] [2321 — Decide HTTP browser and pre-dispatch boundaries](2321-http-browser-predispatch-decision.md)
3. [x] [2302 — Decide the experimental HTTP and REST v1 wire contract](2302-rest-v1-wire-contract.md)
4. [x] [2319 — Implement the Core application request execution capability](2319-core-request-execution-capability.md)
5. [x] [2303 — Implement the HTTP application capability](2303-http-application-capability.md)
6. [x] [2304 — Add HTTP request contexts and Master verification](2304-http-context-and-master.md)
7. [x] [2305 — Implement the Hono server provider](2305-hono-server-provider.md)
8. [x] [2317 — Implement the HTTP browser boundary](2317-http-browser-boundary.md)
9. [x] [2306 — Generate REST route metadata](2306-rest-route-metadata.md)
10. [x] [2307 — Normalize REST reads and queries](2307-rest-query-normalization.md)
11. [x] [2320 — Execute REST schema reads](2320-rest-read-execution.md)
12. [x] [2308 — Execute REST schema mutations](2308-rest-mutation-execution.md)
13. [x] [2309 — Expose plugin operations through REST](2309-rest-plugin-operations.md)
14. [x] [2310 — Stabilize REST responses and errors](2310-rest-response-error-contract.md)
15. [x] [2311 — Verify the anonymous and Master REST vertical](2311-rest-public-vertical.md)
16. [ ] [2318 — Decide the Password Auth v1 contract](2318-password-auth-contract.md)
17. [ ] [2312 — Implement local password identities](2312-password-identities.md)
18. [ ] [2313 — Add password sessions and authentication operations](2313-password-sessions-operations.md)
19. [ ] [2314 — Resolve Password Auth sessions over HTTP](2314-password-http-sessions.md)
20. [ ] [2315 — Verify the authenticated REST vertical](2315-authenticated-rest-vertical.md)
21. [ ] [2316 — Audit and close the HTTP and REST milestone](2316-http-rest-final-audit.md)

## Accepted boundaries

- `@ultimabase/http-plugin` owns public application IDs, Fetch-compatible
  route composition, request-context resolution, and the explicit HTTP Master
  verification boundary.
- Core exposes transports only to the narrow application request execution
  capability accepted by ADR-0225; no complete engine or application object is
  shared.
- `@ultimabase/server-hono-plugin` owns Hono and Node network lifecycle.
- `@ultimabase/rest-plugin` owns only REST route generation, wire
  normalization, serialization, and Runtime delegation.
- `@ultimabase/password-auth-plugin` owns local User/password identities,
  opaque sessions, authentication operations, and typed request values.
- Every HTTP application request carries `X-UltimaBase-Application-Id`. The
  application ID is public routing identity and grants no permission;
  infrastructure-only browser preflight is the sole configured exception.
- An explicitly enabled `X-UltimaBase-Master-Key` is verified only by the
  selected application's Core authority and every successful elevation is
  audited.
- Password Auth uses Bearer sessions by default and may enable a secure cookie.
  HTTP Basic and Better Auth remain separate deferred plugins.
- One server provider has one effective browser policy. Cross-origin access is
  disabled by default; a mismatch rejects the conflicting application before
  its route or listener effects and leaves existing mounts unchanged.
- REST and GraphQL are siblings. GraphQL Core remains network-independent and
  Yoga depends on HTTP rather than REST.

## Stop boundaries

- Issue 2302 must obtain explicit approval for the complete public HTTP and REST
  v1 wire contract, including shared-server ownership, sensitive-header
  cardinality proof, pre-dispatch errors, request limits, and provenance-aware
  route defaults, before any REST route implementation begins.
- Issue 2318 must obtain explicit approval for the Password Auth v1 identity,
  credential, internal storage execution, session, cookie, and CSRF contract
  before implementation begins.
- New authority modes, client keys, read-only Master keys, delegated Master,
  or unaudited elevation require a separate ADR and user approval.
- Password recovery, email verification, MFA, OAuth, HTTP Basic, Better Auth,
  rate limiting, OpenAPI, and SDK work remain outside this milestone unless
  separately activated.

## Completion gate

The milestone closes only after source, built, packed-package, Typegen,
multi-application, browser-facing HTTP, pre-dispatch failure, REST read and
mutation, and PostgreSQL Testcontainers evidence proves anonymous,
session-authenticated, and audited Master execution through the same Runtime
pipeline. The final gate runs repository constraints, issue validation,
typecheck, tests, lint, formatting, build, package archives, coverage, and
relevant E2E suites.
