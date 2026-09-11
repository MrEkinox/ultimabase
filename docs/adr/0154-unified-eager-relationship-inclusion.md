# ADR-0154: Unified eager relationship inclusion

- Status: accepted
- Date: 2026-08-07
- Refines: ADR-0118, ADR-0137, ADR-0141, ADR-0152
- Refined by: ADR-0155, ADR-0159, ADR-0161, ADR-0163, ADR-0174, ADR-0247

ADR-0161 removes target field `resolveOutput`, and ADR-0163 removes parent and
target schema read hooks. The unified Drizzle-backed inclusion, nested Access,
and no-manufactured-target-lifecycle decisions remain accepted.

## Context

Core initially limited `include` to singular `pointerField` targets. A
`relationField` collection could be read only through its model `Relation`
handle. That preserved explicit pagination, but it prevented a parent read from
requesting a bounded related collection in the same result and left transports
without one flat, typed projection contract for both relationship cardinalities.

PostgreSQL already generates one private Drizzle `defineRelations` graph for
pointers, owning relations, inverse relations, and hidden junction tables.
Drizzle RQB can compile nested `with` branches, target filters, ordering, and
limits from that graph. Maintaining a separate Core eager loader would add
query grouping and result-correlation code while reintroducing N+1 risk.

## Decision

The canonical query `include` object accepts both `pointerField` and
`relationField` keys. A pointer target supports `where`, `select`, and nested
`include`. A relation target additionally supports `orderBy` and `limit`:

```ts
const users = await User.findMany({
	select: { id: true, name: true },
	include: {
		posts: {
			where: { published: { eq: true } },
			orderBy: [{ createdAt: 'desc' }],
			limit: 10,
			select: { id: true, title: true },
		},
	},
})
```

The inferred result adds `posts` as an immutable array of the exact selected
target model. An unloaded model remains handle-only: relation collections do
not enter `InferObject`, create or update input, or ordinary result values.
Per-parent cursor and offset pagination are not part of relation inclusion;
developers use the `Relation` handle when they need an independently paginated
collection.

Core represents both cardinalities in one transport-neutral inclusion tree.
Every branch records its cardinality, logical field path, independently shaped
target query, constraints, and availability. Adapters advertise one versioned
inclusion capability rather than a pointer-specific capability.

Runtime prepares a pointer branch with `find-one` target semantics and a
relation branch with `find-many` target semantics. Source relation Field Access
is evaluated exactly once before target loading. Target operation, filter, item,
and field Access and target scalar `resolveOutput` hooks still apply recursively.
A denied source relation rejects traversal. A denied or fully filtered target
collection is indistinguishable from an empty collection, while a denied or
missing pointer remains `null`.

Inclusion remains data loading rather than a target read lifecycle. It does not
run target schema or global `beforeRead` and `afterRead` hooks. Hydration is
complete before the explicit parent schema's `afterRead`, whose validated
replacement remains authoritative. Nested pointer and relation inclusions use
the same rules.

PostgreSQL resolves the complete inclusion tree through the generated Drizzle
RQB relation graph and one relational query. Core keeps Access, hooks,
validation, and the portable AST; Drizzle owns join orientation, hidden junction
traversal, correlation, and nested result assembly. Custom eager-loading SQL or
a Runtime DataLoader is not introduced while Drizzle preserves these semantics.

## Consequences

- One typed `include` contract covers singular and collection relationships.
- Bounded relation collections avoid N+1 queries without adding a second
  adapter-side loading system.
- Parent hooks observe fully hydrated nested values, while target schema hook
  cardinality remains independent from adapter loading strategy.
- Source and target Access boundaries remain explicit and independently tested.
- Adapters without the unified inclusion capability fail before eager execution.
- Independently paginated relation traversal remains available through the
  existing model `Relation` handle.
