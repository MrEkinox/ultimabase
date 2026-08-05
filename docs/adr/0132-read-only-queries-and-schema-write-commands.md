# ADR-0132: Read-only queries and schema-owned write commands

- Status: accepted
- Date: 2026-08-05
- Supersedes: ADR-0110
- Refines: ADR-0067, ADR-0069, ADR-0108, ADR-0114, ADR-0115

## Context

`Query` previously mixed read clauses with write terminals. This allowed fluent
chains whose syntax implied behavior that the mutation did not consistently
use. For example, a developer could add selection, ordering, pagination, or an
unrelated filter before a create operation even though those clauses could not
affect the inserted object.

The same surface also made mutation results depend on an earlier read
projection. An update started from a model selected with only `title` returned
only `title`, while schema-owned creation already returned a complete model.
This coupling made write behavior harder to discover and produced unnecessarily
large TypeScript hovers.

## Decision

### Query represents reads only

`Schema.query()` returns an immutable read builder. It owns filters, selection,
pointer inclusion, ordering, pagination, and the `find`, `first`, `get`,
`count`, and `exists` terminals. It exposes no create, update, upsert, or delete
terminal.

The normalized Operation AST and Runtime mutation kinds remain unchanged.
Schema commands build the same internal query and operation nodes before using
the same validation, Access, hook, transaction, adapter, and result pipeline.

### Generated schema classes own writes

Every class returned by `Schema.define()` exposes this static write surface:

```ts
await Post.create({ title: 'Hello' })
await Post.createMany(inputs)

await Post.updateOne({
	where: (where) => where.byId(postId),
	data: { set: { published: true } },
})

await Post.updateMany({
	where: (where) => where.equalTo('published', false),
	data: { set: { published: true } },
})

await Post.upsert({
	where: (where) => where.equalTo('slug', 'hello'),
	create: { slug: 'hello', title: 'Hello' },
	update: { increment: { views: 1 } },
})

await Post.upsertMany(items)
await Post.deleteOne({ where: (where) => where.byId(postId) })
await Post.deleteMany({ where: 'all' })
```

The final execution-options argument from ADR-0114 applies unchanged to every
schema command. Draft `create()` and `upsert()` and persisted model `update()`
and `delete()` remain immutable convenience commands over the same schema-owned
execution path.

### Mutation predicates are filter-only

`where` receives an immutable schema-aware predicate exposing scalar, logical,
pointer, and relation filters without selection, ordering, pagination, or read
terminals. The callback must return a predicate belonging to the supplied
schema.

`byId(id)` is the explicit shortcut for the framework-owned identifier and
normalizes to the same equality node as `equalTo('id', id)`. Both forms remain
supported.

`updateOne`, `upsert`, and `deleteOne` must identify a row through `id`, one
unique field, or one complete unique composite index. Set-based update and
delete accept a non-empty predicate or the explicit literal `all`; an empty
predicate cannot accidentally target every row.

### Mutation results are complete models

Singular create, update, upsert, and delete return a complete immutable model
without applying a previous read projection or pointer inclusion. Dynamic
Access and output restrictions still narrow the values visible to the current
request; complete does not mean bypassing field security.

Pointers remain unloaded `Pointer` values, and to-many fields remain relation
handles. Loading related objects requires an explicit follow-up query such as
`post.author.query().find()` or `post.relation('tags').query().find()`.

A persisted instance selected through a narrow read may still update or delete
itself using its protected Runtime identity. The successful mutation returns a
new complete model, while the original selected instance remains unchanged.

## Consequences

- A fluent read clause can no longer appear to configure an unrelated write.
- Read and write autocomplete have distinct, immediately understandable
  surfaces.
- Singular and set-based cardinality remain explicit in method names and result
  types.
- Every potentially global mutation requires the visible `where: 'all'`
  opt-in.
- Mutation responses are predictable and never depend on an earlier selection
  or inclusion.
- Existing Runtime, hook, Access, transaction, adapter, and transport operation
  contracts do not need new mutation kinds.
- Transports normalize their write inputs directly into the same schema command
  predicates and operation ASTs without exposing Query write terminals again.
