# Relation field declarations

`relationField` declares queryable to-many topology without adding an embedded
array to ordinary model values.

```ts
import {
	Schema,
	type InferCreateInput,
	type InferObject,
	type SchemaResult,
} from '@ultimabase/core'

export const UserSchema = Schema.define({
	className: 'User',
	fields: (field) => ({
		name: field.string({ validation: { required: true } }),
		posts: field.relation({
			target: () => PostSchema,
			mappedBy: 'author',
		}),
	}),
})

export const PostSchema = Schema.define({
	className: 'Post',
	fields: (field) => ({
		author: field.pointer({
			target: () => UserSchema,
			validation: { required: true },
		}),
		title: field.string({ validation: { required: true } }),
	}),
})

export type User = InferObject<typeof UserSchema>
export type CreateUserInput = InferCreateInput<typeof UserSchema>
```

`posts` is absent from both inferred types. `PostSchema.author` owns this
one-to-many relationship, and `UserSchema.posts` is its storage-free inverse.
An owning `relationField({ target })` plus one inverse `relationField` represents
many-to-many. Use `pointerField({ indexed: "unique" })` for one-to-one.

An ordinary User model keeps `posts` unloaded. A source read can explicitly
include the collection with its own portable target query:

```ts
const users = await UserSchema.findMany({
	select: { id: true, name: true },
	include: {
		posts: {
			where: { title: { contains: 'TypeScript' } },
			orderBy: { createdAt: 'desc' },
			limit: 10,
			select: { id: true, title: true },
		},
	},
})

// `users[0].posts` is a readonly array of selected Post models.
```

Relation inclusion also supports nested `include`. It preserves source and
target Access without manufacturing target schema read hooks. Direct calls
through `user.relation('posts')` remain normal target
reads and therefore retain the target's ordinary read-hook lifecycle.

Relation fields contain no join-table, SQL, REST, or GraphQL naming. Relation
handles keep those choices separate from model values:

```ts
declare const user: SchemaResult<typeof UserSchema>

const recentPosts = await user.relation('posts').findMany({
	select: { id: true, title: true },
	orderBy: { createdAt: 'desc' },
	limit: 20,
	cursor: true,
})
```

The same handle owns atomic mutation intent without exposing join rows:

```ts
const post = PostSchema.pointer('0198f090-2a50-7000-8000-000000000101')

await user.relation('posts').connect(post)
await user.relation('posts').disconnect(post)
await user.relation('posts').set([post])
await user.relation('posts').clear()
```

Every call inherits the active request or accepts the same operation options as
a schema read. It runs source update Access and hooks inside one transaction; inverse
pointer relations also run the target pointer update lifecycle. A database
adapter must advertise relation support. PostgreSQL implements scoped reads,
owning join storage, inverse traversal, mutations, and cleanup.

Source Queries can filter without materializing related collections:

```ts
const authorsWithTypedPosts = await UserSchema.findMany({
	where: { posts: { some: { title: { contains: 'TypeScript' } } } },
})
```

Nested `some`, `none`, and `every` inputs retain the exact target schema. They
remain portable Core Query AST and preserve private target Access constraints.
