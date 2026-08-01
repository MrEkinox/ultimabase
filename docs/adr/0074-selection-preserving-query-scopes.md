# ADR-0074: Selection-preserving Query scopes

- Status: accepted
- Date: 2026-08-01
- Refines: ADR-0005, ADR-0058, ADR-0061

## Decision

`@ultimabase/query` exposes `QueryScope<TSchema>` as a generic function that
transforms an unbound `Query` for one exact schema while preserving its current
selected-field type. `Query.use(scope)` applies that transformation and checks
that JavaScript callers return a `Query` retaining the same schema definition.

Scopes may add filters, ordering, limits, or pagination. They do not change the
selection, which prevents a reusable policy-like transformation from silently
changing the result shape. Scopes compose by calling `.use()` and remain plain
arrow functions rather than framework-owned classes or registries.

`BoundQuery.use(scope)` passes only its unbound Query into the scope, then wraps
the result in a new bound branch with the original engine. A scope can therefore
be reused before or after Runtime binding without capturing execution,
authority, or transport state.

## Consequences

Applications can name common query behavior once and reuse it across immutable
branches while retaining exact schema, projection, and engine inference. A
scope that needs request-specific values receives those values through an outer
factory; it still transforms only the Query passed to it.

Selection-changing helpers remain ordinary explicitly typed functions rather
than `QueryScope` values, making projection changes visible at their call sites.
