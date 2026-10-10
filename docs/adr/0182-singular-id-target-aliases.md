# ADR-0182: Singular mutations accept an identifier target alias

- Status: superseded
- Date: 2026-08-10
- Superseded by: ADR-0307
- Refines: ADR-0132, ADR-0144, ADR-0146, ADR-0178

## Context

Schema-root `updateOne` and `deleteOne` use one canonical object-shaped `where`
input. Targeting the framework identifier therefore requires the repetitive
form `{ where: { id: { eq: id } } }`, even though `id` already identifies one
exact persisted model and `get` accepts it directly.

The shorter form must not create a second targeting semantic. Access, hooks,
transactions, adapters, transports, and the portable operation model must
continue to observe the same canonical predicate.

## Decision

`updateOne` and `deleteOne` accept a top-level `id` as an input alias for
`where: { id: { eq: id } }`:

```ts
await Post.updateOne({
	id: postId,
	data: { title: 'Updated' },
})

await Post.deleteOne({ id: postId })
```

Each command accepts exactly one target form: either `id` or `where`. TypeScript
models the forms as a mutually exclusive union, and runtime normalization
rejects untyped callers that supply both or neither. The identifier uses the
same schema-aware `OperationObjectId` contract as `get`.

Core immediately converts `id` into the existing canonical `where` object
before constructing a Query or Operation AST. No identifier-specific AST node,
Runtime branch, Access input, hook input, database request, or adapter capability
is introduced. A missing target retains the existing schema-root singular
mutation result: `null`.

`findOne` keeps its first-match filter contract because `get` already owns
required identifier reads. `upsertOne`, instance commands, and collection
commands retain their current inputs.

## Consequences

- The common identifier mutation path is concise without weakening exact unique targeting.
- Existing `where` calls remain valid and compile to the same operation.
- REST and GraphQL may expose or normalize the alias later without changing Core semantics.
- The public type surface gains one exclusive input union, while the AST and execution pipeline remain unchanged.
