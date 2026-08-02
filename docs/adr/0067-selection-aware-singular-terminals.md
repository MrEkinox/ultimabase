# ADR-0067: Selection-aware singular terminals

- Status: accepted
- Date: 2026-07-31
- Refines: ADR-0004, ADR-0019, ADR-0059, ADR-0061, ADR-0065
- Refined by: ADR-0092, ADR-0100, ADR-0108

## Decision

`BoundQuery` exposes the singular terminal surface when its binding satisfies
the transport-neutral `QueryOperationExecutor` contract. `RequestEngine`
implements that contract and sends every generated operation through the
mandatory Runtime pipeline. `@ultimabase/query` still imports neither Runtime
nor database contracts.

The implemented terminals are `find`, `first`, `get`, `count`, `exists`,
`createOne` with its `create` alias, `updateOne`, and `deleteOne`. Every method
creates an immutable existing Operation AST kind. `updateOne` normalizes the
developer input through the shared atomic update-expression normalizer before
execution. `createOne` and `create` use only the retained schema because a
create operation has no target query.

The existing `exists(fieldName)` filter remains available. Calling `exists()`
with no field executes the boolean terminal. The overload preserves the
Parse-inspired filter name without introducing a second synonym.

Query-backed operation types retain their selected-field union through a
type-only private marker. The runtime Query AST remains the only value-level
selection source and is not rebuilt. `InferOperationResult` maps that marker
and the operation discriminant to the exact result. Database adapter contracts
reuse the same mapping, preventing adapter and public terminal result semantics
from drifting.

No-match semantics are uniform: `first`, `get`, `updateOne`, and `deleteOne`
resolve to `null`. They do not create implicit `NOT_FOUND` exceptions. Direct
TypeScript callers can branch consistently, while REST and GraphQL transports
may map `null` according to their protocol contracts. `find` returns an array,
`count` a number, `exists` a boolean, and create always returns one persisted
object.

## Consequences

Selection-aware reads, updates, and deletes expose only selected fields in
TypeScript. An empty selection yields the complete persisted object shape.
Create results also use the complete persisted shape because selection clauses
do not belong to schema-backed create operations.

Opaque bindings remain useful for immutable query composition, but TypeScript
rejects terminal calls unless their engine implements the neutral executor.
Runtime validation still protects JavaScript execution boundaries. Bulk
terminals and upserts extend the same operation/result contract in issue 316.
