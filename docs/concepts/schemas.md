# Schemas

Schemas are explicit TypeScript values registered in application configuration. There is no file discovery.

```ts
const UserSchema = defineSchema({
	className: 'User',
	fields: {
		name: stringField({
			required: true,
		}),
	},
	extensions: [],
})
```

`className` is unique within an application. Registration fails on duplicates.

The schema package owns primitives and inference. Advanced capabilities use typed schema or field extensions so the schema package remains independent from their implementations.

System fields are reserved and excluded from create/update inputs. Output, create-input, and update-input inference are separate contracts.
