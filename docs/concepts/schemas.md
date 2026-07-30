# Schemas

Schemas are explicit TypeScript values registered in application configuration. There is no file discovery.

```ts
const UserSchema = defineSchema({
	className: 'User',
	fields: {
		name: stringField({
			validation: {
				required: true,
			},
		}),
	},
	extensions: [],
})
```

`className` is unique within an application. Registration fails on duplicates.

The schema package owns primitives and inference. Advanced capabilities use typed schema or field extensions so the schema package remains independent from their implementations.

System fields are reserved and excluded from create/update inputs. Output,
create-input, and update-input inference are separate contracts:

```ts
type User = InferObject<typeof UserSchema>
type CreateUserInput = InferCreateInput<typeof UserSchema>
type UpdateUserInput = InferUpdateInput<typeof UserSchema>
```

Persisted outputs contain required, defaulted, auto-incremented, and generated
values. Create inputs require only values that cannot be supplied by the
framework or a default. Update inputs contain only mutable,
developer-controlled values, all optional. Nullable fields accept `null` in
every applicable shape, and composite fields apply these rules recursively.

Plugin field helpers can carry operation-specific type overrides with
`FieldInferenceExtension` while their runtime extension configuration remains
opaque to Schema.
