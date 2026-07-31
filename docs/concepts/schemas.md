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
every applicable shape, and object fields apply these rules recursively.

Every developer field accepts `list: true` for one homogeneous list level.
Non-empty tuples such as `list: [true, true]` preserve nested list depth without
introducing a separate array field kind. Field nullability applies to the
complete list; list elements remain non-null.

Plugin field helpers can carry operation-specific type overrides with
`FieldInferenceExtension` while their runtime extension configuration remains
opaque to Schema.

## Registration

Each application owns a separate `SchemaRegistry`. Constructor-provided schemas
retain literal-name lookup inference, registrations preserve configuration
order, and `values()` returns an immutable snapshot. Plugins may register
additional internal schemas during setup without sharing state with another
application.

Duplicate `className` values fail with `DuplicateSchemaError`; a failed
registration never replaces the previously registered definition.

## Indexes

Fields use `indexed: true` or `indexed: "unique"` for single-field indexes.
`defineSchema({ indexes })` adds composite indexes with at least two distinct
top-level fields. Composite declarations may reference `id`, `createdAt`, and
`updatedAt` in addition to developer fields.

Schema combines both declaration styles into one immutable ordered
`schema.indexes` list. It contains no SQL, table names, or Drizzle values;
database adapters own physical compilation and table naming.

## Validation plans

`compileValidationPlans(schema)` derives separate create and update plans.
Every field plan records its expected kind, nullability, input presence, and
primitive constraints. Object fields reject unknown properties recursively.
List metadata compiles into one or more array plan wrappers around the original
scalar or object plan.

Defaults remain inert descriptors during compilation: static values are
retained, runtime factories are never called, and database defaults remain
adapter-owned. Runtime later executes the plan and returns `ValidationIssue`
objects with stable codes and nested paths.
