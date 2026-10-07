# ADR-0152: Schema-root object read commands

- Status: accepted
- Date: 2026-08-07
- Supersedes: ADR-0108
- Refines: ADR-0058, ADR-0074, ADR-0118, ADR-0132, ADR-0140, ADR-0143, ADR-0151
- Refined by: ADR-0155, ADR-0159, ADR-0174, ADR-0227

## Context

Read execution was split between `Schema.query()` and terminal methods on an
immutable Query builder, while mutations already used schema-root object
commands. The fluent read syntax was concise for small queries but became
verbose as filters accumulated, obscured the serializable shape required by
REST and GraphQL, and made Query both a value builder and an execution facade.

Pointers and relation handles repeated the same `query()` transition even
though their private target restrictions are Runtime scopes rather than public
query clauses. This created two public read construction models and made the
canonical transport-neutral input less obvious.

## Decision

Generated schema classes expose the complete read surface directly:

```ts
const posts = await Post.findMany(
	{
		where: { published: { eq: true }, views: { gte: 10 } },
		select: { id: true, title: true },
		include: { author: { select: { id: true, name: true } } },
		orderBy: [{ createdAt: 'desc' }],
		limit: 25,
		cursor: true,
	},
	{ ultimabase },
)
```

The read methods are `findMany`, `findOne`, `get`, `count`, and `exists`.
Their typed object inputs are the canonical public contract. Execution options
remain a separate final argument and never enter the Query or Operation AST.
`get` accepts an exact `id`; `count` and `exists` accept only `where`; projection,
ordering, and pagination are available only where they affect the result.

Cursor pagination uses `cursor: true | string`. `true` requests the first
cursor page and an opaque string resumes a later page. `skip` remains offset
pagination and cannot be combined with `cursor`. `orderBy` is an ordered array
of exact single-field objects so priority is explicit and multi-key objects
cannot create ambiguous ordering.

`QueryBuilder` remains a public immutable, non-executing utility for dynamic
composition and reusable `QueryScope` functions. Its short builder methods
produce the existing transport-neutral Query AST, and `build()` returns the
same canonical object input accepted by `Schema.findMany`. It never resolves a
request or exposes read or mutation terminals.

Pointers expose `findOne` and `exists` directly. Relation handles expose
`findMany`, `findOne`, `get`, `count`, and `exists` directly. Their protected
object-ID or relation restrictions remain private Runtime scopes and are
combined with the developer input after normalization. They cannot be
serialized, inspected, or removed by hooks.

Every canonical input still normalizes to the existing Query AST and executes
through the same RequestEngine pipeline. Access, hooks, automatic request
inheritance, explicit application ownership, master auditing, adapter
constraints, pointer inclusion, and transport neutrality therefore retain
their established semantics.

## Consequences

- Reads and mutations now share one discoverable schema-root command model.
- REST and GraphQL can validate and normalize the canonical object shape
  without parsing chained JavaScript calls.
- Exact field, operator, selection, inclusion, and result autocomplete remains
  available on object literals and compiled package exports.
- QueryBuilder remains useful for programmatic composition without creating a
  second execution system.
- Removing `Schema.query()`, `Pointer.query()`, `Relation.query()`, and Query
  terminals is a deliberate breaking API change during framework development.
- The internal Query and Operation ASTs remain unchanged; database plugins do
  not receive a second read representation.
