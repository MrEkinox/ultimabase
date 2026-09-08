# Singular nested writes

`createOne` and `updateOne` accept relationship commands beside ordinary
scalar data. The relationship field already fixes the target schema, so every
identity command carries only a string ID.

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
	id: post.id,
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

Pointer command objects contain exactly one of `connect`, `create`, `update`,
or `disconnect`; create roots expose only the first two and required pointers
omit `disconnect`. Relation `create`, `connect`, `update`, and `disconnect`
may coexist. `set` and `clear` are exclusive replacement commands. Inverse
relations backed by a required pointer omit commands that would clear it.

Core validates the complete command tree and creates an immutable graph before
effects. By default a root at depth zero may contain five nested target levels
and at most 100 operations:

```ts
const ultimabase = new UltimaBase({
	validation: {
		nestedWrites: { maxDepth: 5, maxOperations: 100 },
	},
	plugins,
	schemas,
})
```

Nested commands are intentionally limited to singular schema commands and a
persisted model's `update()`. `createMany`, `updateMany`, upserts, draft
construction, and a draft's `create()` keep their flat logical pointer values.
