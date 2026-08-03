# ADR-0110: Concise singular Query terminals

- Status: accepted
- Date: 2026-08-03
- Refines: ADR-0059, ADR-0067, ADR-0069, ADR-0108

## Context

Query already offers `create()` and `upsert()` as concise aliases while update
and deletion require `updateOne()` and `deleteOne()`. The mixed vocabulary adds
noise to the common identifier-targeted workflow and makes singular mutations
less predictable without adding safety.

Using one overloaded method for singular and collection inputs would instead
hide cardinality, result shape, transaction grouping, and set-based database
behavior behind input inference.

## Decision

`Query` exposes `create()`, `update()`, `upsert()`, and `delete()` as its concise
singular mutation vocabulary. Their explicit `createOne()`, `updateOne()`,
`upsertOne()`, and `deleteOne()` counterparts remain supported.

Each alias delegates directly to its `*One` counterpart. It creates no new
Operation AST kind, Runtime branch, hook kind, adapter method, or PostgreSQL
path. Selection, nullability, input, and result inference therefore stay
identical.

Collection and set-based mutations retain the explicit `createMany()`,
`updateMany()`, `upsertMany()`, and `deleteMany()` names. Singular methods never
accept arrays, and no `object | object[]` overload changes behavior according to
the supplied value.

## Consequences

- Common single-object workflows use one consistent concise vocabulary.
- Explicit `*One` names remain available when code benefits from visible
  cardinality symmetry.
- `*Many` stays searchable and unambiguous in autocomplete.
- Runtime, hooks, transports, and adapters continue matching the existing
  singular and collection Operation AST kinds exhaustively.
