# Transports

Transports translate requests and responses. They do not contain SQL or business-policy shortcuts.

## REST

REST mounts generated CRUD and query routes through an HTTP-server service. The initial server implementation is Hono on Node.js, with port `1337` by default.

## GraphQL

GraphQL Core generates and executes a network-independent `GraphQLSchema`. Yoga provides GraphQL over HTTP.

Custom schemas from Nexus, Pothos, GraphQL Tools, or another builder are merged as completed `GraphQLSchema` instances. Non-overlapping fields may extend generated types; conflicting fields fail startup.

Conditional field visibility makes affected GraphQL fields nullable.
