# ADR-0144: Flat updateOne result selections

- Status: accepted
- Date: 2026-08-06
- Refines: ADR-0132, ADR-0140

## Context

`Query.select` provides a typed flat boolean projection, while schema-owned
`updateOne` always returned a complete model. Applications that needed only a
small update result had to perform a separate read or accept unnecessary
returned fields even though the mutation AST, Runtime enforcement, and database
adapter contracts already distinguish a projected public result from complete
mutation materializations.

## Decision

`updateOne` accepts an optional `select` property using the exact
`QuerySelection<TSchema>` contract. Literal `true` values select fields;
false-only objects omit fields; an empty object preserves the complete result.
The inferred return model exposes only the selected fields and remains nullable
when no unique target matches.

The selection enters the existing Query AST before Runtime execution. Native
field Access and monotonic selection restrictions continue to narrow it. The
database may return only the public projection, while mutation hooks and
post-commit processing continue to use complete logical materializations.
`include` remains unavailable, so selecting a pointer returns its unloaded
reference without triggering relation I/O.

This decision applies only to `updateOne`. Commands returning counts cannot use
a projection, and extending other object-returning commands requires a separate
decision based on a concrete need.

## Consequences

- Update results can avoid returning unrelated or sensitive fields.
- Selection inference and autocomplete match `Query.select` exactly.
- Omitting `select` preserves the existing complete-model contract.
- Hooks, Access, transactions, and adapter materialization semantics remain
  unchanged.
