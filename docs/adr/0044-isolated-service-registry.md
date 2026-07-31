# ADR-0044: Isolated service registries

- Status: accepted
- Date: 2026-07-31
- Refines: ADR-0001, ADR-0042, ADR-0043

## Decision

Every application owns one `ServiceRegistry` backed by a native `Map` keyed by
service-token object identity. `provide(token, service)` creates the token's
single provider slot, `get(token)` requires that slot, and `getOptional(token)`
returns `undefined` when it is absent. `has(token)` and `size` expose read-only
registry state without leaking the backing collection.

A second provision never replaces the original service. Missing, duplicate,
and post-disposal provision failures use the stable `SERVICE_NOT_FOUND`,
`SERVICE_ALREADY_PROVIDED`, and `SERVICE_REGISTRY_DISPOSED` framework codes.
Every failed write leaves existing registry state unchanged.

Services implementing the standard `Symbol.dispose` or `Symbol.asyncDispose`
protocol are registered in one native `AsyncDisposableStack`. Disposal clears
all service references before releasing owned resources in reverse registration
order. Repeated disposal is safe, and one disposable object exported through
several distinct tokens is owned only once by the registry.

## Consequences

Applications and parallel tests cannot leak service values through global
state. Required and optional dependencies remain visibly distinct at call
sites, and token inference determines every returned service type.

Plugin authors can use native explicit-resource-management protocols rather
than framework-specific cleanup callbacks. Services without either protocol
are treated as externally managed values and are simply released from the
registry during disposal.
