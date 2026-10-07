# ADR-0156: Visible relation cardinality filters

- Status: accepted
- Date: 2026-08-07
- Refines: ADR-0052, ADR-0063, ADR-0118, ADR-0137, ADR-0143
- Refined by: ADR-0157, ADR-0158, ADR-0247

## Context

Relation quantifiers answer whether some, no, or every visible target satisfies
one predicate, but they cannot express a cardinality threshold such as “at
least three related posts”. Loading an included collection and counting it in
application code would change pagination semantics, expose unnecessary data,
and introduce additional queries.

The relation filter must remain portable for future REST and GraphQL
normalizers, respect source field Access and target row visibility, and compile
without N+1 queries. PostgreSQL should delegate to Drizzle when Drizzle exposes
the required semantic capability.

Drizzle Relational Queries v2 supports nested relation filters and relation
quantifiers, but its relation-filter contract has no cardinality comparator.
Drizzle Core does support aliased tables, correlated query builders, aggregate
`count()`, and parameterized comparison operators.

## Decision

A to-many relation accepts a `count` pseudo-field inside canonical `where`:

```ts
const activeAuthors = await Author.findMany({
	where: { posts: { count: { gte: 3 } } },
})
```

`count` is a non-null, non-negative integer value. It supports `eq`, `ne`,
`gt`, `gte`, `lt`, `lte`, `in`, `notIn`, `between`, and `notBetween`. Multiple
operators combine through the same implicit `AND` as ordinary field filters.
Operands must be non-negative safe integers.

Core represents each comparison as a schema-correlated `relation-count` AST
leaf rather than pretending that the relation owns a stored scalar column.
`WhereBuilder.count()` only produces the canonical object contract and is not a
second source of filter semantics. The existing versioned relation-predicate
adapter capability advances to version 2 because adapters must now understand
both quantified and cardinality leaves.

Cardinality observes the same visible target collection as relation reads:

- source relation field read Access is enforced before execution;
- target operation Access, row filters, and plugin constraints restrict rows
  before they are counted;
- target business read hooks do not transform the aggregate;
- hidden targets therefore never contribute to the cardinality.

The first version intentionally counts the complete visible relation. It does
not accept a nested target `where` inside `count`. Filtered cardinality can be
added later without changing the current object shape.

PostgreSQL uses Drizzle Core's `QueryBuilder`, table aliases, `count()`, joins,
and comparison helpers to construct one correlated scalar subquery. Owning and
inverse join relations use their already oriented junction columns; inverse
pointer relations correlate the target foreign key directly. This is a single
SQL statement and does not load relation rows or issue per-parent queries.
Drizzle RQB continues to own `some`, `none`, and `every`; the custom correlated
aggregate exists only because RQB lacks a relation cardinality filter.

## Consequences

- REST and GraphQL can normalize cardinality filters into one portable AST
  without parsing builder call chains.
- `count: { eq: 0 }` overlaps `none: {}`, and `count: { gt: 0 }` overlaps
  `some: {}`; quantifiers remain the clearer and potentially cheaper existence
  forms.
- Adapters advertising relation-predicate capability version 1 fail closed on
  queries containing either relation filter after this contract change.
- PostgreSQL integration tests protect owning, inverse, inverse-pointer, and
  Access-filtered cardinality behavior.
