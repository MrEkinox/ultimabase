# Pointer fields

`field.pointer()` represents one object reference without selecting a database
or transport representation. Its schema-name target supports circular
declarations, while code generation restores the exact target type.

```ts
import {
	Pointer,
	UltimaBase,
	type InferCreateInput,
	type InferObject,
} from '@ultimabase/core'

export const UserSchema = UltimaBase.Schema.define({
	className: 'User',
	fields: (field) => ({}),
})

export const PostSchema = UltimaBase.Schema.define({
	className: 'Post',
	fields: (field) => ({
		author: field.pointer({
			target: 'User',
			required: true,
			indexed: true,
			onDelete: 'restrict',
		}),
		reviewer: field.pointer({
			target: 'User',
			onDelete: 'setNull',
		}),
	}),
})

const author = UserSchema.pointer('0198f090-2a50-7000-8000-000000000034')
const equivalent = UserSchema.pointer(author.id)

author.equals(equivalent) // true
author.toJSON() // { type: "pointer", className: "User", id: "..." }

export type Post = InferObject<typeof PostSchema>
export type CreatePostInput = InferCreateInput<typeof PostSchema>
```

`Post['author']` is `Pointer<typeof UserSchema>`; create data links it as
`{ connect: author }` (ADR-0308), never as a raw value. The value never loads
the user. Query inclusion
loads one bounded target explicitly, while to-many collections use the separate
`relationField` declaration shown in the relations example.

After the application starts, `author.findOne(undefined)` reads
that exact User under the active policy. It returns `null` when the target is
missing or filtered out; `author.exists({})` returns `false`
in those cases. Neither read grants access. Explicit policy denials and unexpected errors
propagate and abort an active transaction.
