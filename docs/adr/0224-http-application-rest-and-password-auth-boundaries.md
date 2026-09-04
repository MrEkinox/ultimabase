# ADR-0224: HTTP application, REST, and password authentication boundaries

- Status: accepted
- Date: 2026-09-03
- Refines: ADR-0009, ADR-0010, ADR-0071, ADR-0113, ADR-0191, ADR-0193, ADR-0206, ADR-0209
- Depends on: ADR-0186, ADR-0190, ADR-0193, ADR-0206, ADR-0209
- Refined by: ADR-0225, ADR-0226, ADR-0228

## Context

The original transport backlog predates the trusted capability kernel. It puts
a generic HTTP service contract in Core, lets GraphQL Yoga depend on REST
request-context work, and delays authentication until a combined REST and
GraphQL vertical is complete. Those dependencies no longer match the accepted
plugin direction or the desired product sequence.

UltimaBase also needs a Parse-inspired HTTP application boundary. Every public
HTTP request identifies its application, and trusted test or server clients may
present that application's Master key. At the same time, transport input must
not manufacture Master through a flag, structural lookalike, foreign grant, or
credential belonging to another application.

The first official authentication experience should use a local User and
password followed by an opaque session. HTTP Basic and Better Auth solve
different problems and must not become modes of that first plugin.

## Decision

### HTTP is one optional official plugin boundary

The neutral Fetch-compatible host contract belongs to
`@ultimabase/http-plugin`, not Core and not a concrete server implementation.
The package owns versioned application-lifetime capabilities for:

- public application identification;
- owned route and mount declarations;
- collision detection;
- ordered request-context resolution;
- mounting Fetch-compatible handlers into one selected HTTP server provider.

`@ultimabase/server-hono-plugin` is the first server provider. It depends on
the HTTP plugin and owns Hono, Node listening, port configuration, and graceful
shutdown. The HTTP plugin contains no Hono, Express, Fastify, REST, GraphQL, or
database behavior.

The HTTP package is a real plugin and is created only when its first
implementation issue begins. Core continues to own only the generic capability
host, request primitives, Runtime shell, privileges, and Master authority.

### Public application identity is mandatory

Each HTTP-enabled UltimaBase application has one non-empty public `appId`.
Every public HTTP application request must carry it through the canonical
`X-UltimaBase-Application-Id` header. The only exception is an explicitly
configured infrastructure-only browser preflight. The identifier is routing
identity, not a secret or authorization proof.

The HTTP boundary resolves the identifier to one exact mounted application
before invoking REST, GraphQL, authentication, or Runtime. Missing, unknown,
duplicate, and ambiguously mounted identifiers fail safely. Multiple
applications may share one server only when their identifiers remain unique
within that server provider.

The public `appId` is deployment configuration. It is not Core's private
application object identity, does not enter schema declarations or the Query
AST, and grants no permission by itself.

### A valid application and Master key pair may select Master

An HTTP application may explicitly enable the canonical
`X-UltimaBase-Master-Key` header. Enabling the boundary requires a configured
Core `MasterAuthority`; the HTTP plugin requests the critical
`authority:elevate` privilege with a focused reason.

The request's `appId` first selects one exact application. Only that
application's authority verifies the raw key and creates its opaque grant.
Successful verification then enters the application-owned shell, awaits the
mandatory audit, and creates a Master context carrying the existing private
application and authority provenance.

The raw key is consumed only at this verification boundary. It never enters
request metadata, typed context values, plugin inputs, logical operations,
persistence plans, hooks, diagnostics, errors, or logs. A missing key leaves
the request at its otherwise derived authority. A present but invalid key,
missing `appId`, foreign application key, audit failure, or disabled boundary
rejects the request and never falls back to anonymous execution.

Transport fields such as `useMasterKey`, grants, contexts, authority-shaped
objects, or alternative headers never create Master. A valid raw credential is
verified rather than trusted structurally, so transport input still cannot
forge authority.

