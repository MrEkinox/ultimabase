# ADR-0174: Object-shaped ordering inputs

- Status: accepted
- Date: 2026-08-09
- Supersedes: the public ordering representation in ADR-0152
- Refines: ADR-0055, ADR-0154, ADR-0173

## Context

Canonical reads represented ordering as an array of exact single-field objects.
Although this made priority explicit, it made ordinary multi-field ordering more
verbose than `where` and `select`, and the generated application declaration had
to expose a generic Core helper instead of one readable schema-specific input.

Generated declarations are application-facing artifacts. Their public shapes
must be understandable without following framework implementation aliases, and
the same serializable input must serve direct reads, relation inclusions,
QueryBuilder output, REST, and GraphQL normalization.

## Decision

Every public `orderBy` clause is one object correlated with the target schema:

```ts
export type OrderDirection = 'asc' | 'desc'

export type PostOrderByInput = {
	readonly id?: OrderDirection | null
	readonly title?: OrderDirection | null
	readonly createdAt?: OrderDirection | null
}
```

Schema reads and relation inclusions use that object directly:

```ts
await Post.findMany({
	orderBy: { createdAt: 'desc', id: 'asc' },
})
```

Each property is optional because ordering is a filter-like partial clause.
`null` has the same effect as an absent direction. Remaining own properties are
normalized in JavaScript property enumeration order, which defines SQL ordering
priority. Unknown fields and directions other than `asc`, `desc`, or `null`
fail normalization.

The transport-neutral Query AST retains its ordered list of normalized order
nodes. QueryBuilder continues to accumulate that list internally and emits one
canonical object from `build()`. Adapters therefore receive the same AST as
before and do not learn the public object representation.

Generated files emit concrete `SchemaOrderByInput` objects and a local
`OrderDirection` union. They do not expose `Core.GeneratedOrderBy`.

## Consequences

- Common and multi-field ordering use one concise object.
- Generated declarations remain readable without a Core ordering helper.
- Direct reads, eager relation inclusions, and future transports share one
  canonical shape.
- Priority follows property enumeration order; callers that care about priority
  must construct the object in that order.
- The Query AST and database adapter contracts remain unchanged.
