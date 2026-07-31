# @ultimabase/schema

Static schema declarations are the source of truth for UltimaBase.

Responsibilities:

- `defineSchema`;
- primitive field definitions;
- system-field metadata;
- schema and field extension contracts;
- normalized index metadata;
- TypeScript inference;
- transport-neutral validation plans;
- isolated `SchemaRegistry` instances.

This package must not know ACL, CLP, roles, PostgreSQL, Drizzle, Hono, or GraphQL. Optional capabilities contribute opaque, typed extensions that runtime plugins later claim.

## Schema definitions

`defineSchema(options)` combines existing field definitions into immutable
schema metadata while preserving the exact class name, field keys, field kinds,
and ordered extension tuple:

```ts
const PostSchema = defineSchema({
	className: 'Post',
	fields: {
		title: stringField({
			validation: {
				required: true,
			},
		}),
		published: booleanField({ default: false }),
	},
	extensions: [permissionsExtension],
})
```

The input field map and extension list are copied and frozen. Child fields and
extensions retain their existing immutable identity. Omitted extensions become
an immutable empty tuple so consumers never need to normalize optional
metadata.

`id`, `createdAt`, and `updatedAt` are reserved for UltimaBase system fields.
Developer declarations using those keys fail both TypeScript checking and
runtime declaration.

## System fields

Every schema field map includes three immutable framework-owned definitions:

- `id` is a `string` value represented by the `uuid` field kind with
  `uuidVersion: 7`;
- `createdAt` and `updatedAt` are server-side `Date` values represented by the
  `date` field kind.

System options expose `system: true`, `generatedOn`, `immutable: true`, and
`validation.required: true`. The identifier and both timestamps are generated
during creation; `updatedAt` is additionally refreshed during persisted
updates. These markers let input inference exclude generated fields from
creates and immutable fields from developer updates without checking reserved
names.

Schema only declares this contract. UUID and timestamp generation belongs to
Runtime, while database-native compilation belongs to adapter plugins.

## Inferred data shapes

Schema exports three operation-specific helpers:

```ts
type Post = InferObject<typeof PostSchema>
type CreatePostInput = InferCreateInput<typeof PostSchema>
type UpdatePostInput = InferUpdateInput<typeof PostSchema>
```

`InferObject` describes persisted values returned by UltimaBase. Required,
defaulted, auto-incremented, and system-generated fields are always present;
other fields remain optional. Its properties are readonly because persisted
objects are immutable snapshots.

`InferCreateInput` excludes server-generated fields. Required fields must be
provided unless a default or auto-increment supplies their value. Immutable
developer fields remain accepted during creation.

`InferUpdateInput` excludes generated and immutable fields, and makes every
remaining property optional. In all three modes, `validation.nullable: true`
adds `null` to the complete field value. Object fields apply the same rules
recursively, including when they are lists.

## Generic field contract

- `FieldValidationOptions` represents omission and nullability inside the `validation` option. Fields are optional and non-null by default, and `required: true` cannot be combined with `nullable: true`.
- `FieldOptions<TValue, TValidation>` adds typed defaults, homogeneous lists, field-value immutability, `indexed`, descriptions, and field extensions without introducing database-specific metadata. `list: true` creates one list level, a tuple such as `list: [true, true]` creates nested lists, and `false` disables list wrapping explicitly. `indexed: true` requests a regular index, `indexed: "unique"` requests a unique index, and `false` disables indexing explicitly.
- `FieldDefinition<TKind, TValue, TOptions>` preserves the literal field kind, its base value type, and its exact readonly options for later schema inference.

These contracts are type-only. Concrete field factories will construct and freeze their runtime metadata in their dedicated implementations.

## Indexes

Single-field indexes stay next to their field:

```ts
slug: stringField({
	indexed: 'unique',
})
```

Schema-level declarations represent composite indexes and require at least two
distinct top-level fields:

```ts
const PostSchema = defineSchema({
	className: 'Post',
	fields: {
		authorId: stringField(),
		slug: stringField({ indexed: 'unique' }),
	},
	indexes: [
		{ fields: ['authorId', 'createdAt'] },
		{ fields: ['authorId', 'slug'], unique: true },
	],
})
```

Developer and reserved system-field names are checked statically and at
runtime. Every schema exposes one immutable normalized `indexes` list:
field-level declarations appear in field order, followed by composite
declarations in configuration order. Each entry contains a non-empty `fields`
tuple and an explicit boolean `unique` value.

This contract expresses portable indexing intent only. Adapter plugins decide
how to compile supported indexes and reject unsupported nested metadata. Table
naming is likewise owned by the concrete database adapter rather than Schema.

## Validation plans

`compileValidationPlans(schema)` produces immutable create and update contracts
from the same field metadata used for inference:

```ts
const plans = compileValidationPlans(UserSchema)

plans.create.fields.name?.presence // "required", "optional", or "forbidden"
plans.update.unknownFields // "reject"
```

Plans preserve primitive constraints, enum domains, object and list structure,
nullability, and default ownership. Static values, runtime factories, and
`DatabaseDefault` instances use separate discriminated descriptors. Compilation
never invokes a factory or executes a constraint.

Create plans require only fields without a default or generated value. Update
plans make mutable fields optional and mark generated or immutable fields as
forbidden. List items are always required, non-null values rather than optional
properties, while object children apply the active operation recursively.

`ValidationIssue` defines closed stable codes and paths containing property
names and array offsets. Runtime will execute these plans before access checks
and hooks; Schema does not validate request data itself and does not depend on a
third-party schema language.

## Default values

Static defaults keep the direct syntax and exact literal inference:

```ts
stringField({
	default: 'draft',
})
```

Runtime defaults use a simple arrow function:

```ts
dateField({
	default: () => new Date(),
})
```

The callback is stored without being executed during schema declaration. Every
function supplied as `default` is interpreted as a runtime factory;
function-valued static defaults are therefore unsupported. Composite fields
validate the factory return type before considering static object shapes.

`DatabaseDefault<TValue, TConfig>` is the neutral low-level contract used by
adapter plugins for database-generated values. Its name and copied
configuration are immutable. Schema can classify metadata as `static`,
`runtime`, or `database` with `getDefaultKind`, but it never interprets or
executes database expressions.

## String fields

`stringField(options)` creates immutable string metadata while preserving literal options for later schema inference. Calling `stringField()` defines an optional, non-null string.

String fields add declarative `validation.length.min`, `validation.length.max`, and `validation.match` constraints. Lengths must be non-negative safe integers, and `min` cannot exceed `max`. Match constraints use native `RegExp` values and are stored as metadata; validation is compiled by the runtime rather than executed by the field factory.

## Number fields

`numberField(options)` requires an explicit `mode`:

- `integer` represents safe JavaScript integers;
- `float` represents general JavaScript numbers without promising decimal precision.

Both modes support `validation.range.min`, `validation.range.max`, and `validation.finite`. Integer boundaries must be safe integers, float boundaries must be finite numbers, and `min` cannot exceed `max`. These constraints remain declarative metadata for the runtime validation plan. A future exact decimal field will use a separate value and storage contract.

Integer fields additionally support `autoIncrement: true | false` as declarative database-sequence metadata. Float fields reject this option at both the TypeScript and runtime boundaries.

## Boolean fields

`booleanField(options)` creates immutable boolean metadata and preserves literal `true` or `false` defaults. It uses the common presence validation and field options without adding boolean-specific constraints.

## Date fields

`dateField(options)` represents server-side JavaScript `Date` values. Static defaults and `validation.range.min/max` boundaries accept only valid `Date` objects; Schema snapshots supplied dates and rejects inverted ranges. ISO string serialization belongs to transport packages and is deliberately absent here.

## Enum fields

`enumField(options)` accepts an inline string list, a native TypeScript string enum, or a symbolic key-value mapping:

```ts
enumField({
	values: {
		Draft: 'draft',
		Published: 'published',
	},
	default: 'draft',
})
```