Browser-based integration tests may inject the pair at execution time. The
Master key must never be compiled into a distributed frontend bundle. REST and
GraphQL receive the same already validated HTTP context and contain no
Master-key verification logic of their own.

An explicitly configured browser-origin policy may answer infrastructure-only
preflight requests without an application ID. Preflight selects no application,
resolves no context or credential, performs no Master audit, and invokes no
route handler or Runtime behavior. Every real request still requires its
application ID and passes through the complete application and authority
boundary.

### REST and GraphQL are siblings

`@ultimabase/rest-plugin` depends on the HTTP plugin and converts its own wire
contract into existing Query and Operation ASTs. It never imports Hono,
GraphQL, authentication, Access, PostgreSQL, or another concrete provider.

`@ultimabase/graphql-plugin` remains network-independent. It generates,
merges, and executes GraphQL schemas without importing HTTP or REST.
`@ultimabase/graphql-yoga-plugin` depends on the GraphQL and HTTP plugins and
mounts Yoga through the shared HTTP contract. Neither GraphQL package imports
REST.

REST is implemented and verified first. Password authentication follows on the
working REST vertical. GraphQL then reuses the same HTTP application and
request-context boundary without becoming a prerequisite for either feature.

### Password authentication is the first local authentication product

The first official authentication package is
`@ultimabase/password-auth-plugin`. It owns its User schema, password
credential processing, opaque sessions, typed principal and session values,
and the `signUp`, `login`, `logout`, and refresh operations.

Username and password are presented only to authentication operations. Normal
requests reuse an opaque session through `Authorization: Bearer` by default or
an explicitly configured secure cookie. The plugin may contribute an HTTP
context resolver through the HTTP package, but REST and GraphQL consume only
the resulting typed context.

Authentication establishes identity and grants no authorization. Access, ACL,
roles, and independent policies consume neutral request-subject contracts and
never import the password plugin. Missing credentials may remain anonymous;
present malformed or invalid credentials fail without leaking secrets.

No generic `@ultimabase/auth-plugin` package is introduced. Core's existing
request values, plugin operations, capabilities, and protected-policy contracts
already provide the proven common boundaries. A shared authentication engine
requires evidence from at least two concrete implementations.

HTTP Basic authentication remains a separately deferred
`@ultimabase/http-basic-auth-plugin` because it resends a username and password
with requests rather than creating a User session. Better Auth remains a
separate future integration and does not depend on the password plugin.

## Consequences

- Core gains no HTTP service, public application ID, User, password, session,
  REST, GraphQL, or server implementation.
- The HTTP plugin becomes the only shared dependency among Hono, REST, Yoga,
  and HTTP authentication integrations.
- An application ID is required for every public HTTP application request but
  is never presented as a security secret.
- Master access from HTTP remains explicit, application-bound, audited, and
  impossible to select with unverified structure.
- A frontend test can deliberately exercise Master REST behavior without
  weakening application isolation or placing the raw key in Runtime data.
- REST can ship before authentication and GraphQL; Password Auth can then prove
  a complete login and authenticated CRUD journey against the same Runtime.
- The original issues 601 through 607 are superseded by milestone 23. GraphQL
  issues remain planned but depend only on shared HTTP work where networking is
  required.

## Non-goals

- Choosing the exact REST v1 paths, verbs, query encoding, response envelope,
  or route-exposure defaults; issue 2302 owns that decision.
- Choosing the exact Password Auth v1 User, credential, session, cookie, or
  CSRF contract; issue 2318 owns that decision.
- Providing a production browser with a Master key or claiming an `appId` is a
  client secret.
- Adding client, JavaScript, REST API, or read-only Master keys.
- Implementing HTTP Basic, Better Auth, OAuth, MFA, password recovery, email
  verification, rate limiting, or a frontend SDK in milestone 23.
- Making REST, GraphQL, Password Auth, Access, or Hono mandatory.
