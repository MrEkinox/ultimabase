# Singular nested writes

`createOne` and `updateOne` accept relationship commands beside ordinary
scalar data. The relationship field already fixes the target schema, so every
identity command carries a string ID or a `Pointer` of that target (ADR-0308).

```ts
const post = await PostSchema.createOne({
	data: {
		author: { connect: authorId },
		comments: {
			create: [{ body: 'First' }, { body: 'Second' }],
			connect: [existingCommentId],
		},
		title: 'Hello',
	},
})

await PostSchema.updateOne({
	where: { id: { eq: post.id } },
	data: {
		author: { update: { displayName: 'Ada' } },
		comments: {
			create: [{ body: 'Third' }],
			update: [{ id: firstCommentId, data: { body: 'Edited' } }],
			disconnect: [oldCommentId],
		},
	},
})
```

Pointer command objects contain exactly one of `connect`, `create` or
`update`; create roots expose only the first two, and `null` unlinks an
optional pointer. A raw `Pointer` or ID is not a link. Relation `create`,
`connect`, `update`, and `disconnect` may coexist. `set` is the exclusive
replacement command, and `{ set: [] }` removes every visible member. Inverse
relations backed by a required pointer omit commands that would clear it.
Every `connect`, `set` and `disconnect` target must be visible to the caller;
a hidden target fails with the same `NOT_FOUND` as a missing one.

Core validates the complete command tree and creates an immutable graph before
effects. By default a root at depth zero may contain five nested target levels
and at most 100 operations:

```ts
const ultimabase = new UltimaBase({
	validation: {
		nestedWrites: { maxDepth: 5, maxOperations: 100 },
	},
	schemas,
})
```

Every existing target and exact relation membership is verified before the
first business Hook or write. Pointer children precede their source; relation
children and membership changes follow it in fixed command order. `set` and
`clear` replace only request-visible membership, so hidden edges remain intact.
Every object uses its normal Runtime lifecycle on the same transaction, then
the root projection runs after all descendants and edges exist. A failure at
any boundary rolls the complete graph back.

Nested commands are intentionally limited to singular schema commands.
`createMany`, `updateMany`, and upserts keep their flat logical pointer values.
