# ADR-0146: Flat deleteOne result selections

- Status: accepted
- Date: 2026-08-06
- Refines: ADR-0132, ADR-0144, ADR-0145

## Context

`create` and `updateOne` can project their public result through the same flat
selection contract as Query reads. `deleteOne` also returns one immutable model,
but previously always exposed the complete deleted value. Putting projection in
terminal options would mix portable operation intent with server-only execution
context and authority.

## Decision

`deleteOne` accepts an optional selection beside its unique target:

```ts
const deleted = await Post.deleteOne({
	where: { id: { eq: postId } },
	select: { id: true, title: true },
})
```

`select` uses the exact, literal, flat `QuerySelection<TSchema>` contract shared
by reads, `create`, and `updateOne`. Omitting it returns the complete deleted
model. The normalized `delete-one` Query AST owns the selection, so native field
Access can narrow it before adapter execution.

The database adapter still materializes the complete pre-delete target for
field hooks, schema hooks, transaction processing, and committed events. Only
the public result is projected, from the same deletion statement; the command
does not add a preliminary read. Selecting a pointer never loads its target.

This decision does not extend selection to `deleteMany`.

## Consequences

- Singular create, update, and delete commands share one result-selection model.
- REST and GraphQL can normalize deletion filters and projections into one
  portable command.
- Hook correctness remains independent from the caller's public projection.
- PostgreSQL keeps its atomic target selection and deletion behavior.
