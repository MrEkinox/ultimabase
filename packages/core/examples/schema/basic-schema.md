# Basic schema

`Schema.define()` combines typed field declarations and automatically adds the
framework-owned `id`, `createdAt`, and `updatedAt` fields.

```ts
import {
	Schema,
	type InferCreateInput,
	type InferObject,
	type InferUpdateInput,
} from '@ultimabase/core'

export const UserSchema = Schema.define({
	className: 'User',
	fields: (field) => ({
		username: field.string({
			indexed: 'unique',
			required: true,
		}),
		displayName: field.string({
			required: true,
		}),
		bio: field.string(),
		isActive: field.boolean({ default: true }),
	}),
})

// Application initialization compiles the callback before plugin setup.

// Persisted objects include generated system fields and resolved defaults.
export type User = InferObject<typeof UserSchema>

// Create and update inputs expose only values writable for that operation.
export type CreateUserInput = InferCreateInput<typeof UserSchema>
export type UpdateUserInput = InferUpdateInput<typeof UserSchema>
```

The callback is retained during module evaluation. Application static
compilation executes it once before plugin setup and freezes the resulting
field registry. The generated application contract supplies its exact public
TypeScript model. Until compilation succeeds, only schema identity such as
`UserSchema.className` is available; constructing a model or reading its fields
throws `SchemaCompilationError`.

`User` is an immutable persisted snapshot. `CreateUserInput` requires
`username` and `displayName` but omits system fields, while `UpdateUserInput`
makes every writable developer field optional.

Singular schema mutations can project their public result without changing the
complete values retained by Runtime for installed behaviors:

```ts
const created = await UserSchema.createOne({
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

Collection mutations return identifiers by default and can request a wider
projection without changing itemized execution:

```ts
const renamedUsers = await UserSchema.updateMany({
	data: [
		{
			where: { id: { eq: userId } },
			data: { displayName: 'Anonymous' },
		},
	],
})
// [{ id }, ...]

const removedUsers = await UserSchema.deleteMany({
	where: [{ id: { eq: userId } }],
	select: { id: true, username: true },
})
// [{ id, username }, ...]
```
