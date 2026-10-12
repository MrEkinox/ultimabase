# Relation field declarations

`relationField` declares queryable to-many topology without adding an embedded
array to ordinary model values.

```ts
import {
	UltimaBase,
	type InferCreateInput,
	type InferObject,
	type RequestContextValue,
} from '@ultimabase/core'

declare const currentUserId: RequestContextValue<string>

export const UserSchema = UltimaBase.Schema.define({
	className: 'User',
	fields: (field) => ({
		name: field.string({ required: true }),
		posts: field.relation({
			target: 'Post',
			mappedBy: 'author',
		}),
	}),
})

export const PostSchema = UltimaBase.Schema.define({
	className: 'Post',
	fields: (field) => ({
		author: field.pointer({
			target: 'User',
			required: true,
		}),
		title: field.string({ required: true }),
	}),
})

export const ConversationSchema = UltimaBase.Schema.define({
	className: 'Conversation',
	fields: (field) => ({
		participants: field.relation({ target: 'User' }),
		otherParticipants: field.relation({ target: 'User' }),
	}),
}).with({
	relations: {
		otherParticipants: {
			where: ({ context, where }) => {
				const userId = context.getValue(currentUserId)

				return userId === undefined ? where : where.ne('id', userId)
			},
		},
	},
})

export type User = InferObject<typeof UserSchema>
export type CreateUserInput = InferCreateInput<typeof UserSchema>
```

`posts` is absent from both inferred types. `PostSchema.author` owns this
one-to-many relationship, and `UserSchema.posts` is its storage-free inverse.
An owning `relationField({ target })` plus one inverse `relationField` represents
many-to-many. Use `pointerField({ indexed: "unique" })` for one-to-one.

The `relations` rule of the final `.with` (ADR-0328) shapes only reads through
`otherParticipants`. A
static declaration such as `{ active: { eq: true } }` uses the ordinary target
filter contract. A contextual declaration receives the immutable request
context and an empty target-typed builder, and must resolve synchronously. Core
combines it with every caller filter using `AND`. This is not authorization:
Access, ACL, and protected constraints still decide which rows may be observed,
and another route to `User` does not inherit this relation's shaping rule.

An ordinary User model keeps `posts` unloaded. A source read can explicitly
include the collection with its own portable target query:

```ts
const users = await UserSchema.findMany({
	select: { id: true, name: true },
	include: {
		posts: {
			where: { title: { contains: 'TypeScript' } },
			orderBy: { createdAt: 'desc' },
			take: 10,
			select: { id: true, title: true },
		},
	},
})

// `users[0].posts` is a readonly array of selected Post rows.
```

Relation inclusion also supports nested `include`. It preserves every installed
source and target protected policy. Results have no relation handles
(ADR-0310); filter parents through a relation instead:

```ts
const writers = await UserSchema.findMany({
	where: { posts: { some: { title: { startsWith: 'Draft' } } } },
	select: { id: true },
})
```

Relation fields contain no join-table, SQL, or transport naming. Link writes
change membership without exposing join rows (ADR-0308):

```ts
const conversationId = '0198f090-2a50-7000-8000-000000000100'
const userId = '0198f090-2a50-7000-8000-000000000101'

await ConversationSchema.updateOne({
	where: { id: conversationId },
	data: { participants: { connect: [userId] } },
})
await ConversationSchema.updateOne({
	where: { id: conversationId },
	data: { participants: { set: [] } },
})
```

Every update inherits the active request or accepts the same operation options
as a schema read. It runs installed source and target behaviors inside one
transaction; inverse pointer relations also run the target pointer update
lifecycle. A database adapter must advertise relation support. PostgreSQL
implements scoped reads, owning join storage, inverse traversal, mutations, and
cleanup.

Source Queries can filter without materializing related collections:

```ts
const authorsWithTypedPosts = await UserSchema.findMany({
	where: { posts: { some: { title: { contains: 'TypeScript' } } } },
})
```

Nested `some`, `none`, and `every` inputs retain the exact target schema. They
remain portable Core Query AST and preserve private target constraints.
