# ADR-0333: GraphQL hidden schemas stay hidden

- Status: proposed
- Date: 2026-10-13
- Refines: the GraphQL plugin records on generated operations and `.with({ graphql })` method
  keys; applies ADR-0288
- Approval: the post-documentation fix pass decided by the user on 2026-10-13

## Context

A schema declared with `graphql: false` loses its root fields and mutations, but the GraphQL
plugin still emits its object, connection, edge and input types. Their names and fields appear in
the printed schema and in introspection, even when no exposed type references them. Validation
hints such as `enable graphql: { findMany: true } on AuditEntry` also confirm a hidden schema's
name to any caller, and they are not limited to development. REST's `rest: false` answers 404
and names nothing.

## Decision

1. A schema with no exposed root operation contributes types only when an exposed schema
   reaches it, through a pointer or relation field of an exposed type or a nested write input.
   A schema that nothing reaches is absent from the GraphQL schema and from introspection.
2. A reachable hidden schema keeps the types that the exposed fields need, and Access still
   decides every read and write. The documentation says so, and says how to keep such a
   relation out of GraphQL.
3. Configuration hints about disabled operations are given only outside production, under the
   same rule as Access's `'development'` openings.
4. When introspection is disabled, validation errors carry no field-name suggestions
   ("Did you mean …").

## Consequences

- Tests: an unreached hidden schema is absent from `printSchema()` and from introspection; a
  reached one keeps only what its references need; hints appear in development and not in
  production; with introspection off, no suggestions appear.
- The GraphQL page and the README of `@ultimabase/graphql-plugin` describe the rule, and
  `examples/graphql` proves it.
- Documentation impact: both.
