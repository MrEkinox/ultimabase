# Relation field declarations

`relationField` declares queryable to-many topology without adding an embedded
array to ordinary model values.

```ts
import {
	UltimaBase,
	type InferCreateInput,
	type InferObject,
	type RequestContextValue,
	type SchemaResult,
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
		otherParticipants: field.relation({
			target: 'User',
			where: ({ context, where }) => {
				const userId = context.getValue(currentUserId)

				return userId === undefined ? where : where.ne('id', userId)
			},
		}),
	}),
})

export type User = InferObject<typeof UserSchema>
export type CreateUserInput = InferCreateInput<typeof UserSchema>
```

`posts` is absent from both inferred types. `PostSchema.author` owns this
one-to-many relationship, and `UserSchema.posts` is its storage-free inverse.
An owning `relationField({ target })` plus one inverse `relationField` represents
many-to-many. Use `pointerField({ indexed: "unique" })` for one-to-one.

`otherParticipants.where` shapes only reads through that exact relation. A
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

// `users[0].posts` is a readonly array of selected Post models.
```

Relation inclusion also supports nested `include`. It preserves every installed
source and target protected policy. Direct calls through
`user.relation('posts')` remain normal target reads through the same Runtime
pipeline.

Relation fields contain no join-table, SQL, or transport naming. Relation
handles keep those choices separate from model values:

```ts
declare const user: SchemaResult<typeof UserSchema>

const recentPosts = await user.relation('posts').findMany({
	select: { id: true, title: true },
	orderBy: { createdAt: 'desc' },
	take: 20,
})
```

The same handle owns atomic mutation intent without exposing join rows:

```ts
const postId = '0198f090-2a50-7000-8000-000000000101'

await user.relation('posts').connect(postId)
await user.relation('posts').disconnect(postId)
await user.relation('posts').set([postId])
await user.relation('posts').clear()
```

Every call inherits the active request or accepts the same operation options as
a schema read. It runs installed source and target behaviors inside one
transaction; inverse pointer relations also run the target pointer update
lifecycle. A database
adapter must advertise relation support. PostgreSQL implements scoped reads,
owning join storage, inverse traversal, mutations, and cleanup.

Source Queries can filter without materializing related collections:

```ts
const authorsWithTypedPosts = await UserSchema.findMany({
	where: { posts: { some: { title: { contains: 'TypeScript' } } } },
})
```

Nested `some`, `none`, and `every` inputs retain the exact target schema. They
remain portable Core Query AST and preserve private target constraints.
