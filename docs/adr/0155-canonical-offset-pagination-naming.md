# ADR-0155: Canonical offset pagination naming

- Status: accepted
- Date: 2026-08-07
- Refines: ADR-0055, ADR-0057, ADR-0058, ADR-0152, ADR-0154
- Refined by: ADR-0227

## Context

The canonical read object used `skip` for offset pagination while PostgreSQL,
Drizzle, and the Query AST all implement a numeric SQL offset. Relation
inclusion also needed bounded per-parent offset pagination without introducing
a second public vocabulary.

Keeping `skip` in one layer and `offset` in another obscures the serializable
contract exposed to REST and GraphQL. Supporting both names would make
normalization ambiguous and permanently widen autocomplete for an API that is
still under development.

## Decision

Offset pagination uses `offset` at every public and portable boundary:

- canonical query objects accept `offset: number`;
- `QueryBuilder` exposes `.offset(number)`;
- the Query AST offset node stores `offset`;
- adapter compilers consume that same field.

The former `skip` name is rejected rather than retained as an alias. Offset and
cursor pagination remain mutually exclusive, and zero still normalizes to no
offset position.

A `relationField` inclusion accepts `offset` in addition to `where`, `orderBy`,
`limit`, `select`, and nested `include`. The same offset is applied independently
to each parent collection. PostgreSQL delegates that behavior to the nested
Drizzle relational query configuration instead of implementing a per-parent
query loop.

Pointer inclusions do not accept pagination. Relation inclusions do not accept
cursor pagination because one public cursor cannot encode a distinct resume
position for every parent collection. That requires a separate per-parent
cursor contract before it can be added safely.

## Consequences

TypeScript, transports, the immutable builder, Core normalization, and database
adapters share one explicit term for the same operation. Autocomplete no longer
suggests `skip`, while untyped legacy input fails at structural validation.

Included to-many relationships can omit an ordered prefix without N+1 queries.
Their offset is local to each parent, so it does not change parent pagination or
the position of another included collection.
