# ADR-0237: HTTP resolvers receive the effective browser policy

- Status: accepted
- Date: 2026-09-06
- Refines: ADR-0226, ADR-0235
- Depends on: ADR-0190, ADR-0225, ADR-0226

## Context

HTTP context resolvers are application-lifetime contributions consumed by the
HTTP plugin. A credential plugin may need to reject an unsafe effective browser
policy before the application starts and then apply that same policy while
resolving a request.

Making such a resolver require `httpBrowserPolicyCapability` creates a cycle:
HTTP consumes the resolver contribution while the resolver's plugin consumes a
capability provided by HTTP. Duplicating browser origins in credential-plugin
configuration would instead create two sources of truth and could drift from
the policy enforced by the server provider.

## Decision

An HTTP context resolver may define a synchronous
`validateBrowserPolicy(policy)` callback. The HTTP application invokes it under
the resolver contribution's exact plugin owner while compiling resolvers. Any
rejection aborts application materialization before a request or server effect.

Every resolver invocation also receives the exact immutable effective
`browserPolicy` beside its anonymous context and credential-only Request. The
value is the same normalized policy that the HTTP plugin exposes to server
providers. Resolvers may use it to validate request proofs but cannot change it.

Credential plugins therefore provide resolvers without requiring the HTTP
browser-policy capability. Dependency direction remains one-way: the HTTP
plugin consumes generic resolver contributions, and concrete credential
plugins import only the HTTP public authoring contract. An opt-in integration
that is meaningless without HTTP may declare HTTP as a peer; peer validation
requires compatible presence without adding a graph-ordering edge.

## Consequences

- Browser-policy compatibility fails during application materialization.
- Request-time checks cannot drift from the server's effective policy.
- HTTP remains unaware of Password Auth, cookies, CSRF, or any concrete
  credential format.
- Existing resolvers that need no browser policy require no validator and only
  receive one additional immutable input field.

## Non-goals

- Moving CORS or CSRF policy into Core.
- Letting resolvers mutate browser policy or server behavior.
- Adding a generic authentication engine, authorization grant, or second
  configuration source for allowed origins.
