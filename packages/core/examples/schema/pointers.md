# Pointer fields

`pointerField` represents one object reference without selecting a database or
transport representation. Its lazy callback supports circular declarations and
retains the exact target schema in TypeScript.

```ts
import {
	pointerField,
	Pointer,
	Schema,
	type InferCreateInput,
	type InferObject,
} from '@ultimabase/core'

export const UserSchema = Schema.define({
	className: 'User',
	fields: {},
})

export const PostSchema = Schema.define({
	className: 'Post',
	fields: {
		author: pointerField({
			target: () => UserSchema,
			validation: { required: true },
			indexed: true,
			onDelete: 'restrict',
		}),
		reviewer: pointerField({
			target: () => UserSchema,
			validation: { nullable: true },
			onDelete: 'setNull',
		}),
	},
})

const author = UserSchema.pointer('0198f090-2a50-7000-8000-000000000034')
const equivalent = new Pointer(UserSchema, author.id)

author.equals(equivalent) // true
author.toJSON() // { type: "pointer", className: "User", id: "..." }

export type Post = InferObject<typeof PostSchema>
export type CreatePostInput = InferCreateInput<typeof PostSchema>
```

`Post['author']` and `CreatePostInput['author']` are both
`Pointer<typeof UserSchema>`. The value never loads the user. Query inclusion
loads one bounded target explicitly, while to-many collections use the separate
`relationField` declaration shown in the relations example.
