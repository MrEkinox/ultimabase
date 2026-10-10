# Transports

Transports translate requests and responses. They do not contain SQL or business-policy shortcuts.

The optional HTTP package provides application identity, immutable route
composition, and the provider-facing Fetch boundary without opening a socket.
REST, Password Auth, and the first concrete Hono server provider are shipped as
independent optional packages. Network-independent GraphQL, the Yoga adapter,
and separate GraphiQL and Apollo Sandbox plugins are shipped siblings.

## HTTP

`httpPlugin({ appId, master, requestTimeoutMs })` materializes one
application-local route graph. Route
owners contribute standard `Request` to `Response` handlers through the public
HTTP capability. One initialized application owns the server boundary in each
JavaScript realm; the provider checks its expected identity against the ordered original `X-UltimaBase-Application-Id` header evidence. External and
framework-owned providers consume the same graph.
`dispatchHttpApplicationRequest(owner, input)` dispatches to that one optional
owner. With no owner, it preserves original-header validation, request
correlation, privacy headers and safe application rejection. The application
fetch boundary itself owns exact browser-bootstrap path validation.

Every selected route starts with one anonymous application-bound Core context.
Optional credential plugins contribute ordered resolvers that add typed
immutable values without changing authority. An explicitly enabled canonical
Master header is verified and audited by the selected application's
`MasterAuthority` after those resolvers; successful elevation retains their
values. Fetch cancellation and the optional deadline share the same context
signal through handlers, Runtime, transactions, and response completion.
Ambiguous sensitive headers and all other pre-dispatch failures use the safe
HTTP envelope. HTTP owns the browser policy, while the optional Hono provider
owns sockets and listener lifecycle. Independent applications run in separate
processes, workers, or containers.

## REST

REST contributes generated CRUD, query, and explicitly selected plugin-operation
routes through the optional HTTP application capability. The initial concrete
server implementation is Hono on Node.js, with port `1337` by default. REST does
not import Hono, GraphQL, authentication, Access, or a database adapter.

## GraphQL

`@ultimabase/graphql-plugin` generates and executes one application-local,
network-independent `GraphQLSchema`. It uses Core's narrow request executor and
does not import HTTP, Yoga, REST, authentication, policy, or a database adapter.
Generated reads and mutations normalize into the same logical Runtime operations
as direct TypeScript and REST. Relay `first` and `after` map to Core `take`
and `after`; edge cursors are the unsigned positions of Core's shared cursor
encoder (`@ultimabase/core/plugin`, ADR-0309).

`@ultimabase/graphql-yoga-plugin` is an explicit sibling adapter. It requires
the GraphQL application and shared HTTP capabilities, mounts `POST /graphql` by
default, and delegates to the same networkless executor. It also provides the
provider-neutral `graphqlHttpEndpointCapability`; developer tools can consume
the selected path without importing or naming Yoga.

Custom schemas from Nexus, Pothos, GraphQL Tools, or another builder are merged
as completed `GraphQLSchema` instances. Non-overlapping fields may extend
generated types; conflicting fields fail startup with owner provenance.

Plugin operations remain private unless their exact tokens are selected and
their owners provide canonical GraphQL wire bindings. This lets Password Auth
expose sign-up, login, refresh, and logout without either package importing the
other.

GraphiQL and Apollo Sandbox are separate optional plugins. Their browser routes
are development-only unless production use is explicitly enabled. Each uses
the fixed provider-neutral endpoint for the already selected application; it
does not embed credentials, authority, or an application switcher.

Conditional field visibility makes affected GraphQL fields nullable. Dynamic
Access and ACL enforcement remains in Runtime rather than changing the schema
per request.

## Public protection warning

Every public exposure that does not explicitly acknowledge protection
uncertainty emits `UNVERIFIED_PUBLIC_TRANSPORT_PROTECTION`. The diagnostic
reports `policy.providerPresence` as `none` or `present`, but its coverage is
always `unverified`: installing a policy provider never silences the warning or
proves that every exposed operation is protected.

An explicit transport acknowledgement accepts only that uncertainty. It does
not grant access, prove policy coverage, bypass policy, or create Master
authority. Transports still normalize into the shared Runtime pipeline.

Every public HTTP application request identifies the sole active application. When
the developer explicitly enables Master transport, the HTTP plugin may exchange
that application's raw Master key through Core's narrow request executor. Core
verifies and audits the credential before producing private application-owned
provenance; flags, shaped contexts, serialized grants, foreign credentials, and
other request structure never create Master.

Cross-origin browser access is disabled by default. The application declares
one explicit browser policy, and infrastructure-only
preflight never selects an application or invokes Runtime behavior. The HTTP
plugin owns safe errors before route dispatch; REST or GraphQL owns later
protocol errors. A real cross-origin request still supplies its public
application ID and passes normal credentials, authorization, hooks, and
persistence. CORS controls browser response visibility; it does not provide
authentication, authorization, CSRF protection, or protection from non-browser
clients.
