# ADR-0159: Projection-only pointer inclusions

- Status: accepted
- Date: 2026-08-07
- Refines: ADR-0058, ADR-0118, ADR-0141, ADR-0152, ADR-0154

## Context

The unified inclusion contract allowed `where` inside both to-one pointer and
to-many relation branches. A relation filter selects a meaningful subset of a
collection. A pointer already identifies zero or one target, so its nested
filter instead made one existing pointer appear as `null` when the target did
not match.

That behavior conflated a missing pointer, an inaccessible target, and a target
rejected only by developer inclusion shaping. It also put filtering in a result
projection branch rather than in the source query responsible for deciding
which parent objects match.

The canonical object input and its optional `QueryBuilder` utility must expose
the same capability set. Removing only the object property would leave the
builder able to construct an input that transports reject.

## Decision

A pointer inclusion accepts only `select` and nested `include`:

```ts
const memberships = await Membership.findMany({
	include: {
		project: {
			select: { id: true, name: true },
			include: { owner: { select: { id: true } } },
		},
	},
})
```

`QueryPointerTargetInput` no longer contains `where`. Structural normalization
also rejects `where` on a pointer target so untyped JavaScript and future REST
or GraphQL inputs observe the same contract.

`QueryBuilder.include()` exposes a cardinality-aware callback. Pointer branches
receive a `QueryPointerTargetBuilder` capability view containing only
`select()` and `include()`. Both methods preserve that restricted view across
chaining. Relation branches continue receiving the complete `QueryBuilder`, so
they retain `where()`, ordering, limit, offset, selection, and nested inclusion.
Runtime still validates the returned concrete builder and rejects a pointer AST
containing a developer filter.

Target operation, filter, item, and field Access remain private Runtime
enforcement and are not developer inclusion shaping. They may still hide an
inaccessible target as `null`. No inclusion capability version changes because
the portable AST and adapter execution protocol are unchanged; this decision
narrows only accepted developer input.

This decision does not introduce target traversal operators for the parent
`where`. Such filtering requires its own explicit pointer-predicate contract
rather than reusing result inclusion.

## Consequences

- Pointer inclusion no longer conflates a non-matching developer filter with a
  missing target.
- Canonical objects, builder autocomplete, JavaScript validation, and future
  transports expose one capability set.
- Nested pointer projection remains available without starting a separate read
  lifecycle or adding adapter queries.
- Relation inclusion keeps its collection filtering and pagination behavior.
- Target Access continues to protect every hydrated pointer independently of
  developer projection.
