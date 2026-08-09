# Native schema and field hooks

Field hooks are useful for behavior that depends only on one exact logical
value. Schema hooks handle rules that compare fields or transform a complete
operation.

```ts
import { Schema } from '@ultimabase/core'

export const AccountSchema = Schema.define({
	className: 'Account',
	fields: (field) => ({
		email: field.string({
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
		status: field.enum({
			values: ['pending', 'active'] as const,
			default: 'pending',
			hooks: {
				resolveInput: ({ value }) => {
					// `value` is inferred as "pending" | "active".
					return value
				},
			},
		}),
	}),
	// Cross-field rules use the complete schema-level operation.
	hooks: {
		resolveInput: {
			all: ({ operation }) => operation,
			create: ({ kind, operation, originalItem }) => {
				// Public kind is cardinality-free; the normalized AST remains create-one.
				console.log(kind, operation.kind, originalItem)
				return operation
			},
		},
		beforeOperation: {
			create: [
				({ item }) => console.log(item),
				({ kind }) => console.log(kind),
			],
		},
		afterOperation: {
			update: ({ context, originalItem, item }) => {
				console.log(originalItem, item)
				context.emit('account.updated', { id: item.id })
			},
		},
	},
})
```

Direct handlers remain the shortest form. Lists run sequentially in declaration
order. Field family maps expose `all`, `create`, `update`, and `upsert`. Schema
operation hooks group `create`, `update`, and `delete` below `beforeOperation`;
`afterOperation` additionally exposes `upsert` because the database chooses
that branch atomically. Collection commands are itemized first, so one branch
runs once per affected item. `beforeOperation.create` exposes `kind: "create"`
and the complete candidate `item` without an internal operation AST. Mutation
observers may throw, but do not replace the operation or result; use
`resolveInput` for transformations. Reads are configured through Query options
and mandatory schema Access filters rather than schema hooks.

After-operation `item` values are complete persisted schema models regardless
of the command's `select`. Hooks do not receive a separate public `result`.
Calling `context.emit()` queues immutable data for delivery only after commit.

All item-oriented mutation callbacks use `create`, `update`, `upsert`, or
`delete` as `kind`. Callbacks that also expose `operation` keep the normalized
terminal in `operation.kind`, such as `update-one`.

The hook declarations are copied and frozen privately. They do not appear in
`AccountSchema.fields.email.options`, validation plans, adapter metadata, or
migrations. Runtime execution is introduced by the native hook dispatcher;
declaration alone never invokes a callback.
