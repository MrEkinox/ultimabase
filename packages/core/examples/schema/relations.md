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
handles, mutations, predicates, and physical storage are separate capabilities.
