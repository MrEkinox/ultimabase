# ADR-0158: Filtered relation cardinality

- Status: accepted
- Date: 2026-08-07
- Refines: ADR-0052, ADR-0063, ADR-0118, ADR-0137, ADR-0143, ADR-0156

## Context

Visible relation cardinality can compare the complete related collection, but
developers also need thresholds over one target subset, such as authors with at
least three published posts. Expressing `some` next to `count` does not provide
that meaning: `some` proves that one target matches, while an unfiltered `count`
still counts every visible target.

Filtered cardinality must retain the canonical object-shaped `where` contract,
target-field inference, nested relation predicates, source field Access, target
row visibility, and adapter-neutral Query AST semantics. Several comparisons
must not produce repeated aggregate subqueries.

Drizzle Relational Queries v2 still has no relation cardinality comparator.
Drizzle Core provides the aliases, joins, aggregate `count()`, `HAVING`,
parameterized comparisons, and `EXISTS` expression needed to compile the
portable contract without interpolated SQL or per-parent queries.

## Decision

The relation `count` input accepts an optional target-typed `where` next to its
comparisons:

```ts
const establishedAuthors = await Author.findMany({
	where: {
		posts: {
			count: {
				where: { published: { eq: true } },
				gte: 3,
				lt: 100,
			},
		},
	},
})
```

At least one cardinality comparison remains mandatory. `where` alone is
invalid. The nested predicate uses the relation target schema and the same
bounded recursion, validation, snapshotting, and logical composition as other
`WhereInput` values. Omitting `where`, or providing an empty object, counts the
complete visible relation.

Core normalizes one count input into one `relation-count` AST node containing
the target predicate and every cardinality comparison. It does not emit one AST
leaf per operator. `WhereBuilder.count()` accepts the same canonical input and
remains an immutable authoring utility rather than a second semantics source.

Runtime evaluates the nested predicate in the target read scope. Target
operation Access, row filters, plugin constraints, and recursively referenced
relation scopes are combined with the developer predicate before counting.
Source relation field read Access remains enforced. Target business read hooks
do not transform aggregate rows.

The versioned relation-predicate adapter capability advances from version 2 to
version 3 because the `relation-count` node shape now includes a target
expression and grouped comparisons. Older adapters fail closed instead of
silently ignoring either part of the contract.

PostgreSQL compiles the target predicate, visibility constraints, and relation
correlation into one Drizzle Core aggregate query. Every comparison is applied
to the same `count()` through `HAVING`, and `EXISTS` turns the aggregate result
into the parent predicate. The result is one correlated aggregate per count
filter in the parent SQL statement, not one aggregate per comparison and not an
N+1 query sequence. This focused custom compilation remains necessary because
Drizzle RQB v2 does not expose filtered relation cardinality.

## Consequences

- Direct TypeScript and future transports share one structural filtered-count
  contract.
- Autocomplete inside `count.where` exposes fields from the relation target,
  including nested relation filters.
- Hidden targets and targets rejected by the nested predicate do not contribute
  to the count.
- Multiple comparisons share one aggregate calculation.
- Adapters advertising relation-predicate capability version 1 or 2 fail closed
  when relation predicates reach execution.
- `some`, `none`, `every`, `isEmpty`, and `isNotEmpty` remain the clearer and
  cheaper choices when only existence or emptiness is required.
