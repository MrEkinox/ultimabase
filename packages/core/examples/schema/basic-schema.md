# Basic schema

`Schema.define()` combines typed field declarations and automatically adds the
framework-owned `id`, `createdAt`, and `updatedAt` fields.

```ts
import {
	booleanField,
	Schema,
	stringField,
	type InferCreateInput,
	type InferObject,
	type InferUpdateInput,
} from '@ultimabase/core'

export const UserSchema = Schema.define({
	className: 'User',
	fields: {
		username: stringField({
			indexed: 'unique',
			validation: {
				required: true,
				length: { min: 3, max: 32 },
				match: /^[a-z0-9_]+$/u,
			},
		}),
		displayName: stringField({
			validation: {
				required: true,
				length: { min: 1, max: 80 },
			},
		}),
		bio: stringField({
			validation: {
				length: { max: 500 },
			},
		}),
		isActive: booleanField({ default: true }),
	},
})

// Persisted objects include generated system fields and resolved defaults.
export type User = InferObject<typeof UserSchema>

// Create and update inputs expose only values writable for that operation.
export type CreateUserInput = InferCreateInput<typeof UserSchema>
export type UpdateUserInput = InferUpdateInput<typeof UserSchema>
```

`User` is an immutable persisted snapshot. `CreateUserInput` requires
`username` and `displayName` but omits system fields, while `UpdateUserInput`
makes every writable developer field optional.

Singular schema mutations can project their public result without changing the
complete values available to mutation hooks:

```ts
const created = await UserSchema.create({
	data: { username: 'ada', displayName: 'Ada' },
	select: { id: true, username: true },
})

const renamed = await UserSchema.updateOne({
	where: { username: { eq: 'ada' } },
	data: { displayName: 'Ada Lovelace' },
	select: { id: true, displayName: true },
})

const deleted = await UserSchema.deleteOne({
	where: { username: { eq: 'ada' } },
	select: { id: true, username: true },
})

created.toJSON() // { id, username }
renamed?.toJSON() // { id, displayName }
deleted?.toJSON() // { id, username }
```

Set-based mutations return identifiers by default and can request a wider
projection without enabling per-object mutation hooks:

```ts
const renamedUsers = await UserSchema.updateMany({
	where: { displayName: { eq: null } },
	data: { displayName: 'Anonymous' },
})
// [{ id }, ...]

const removedUsers = await UserSchema.deleteMany({
	where: { displayName: { eq: 'Anonymous' } },
	select: { id: true, username: true },
})
// [{ id, username }, ...]
```
