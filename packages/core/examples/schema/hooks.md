# Native schema and field hooks

Field hooks are useful for behavior that depends only on one exact logical
value. Schema hooks handle rules that compare fields or transform a complete
operation.

```ts
import { Schema, enumField, stringField } from '@ultimabase/core'

export const AccountSchema = new Schema({
	className: 'Account',
	fields: {
		email: stringField({
			validation: { required: true },
			hooks: {
				resolveInput: ({ value }) => value.trim().toLowerCase(),
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
		beforeSave: ({ operation }) => operation,
	},
})
```

The hook declarations are copied and frozen privately. They do not appear in
`AccountSchema.fields.email.options`, validation plans, adapter metadata, or
migrations. Runtime execution is introduced by the native hook dispatcher;
declaration alone never invokes a callback.
