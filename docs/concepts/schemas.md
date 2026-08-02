# Schemas

Schemas are explicit TypeScript values registered in application configuration. There is no file discovery.

```ts
const UserSchema = new Schema({
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

Enum and object fields may declare an optional generator-neutral `typeName`.
Explicit names provide stable reusable type identity; when omitted, generators
derive deterministic names from the schema and field path. Schema validates
only that an explicit name is non-empty. GraphQL and other generators own their
syntax, derived suffixes, and collision detection.

Field extensions remain opaque runtime metadata and never alter inferred
object, create-input, or update-input shapes. Plugins that introduce a distinct
logical value expose a plugin-defined field with that value type instead.

Built-in field factories retain only the normalized booleans and list depth
needed for operation inference. Runtime constraints and literal defaults remain
available in immutable field options without being repeated in editor hovers;
enum domains and object child maps stay exact because they define value shapes.

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
`new Schema({ indexes })` adds composite indexes with at least two distinct
top-level fields. Composite declarations may reference `id`, `createdAt`, and
`updatedAt` in addition to developer fields.

Schema combines both declaration styles into one immutable ordered
`schema.indexes` list. It contains no SQL, table names, or Drizzle values;
database adapters own physical compilation and table naming.

## Validation plans

`compileValidationPlans(schema)` derives separate create and update plans.
Every node records input presence and nullability while retaining its original
declared field. Scalar constraints and defaults stay exclusively in that field
instead of being reconstructed in a parallel plan model. Compilation never
invokes runtime default factories.

Object fields add recursively compiled children and reject unknown properties.
List metadata compiles into one or more array wrappers around the original
scalar or object node. Runtime later executes this structural plan and returns
`ValidationIssue` objects with stable codes and nested paths.

Runtime reads defaults or framework generation metadata from the retained field,
traverses object and array plan nodes, then passes each unknown leaf through the
public `snapshotScalarFieldValue(field, value, path)` boundary. Schema reuses
the field's private registered capability without exposing it or duplicating
scalar normalization in Runtime.
