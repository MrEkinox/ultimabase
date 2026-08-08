# Native schema and field hooks

Field hooks are useful for behavior that depends only on one exact logical
value. Schema hooks handle rules that compare fields or transform a complete
operation.

```ts
import { Schema, enumField, stringField } from '@ultimabase/core'

export const AccountSchema = Schema.define({
	className: 'Account',
	fields: {
		email: stringField({
			validation: { required: true },
			hooks: {
				resolveInput: [
					({ value }) => value.trim(),
					({ value }) => {
						const normalized = value.toLowerCase()

						if (!normalized.includes('@')) {
							throw new TypeError('Invalid email')
						}

						return normalized
					},
				],
			},
		}),
		status: enumField({
			values: ['pending', 'active'] as const,
			default: 'pending',
			hooks: {
				resolveInput: ({ value }) => {
					// `value` is inferred as "pending" | "active".
					return value
				},
			},
		}),
	},
	// Cross-field rules use the complete schema-level operation.
	hooks: {
		resolveInput: {
			all: ({ operation }) => operation,
			create: ({ operation }) => {
				// One family handler covers createOne and createMany.
				return operation
			},
		},
		beforeOperation: {
			create: [
				({ item }) => console.log(item),
				({ operation }) => console.log(operation.kind),
			],
		},
		afterOperation: {
			update: ({ originalItem, item }) => {
				console.log(originalItem, item)
			},
		},
	},
})
```

Direct handlers remain the shortest form. Lists run sequentially in declaration
order. Field family maps expose `all`, `create`, `update`, and `upsert`. Schema
operation hooks group `create`, `update`, `upsert`, and `delete` below
`beforeOperation` or `afterOperation`, while one branch covers singular and bulk
terminals. Mutation observers may throw, but do not replace the operation or
result; use `resolveInput` for transformations. Reads are configured through
Query options and mandatory schema Access filters rather than schema hooks.

The hook declarations are copied and frozen privately. They do not appear in
`AccountSchema.fields.email.options`, validation plans, adapter metadata, or
migrations. Runtime execution is introduced by the native hook dispatcher;
declaration alone never invokes a callback.
