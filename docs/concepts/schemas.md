# Schemas

Schemas are explicit TypeScript classes registered in application configuration. There is no file discovery.

```ts
const UserSchema = Schema.define({
	className: 'User',
	fields: (field) => ({
		name: field.string({
			validation: {
				required: true,
			},
		}),
	}),
	extensions: [],
})
```

`className` is unique within an application. Registration fails on duplicates.

`Schema.define()` returns the registered model class. `new UserSchema(input)`
creates an immutable draft without I/O, schema-root methods execute object-input
reads, and Runtime results are `UserSchema` instances whose direct properties
and `toJSON()` contain only visible fields.

Static schema declarations own runtime metadata. The generated application
registry owns precise public item, input, query, Access, and hook types. Advanced
capabilities use schema or field extensions so Core remains independent from
their implementations.

System fields are reserved and excluded from create/update inputs. Generated
output, create-input, and update-input contracts remain separate:

```ts
type User = Schemas.User.Item
type CreateUserInput = Schemas.User.Inputs['create']
type UpdateUserInput = Schemas.User.Inputs['update']
```

Before code generation, models intentionally expose only `BaseItem`: a stable
string identifier plus unknown application fields. Core does not infer the
field map as a fallback. Runtime-oriented tests must narrow those unknown
values; generated-contract tests prove the exact replacement separately.

Persisted outputs contain required, defaulted, auto-incremented, and generated
values. Create inputs require only values that cannot be supplied by the
framework or a default. Update inputs contain only mutable,
developer-controlled values, all optional. Nullable fields accept `null` in
every applicable shape, and object fields apply these rules recursively.

Every developer value field accepts `list: true` for one homogeneous,
one-dimensional list. `list: false` keeps the scalar value explicitly. Field
nullability applies to the complete list; list elements remain non-null. Data
that intentionally contains nested arrays belongs in `jsonField()` so its
unstructured shape is explicit.

Enum and object fields may declare an optional generator-neutral `typeName`.
Explicit names provide stable reusable type identity; when omitted, generators
derive deterministic names from the schema and field path. Schema validates
only that an explicit name is non-empty. GraphQL and other generators own their
syntax, derived suffixes, and collision detection.

Field extensions remain opaque runtime metadata and never alter generated
object, create-input, or update-input shapes. Plugins that introduce a distinct
logical value expose a plugin-defined field with that value type instead.

Built-in field factories retain only the normalized booleans and list state
needed by runtime metadata and code generation. Runtime constraints and literal defaults remain
available in immutable field options without being repeated in editor hovers;
enum domains and object child maps stay exact because they define value shapes.

## Registration

Each application owns a separate `SchemaRegistry`. Constructor-provided schemas
preserve literal-name lookup and configuration order.
Application initialization compiles all deferred field callbacks atomically
before plugin setup, closes registration, and exposes an immutable snapshot.
Plugins receive a read-only compiled registry and cannot register additional
schemas during setup.

The builder callback is synchronous and executes once per accepted application
compilation. Before compilation, only schema identity is available; model
construction and field-dependent metadata fail explicitly. Internal tests,
framework-owned schemas, and application declarations all use the same builder
shape. Exact application field types still come only from the generated registry.

Duplicate `className` values fail with `DuplicateSchemaError`; a failed
registration never replaces the previously registered definition.

## Indexes

Fields use `indexed: true` or `indexed: "unique"` for single-field indexes.
`Schema.define({ indexes })` adds composite indexes with at least two distinct
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
List metadata compiles into one array wrapper around the original scalar or
object node. Runtime later executes this structural plan and returns
`ValidationIssue` objects with stable codes and nested paths.

Runtime reads defaults or framework generation metadata from the retained field,
traverses object and array plan nodes, then passes each unknown leaf through the
public `snapshotScalarFieldValue(field, value, path)` boundary. Schema reuses
the field's private registered capability without exposing it or duplicating
scalar normalization in Runtime.
