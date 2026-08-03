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
	.select('id', 'title')
	.descending('createdAt')
	.limit(20)
	.after()
```

The handle and its complete target Query surface are implemented. Relation
mutation and PostgreSQL execution examples will be added with their dedicated
issues; until then Runtime refuses to lose the private relationship scope.
