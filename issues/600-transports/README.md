# Milestone 6 — GraphQL and cross-transport parity

- Status: planned

Expose the completed Runtime vertical through network-independent GraphQL and
the Yoga HTTP adapter, then verify parity with the authenticated REST vertical
delivered by milestone 23.

The original pre-kernel HTTP and REST issues 601 through 607 are preserved as
superseded history. Their replacements live in
[`issues/2300-http-rest-password-auth/`](../2300-http-rest-password-auth/).
GraphQL Core never depends on HTTP or REST. Yoga depends on the shared HTTP
plugin and GraphQL Core, never on REST.
