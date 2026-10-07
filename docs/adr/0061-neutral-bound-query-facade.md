# ADR-0061: Neutral BoundQuery facade

- Status: superseded
- Date: 2026-07-31
- Refines: ADR-0005, ADR-0058, ADR-0059
- Refined by: ADR-0092
- Superseded by: ADR-0108

## Decision

`@ultimabase/query` defines the immutable `BoundQuery` facade alongside the
unbound `Query`. `Query.bind(engine)` returns a bound instance carrying the
exact engine type, schema, selected-field union, and shared immutable Query AST.
Every builder method returns another bound instance with the same engine.

This placement is dependency inversion, not execution ownership. The facade
accepts an opaque engine object and contains no pipeline, context, adapter,
database, transport, or authority behavior. `@ultimabase/runtime` re-exports the
class and later supplies the concrete `RequestEngine` and terminal execution.
The Query package therefore remains independent from Runtime while Runtime
continues to depend on Query.

An empty selection means the complete `InferObject<TSchema>` result. Once the
developer selects fields, `InferQueryResult` returns only that accumulated
projection. The selected-field union is type-only state; the normalized Query
AST remains the single runtime source and is not rebuilt for inference.

Issue 313 owns `RequestEngine.query(schema)`. Issues 315 and 316 own executable
terminal methods and their operation-specific result semantics. The binding
facade does not invent a temporary executor before the deterministic Runtime
pipeline exists.

## Consequences

Reusable queries can be bound explicitly today and later created already bound
by a RequestEngine without changing their builder behavior or selection types.
No circular package dependency or module augmentation is required.

The bound facade mirrors Query builder methods through focused delegation so
each branch keeps class-based discoverability and exact field/operator types.
New Query builder methods must add matching BoundQuery delegation and tests.
