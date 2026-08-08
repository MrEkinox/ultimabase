# ADR-0167: Canonical where inputs for Access row policies

- Status: accepted
- Date: 2026-08-08
- Refines: ADR-0116, ADR-0143, ADR-0156, ADR-0158, ADR-0160
- Refined by: ADR-0169

ADR-0169 retains `WhereInput` and `WhereBuilder` but moves row policy under each
operation's `where` stage. It also replaces boolean row results with
`undefined` for no additional restriction; denial belongs to `allow`.

## Context

Native schema Access originally exposed a dedicated `AccessFilter` builder.
Although it reused Query filter nodes internally, its long operator names and
separate public contract duplicated the canonical object-shaped `WhereInput`
introduced by ADR-0143. The duplication also made future REST and GraphQL
normalization harder because Access examples taught a representation that
transports could not accept directly.

Relationship predicates add a second concern. A caller-provided predicate must
respect public field filtering permissions on every traversed schema. A
server-owned Access predicate must be able to reference private policy fields,
but it must still apply the target schema's operation Access, row policies, and
plugin constraints.

## Decision

`WhereInput<TSchema>` is the canonical authoring contract for schema Access row
policies. A filter rule may return `true`, `false`, a `WhereInput<TSchema>`, or a
`WhereBuilder<TSchema>`, directly or asynchronously. The callback receives a
fresh immutable `where` builder for dynamic composition, but that builder owns
no separate AST or compiler and uses the same short operator vocabulary as the
object contract.

Runtime normalizes every result immediately and retains the resulting predicate
only in private monotonic enforcement state. Independent native and plugin
policies combine through logical `AND`; developer Query code cannot inspect,
replace, or remove them.

Runtime records predicate provenance while preparing relationship scopes:

- caller-provided Query predicates require public field filtering permission on
  the source and recursively traversed target schemas;
- Access-owned predicates may reference fields whose public field `filter`
  decision is false;
- both forms evaluate target operation Access, target row policies, plugin
  constraints, and recursively nested relationship scopes;
- adapters receive the exact immutable predicate identity with its prepared
  target scope and compile both in the same database statement.

Field read Access retains the distinct `item`, `filter`, and `order` channels.
They correspond to different data availability: `item` may inspect a
materialized value, while `filter` and `order` must be decided before database
execution.

## Consequences

- Direct TypeScript and future transports share one filter vocabulary.
- Access keeps a convenient immutable builder without maintaining a parallel
  public filter API.
- Policies may safely rely on private fields without granting callers a query
  side channel.
- Relationship predicates preserve target Access and avoid N+1 policy checks by
  compiling prepared scopes into the adapter query.
- Database plugins must compile relation predicates found in private row
  filters, not only predicates found in the public Query AST.