Persisted values form the exact inferred string union, while mapping keys remain available to future GraphQL and SDK generators. Sources must be non-empty, persisted values must be unique, and static defaults must belong to the inferred domain. Numeric TypeScript enums are rejected because their runtime reverse mappings do not represent a string domain.

`typeName` optionally gives an enum a stable, generator-neutral identity:

```ts
enumField({
	typeName: 'PostStatus',
	values: ['draft', 'published'],
})
```

When omitted, generators derive a deterministic name from the owning schema and
field path. Schema only requires explicit names to be non-empty; each generator
owns its naming syntax and collision checks.

## JSON, object, and list fields

`jsonField(options)` represents portable JSON values through the recursive
`JsonValue` type. JSON defaults accept only null, booleans, finite numbers,
strings, arrays, and plain objects. They are copied and deeply frozen; values
such as `undefined`, `Date`, `BigInt`, functions, and circular references are
rejected.

Every developer field supports homogeneous lists without changing its field
kind:

```ts
stringField({ list: true })
numberField({ mode: 'integer', list: [true, true] })
```

`objectField({ fields })` composes existing fields into one structured value:

```ts
objectField({
	typeName: 'Profile',
	fields: {
		displayName: stringField({
			validation: {
				required: true,
			},
		}),
		preferences: objectField({
			fields: {
				darkMode: booleanField(),
			},
		}),
		tags: stringField({ list: true }),
	},
})
```

`typeName` follows the same optional identity contract as enum fields. A
generator may use it as the base for distinct output, create-input,
update-input, filter, or other generated type names.

`list: true` wraps the scalar or object value once. A non-empty tuple containing
only `true` values declares its exact depth, so `list: [true, true]` represents a
list of lists. The tuple and static list defaults are copied and frozen.
`validation.nullable` applies to the complete field; list elements are
non-null. Object definitions may nest to any finite depth, field-definition
cycles are rejected, and child definitions remain reusable immutable values.
Structured defaults are detached from caller-owned values and recursively
frozen.

Schema does not select a physical representation. PostgreSQL storage and
Drizzle compilation remain adapter concerns; ADR-0021 defines JSONB as the
portable default mapping without adding database metadata to this package.

## Typed extensions

- `defineSchemaExtension(name, config)` creates plugin-owned schema metadata.
- `defineFieldExtension(name, config)` creates plugin-owned field metadata.
- `defineExtensions(extensions)` copies and freezes a list while rejecting duplicate names within the same scope.

Each extension exposes the literal `scope`, `name`, and typed readonly `config` properties. Schema transports this opaque configuration without interpreting it; the owning runtime plugin will provide its handler.

Schema and field names use separate namespaces. The same name may therefore exist once in each scope, while two schema extensions or two field extensions with the same name produce a `TypeError`. Extension values and their configuration objects are shallowly copied and frozen.

Plugins that transform field values may expose a
`FieldInferenceExtension<Name, Config, Inference>` from their own field helper.
The optional `object`, `create`, and `update` entries override only the
corresponding inferred value. Returning `never` removes the field from that
shape. Exact extension tuples compose in declaration order, so a later
extension may intentionally refine an earlier result without exposing its
type-only contract at runtime.

## Schema registry

`SchemaRegistry` stores explicit schema definitions for one application without
using global mutable state:

```ts
const registry = new SchemaRegistry([UserSchema, PostSchema])

registry.get('User') // typeof UserSchema | undefined
registry.has('Post') // boolean
registry.values() // immutable registration-order snapshot
```

Schemas supplied directly to the constructor retain literal `className`
inference during lookup. `register(schema)` supports later plugin-owned
contributions; because dynamic calls cannot change an existing variable's
generic type, those lookups safely return `SchemaDefinition | undefined`.

Each registry owns an independent native `Map`, whose insertion order defines
iteration order. Registering an existing class name throws
`DuplicateSchemaError` with the stable `SCHEMA_DUPLICATE_CLASS_NAME` code and
does not replace the original schema.
