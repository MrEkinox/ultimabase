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
					({ value }) => value.toLowerCase(),
				],
				resolveOutput: ({ value }) => value,
				onChange: ({ change }) => {
					// Absence is explicit; `undefined` is never a field value.
					if (change.current.present) {
						change.current.value.toUpperCase()
					}
				},
			},
		}),
		status: enumField({
			values: ['pending', 'active'] as const,
			default: 'pending',
			hooks: {
				beforeSave: ({ value }) => {
					// `value` is inferred as "pending" | "active".
					void value
				},
			},
		}),
	},
	// Cross-field rules use the complete schema-level operation.
	hooks: {
		beforeSave: {
			all: ({ operation }) => operation,
			create: ({ operation }) => {
				// One family handler covers createOne and createMany.
				return operation
			},
		},
		beforeFind: [({ query }) => query.limit(100), ({ query }) => query],
	},
})
```

Direct handlers remain the shortest form. Lists run sequentially in declaration
order. Broad family maps use `all` for shared behavior and only offer compatible
`create`, `update`, `upsert`, `delete`, or `find` keys. The terminal `kind`
distinguishes singular and bulk operations when necessary; there are no
duplicated `one` and `many` declarations.

The hook declarations are copied and frozen privately. They do not appear in
`AccountSchema.fields.email.options`, validation plans, adapter metadata, or
migrations. Runtime execution is introduced by the native hook dispatcher;
declaration alone never invokes a callback.
