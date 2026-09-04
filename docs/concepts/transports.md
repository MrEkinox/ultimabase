# Transports

Transports translate requests and responses. They do not contain SQL or business-policy shortcuts.

The optional HTTP package now provides application identity, immutable route
composition, and the provider-facing Fetch boundary without opening a socket.
The REST and concrete server sections below describe the remaining accepted
milestone 23 target; those packages are not shipped yet.

## HTTP

`httpPlugin({ appId })` materializes one application-local route graph. Route
owners contribute standard `Request` to `Response` handlers through the public
HTTP capability, while server providers select a mounted application from the
ordered original `X-UltimaBase-Application-Id` header evidence. External and
framework-owned providers consume the same graph; request contexts, Master
verification, browser policy, and sockets remain later issue-owned layers.

## REST

REST contributes generated CRUD, query, and explicitly selected plugin-operation
routes through the optional HTTP application capability. The initial concrete
server implementation is Hono on Node.js, with port `1337` by default. REST does
not import Hono, GraphQL, authentication, Access, or a database adapter.

## GraphQL

GraphQL Core generates and executes a network-independent `GraphQLSchema`. Yoga provides GraphQL over HTTP.

Custom schemas from Nexus, Pothos, GraphQL Tools, or another builder are merged as completed `GraphQLSchema` instances. Non-overlapping fields may extend generated types; conflicting fields fail startup.

Conditional field visibility makes affected GraphQL fields nullable.

## Public protection warning

Every public exposure that does not explicitly acknowledge protection
uncertainty emits `UNVERIFIED_PUBLIC_TRANSPORT_PROTECTION`. The diagnostic
reports `policy.providerPresence` as `none` or `present`, but its coverage is
always `unverified`: installing a policy provider never silences the warning or
proves that every exposed operation is protected.

An explicit transport acknowledgement accepts only that uncertainty. It does
not grant access, prove policy coverage, bypass policy, or create Master
authority. Transports still normalize into the shared Runtime pipeline.

Every public HTTP application request identifies one mounted application. When
the developer explicitly enables Master transport, the HTTP plugin may exchange
that application's raw Master key through Core's narrow request executor. Core
verifies and audits the credential before producing private application-owned
provenance; flags, shaped contexts, serialized grants, foreign credentials, and
other request structure never create Master.

Cross-origin browser access is disabled by default. Applications sharing one
server provider use one identical effective policy, and infrastructure-only
preflight never selects an application or invokes Runtime behavior. The HTTP
plugin owns safe errors before route dispatch; REST or GraphQL owns later
protocol errors.
