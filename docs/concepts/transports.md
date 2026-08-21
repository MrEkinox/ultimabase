# Transports

Transports translate requests and responses. They do not contain SQL or business-policy shortcuts.

## REST

REST mounts generated CRUD and query routes through an HTTP-server service. The initial server implementation is Hono on Node.js, with port `1337` by default.

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
not grant access, prove policy coverage, bypass policy, or create master
authority. Transports still normalize into the shared Runtime pipeline, and
master access must come from trusted server-side configuration rather than
request input.
