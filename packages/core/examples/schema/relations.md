# Relation field declarations

`relationField` declares queryable to-many topology without adding an embedded
array to ordinary model values.

```ts
import {
	pointerField,
	relationField,
	Schema,
	stringField,
	type InferCreateInput,
	type InferObject,
	type SchemaResult,
} from '@ultimabase/core'

export const UserSchema = Schema.define({
	className: 'User',
	fields: {
		name: stringField({ validation: { required: true } }),
		posts: relationField({
			target: () => PostSchema,
			mappedBy: 'author',
		}),
	},
})

export const PostSchema = Schema.define({
	className: 'Post',
	fields: {
		author: pointerField({
			target: () => UserSchema,
			validation: { required: true },
		}),
		title: stringField({ validation: { required: true } }),
	},
})

export type User = InferObject<typeof UserSchema>
export type CreateUserInput = InferCreateInput<typeof UserSchema>
```

`posts` is absent from both inferred types. `PostSchema.author` owns this
one-to-many relationship, and `UserSchema.posts` is its storage-free inverse.
An owning `relationField({ target })` plus one inverse `relationField` represents
many-to-many. Use `pointerField({ indexed: "unique" })` for one-to-one.

Relation fields contain no join-table, SQL, REST, or GraphQL naming. Relation
handles keep those choices separate from model values:

```ts
declare const user: SchemaResult<typeof UserSchema>

const recentPosts = user
	.relation('posts')
	.query()
	.select({ id: true, title: true })
	.descending('createdAt')
	.limit(20)
	.after()
```

The same handle owns atomic mutation intent without exposing join rows:

```ts
const post = PostSchema.pointer('0198f090-2a50-7000-8000-000000000101')

await user.relation('posts').connect(post)
await user.relation('posts').disconnect(post)
await user.relation('posts').set([post])
await user.relation('posts').clear()
```

Every call inherits the active request or accepts the same terminal options as
a Query. It runs source update Access and hooks inside one transaction; inverse
pointer relations also run the target pointer update lifecycle. A database
adapter must advertise relation support. PostgreSQL implements scoped reads,
owning join storage, inverse traversal, mutations, and cleanup.

Source Queries can filter without materializing related collections:

```ts
const authorsWithTypedPosts = await UserSchema.query()
	.some('posts', (post) => post.contains('title', 'TypeScript'))
	.find()
```

The callback receives only the exact target filter surface. Nested `some`,
`none`, and `every` predicates remain portable Core Query AST and preserve
private target Access constraints.
