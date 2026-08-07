# ADR-0143: Canonical object-shaped where inputs

- Status: accepted
- Date: 2026-08-06
- Refines: ADR-0055, ADR-0132, ADR-0135, ADR-0136
- Refined by: ADR-0157, ADR-0158, ADR-0160

## Context

Query filters were authored primarily through long fluent method chains such as
`equalTo('published', false).greaterThanOrEqualTo('views', 0)`. The methods were
typed and produced a portable AST, but the authoring form was verbose and was
not itself suitable as the common structural contract for direct TypeScript,
REST, and generated GraphQL inputs.

A dynamic builder remains useful when conditions depend on application code,
but it must not become a second filter representation or compiler.

## Decision

`WhereInput<TSchema>` is the canonical public filter contract. Schema field
keys map to field-kind-specific short operators such as `eq`, `gte`, `in`, and
`contains`. Fields and operators in one object combine through implicit `AND`.
Explicit `AND`, `OR`, and `NOT` keys represent recursive logical composition and
are reserved from schema field declarations.

Structured `jsonField` and `objectField` paths use an `at` collection whose
entries retain path segments separately. Typed object paths preserve exact
segment, operator, and operand inference; dynamic JSON paths retain string
segments and JSON-compatible operands. Relation fields expose the existing
`some`, `none`, and `every` quantifiers over target `WhereInput` objects.

Core validates and snapshots every where object through one normalizer before
producing the existing Query filter AST. Query reads and schema mutations share
that normalizer. Empty mutation filters remain invalid, and set-based mutations
still require the explicit `where: 'all'` value to target every row.

`WhereBuilder<TSchema>` is a public immutable utility created with
`new WhereBuilder(Schema)`. Its methods use the same short operator vocabulary,
and `build()` returns `WhereInput<TSchema>`. Builder leaves pass through the
canonical object normalizer; the builder owns no independent compiler or AST
contract.

`Query` exposes filter construction only through `where`. It does not duplicate
the object and builder operators as direct methods, including identity,
relation, or logical shortcuts. Reads by identifier therefore use
`where({ id: { eq: id } })`, while dynamic conditions use a `WhereBuilder`
instance or callback passed to `where`.

`toJSON()` is deliberately absent. Filter operands may contain logical values
such as `bigint`, `Date`, `Uint8Array`, or `Pointer` that require transport
encoding before they become JSON. REST and GraphQL decode their wire values
before handing the common object shape to Core.

## Consequences

- Direct TypeScript, mutation commands, and future transports share one filter
  vocabulary and normalization boundary.
- Autocomplete exposes only operators supported by the selected field kind.
- Dynamic code retains an immutable, reusable builder without duplicating AST
  construction.
- Query autocomplete has one filter entry point instead of a parallel fluent
  operator surface.
- The adapter-neutral Query AST and every existing database compiler remain
  unchanged.
- `AND`, `OR`, and `NOT` can no longer be declared as schema field names.
