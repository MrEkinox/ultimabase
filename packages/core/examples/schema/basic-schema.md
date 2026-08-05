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
