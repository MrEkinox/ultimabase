# Core Schema domain

Static schema declarations are the source of truth for UltimaBase.

Responsibilities:

- `Schema`;
- primitive field definitions;
- system-field metadata;
- schema and field extension contracts;
- plugin-defined logical field contracts;
- normalized index metadata;
- TypeScript inference;
- transport-neutral validation plans;
- isolated `SchemaRegistry` instances.

This domain must not know ACL, CLP, roles, PostgreSQL, Drizzle, Hono, or GraphQL. Optional capabilities contribute opaque, typed extensions that runtime plugins later claim.

Practical declarations are available in the package's
[`examples/schema`](../examples/schema/README.md) directory. They are documentation snippets,
not executable fixtures or test inputs.

## Internal layout

Schema implementation files are grouped by domain while `src/index.ts` remains
the only public manifest:

```text
examples/
src/
├── fields/
│   ├── base/
│   ├── builtins/
│   ├── constraints/
│   └── plugin.ts
├── schema/
├── hooks/
├── plans/
├── inference/
└── extensions/
```

Dependencies flow from Shared runtime guards and `fields/base`, through
constraints and built-in fields, into schema composition, inference, and
validation plans. Scalar factories and ordered ranges reuse internal typed
construction helpers so each concrete field owns only its specialized rules.
Internal folders deliberately have no barrel files or published subpath
exports. Focused runtime and compile-time tests are colocated with the source
they protect and use the root source entry unless they specifically verify an
internal invariant. The package-level `tests/` directory is reserved for
cross-domain behavior and public-export checks.

## Schema definitions

`new Schema(options)` combines existing field definitions into immutable schema
metadata while preserving the exact class name, field keys, field kinds,
and ordered extension tuple:

```ts
const PostSchema = new Schema({
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

The public constructor and field factories also protect JavaScript callers at
runtime. Schema names, field maps, field definitions, common option flags,
extension definitions, and static defaults are validated before their
immutable snapshots are exposed. Each result is an actual frozen `Schema`
instance, so class identity is available without introducing mutable metadata.
Registries and cross-package runtime boundaries use `Schema.is(value)` to reject
objects that only imitate the public metadata shape.
Field definitions carry private factory provenance, so a structurally similar
object cannot bypass validation or provide a forged snapshot capability.

## Native schema hook declarations

`new Schema({ hooks })` accepts the complete typed schema lifecycle directly.
Create, update, upsert, delete, save, find, and general operation handlers cover
their singular and bulk terminals through one callback. `operation.kind`
narrows the exact operation, while result handlers preserve its corresponding
result type.

```ts
const ArticleSchema = new Schema({
	className: 'Article',
	fields: {
		title: stringField({ validation: { required: true } }),
	},
	hooks: {
		beforeFind: ({ query }) => query.limit(100),
		afterFind: (input) => {
			if (input.kind === 'count') {
				return Math.max(input.result, 0)
			}

			return input.result
		},
	},
})
```

The declaration record is copied and frozen outside enumerable schema metadata.
Changing only hooks cannot alter validation plans, adapter schemas, or
migrations. Issue 325 declares and retains these callbacks; issue 330 connects
them to Runtime execution.

## Inline field hook declarations

Common field options accept `hooks` as a declaration-only capability. Each
handler receives this field's exact logical type without access to sibling
schema values:

```ts
const ProfileSchema = new Schema({
	className: 'Profile',
	fields: {
		displayName: stringField({
			hooks: {
				resolveInput: ({ value }) => value.trim(),
				onChange: ({ change, timing }) => {
					// `timing` is exactly "before-commit" here.
					if (change.current.present) {
						change.current.value.toUpperCase()
					}
				},
			},
		}),
	},
})
```

`resolveInput` and `resolveOutput` are the explicit same-type transformation
boundaries. Validation returns structured immutable issues, while CRUD/save,
change, commit, rollback, and error phases are effect handlers. An omitted
optional field runs no value hook. Actual absence is represented by
`FieldValueState` with `present: false`, never by fabricating an `undefined`
logical value.

Set-based `updateMany` can run input resolution and validation over its supplied
update values, but it does not run materialized update or change hooks per row.
Set-based `deleteMany` runs no field CRUD hooks. Cross-field behavior belongs to
schema hooks.

Nested fields use one deterministic depth-first order. Siblings retain field
declaration order; input resolution, validation, and output resolution visit
children before their parent; before CRUD/save handlers enter parent then
children; after handlers unwind children then parent. Callback declarations are
stored in private field capabilities and never appear in field metadata,
validation plans, indexes, migrations, or physical schema diffs. Issue 326
declares this contract; issue 330 executes it.

`id`, `createdAt`, and `updatedAt` are reserved for UltimaBase system fields.
Developer declarations using those keys fail both TypeScript checking and
runtime declaration.

## System fields

Every schema field map includes three immutable framework-owned definitions:

- `id` is a `string` value represented by the `uuid` field kind with
  `uuidVersion: 7`;
- `createdAt` and `updatedAt` are zoned ISO date-time strings represented by the
  `dateTime` field kind.

System options expose `system: true`, `generatedOn`, `immutable: true`, and
`validation.required: true`. The identifier and both timestamps are generated
during creation; `updatedAt` is additionally refreshed during persisted
updates. These markers let input inference exclude generated fields from
creates and immutable fields from developer updates without checking reserved
names.

Schema only declares this contract. UUID and date-time generation belongs to
Runtime, while database-native compilation belongs to adapter plugins.

## Inferred data shapes

Schema exports three operation-specific helpers:

```ts
type Post = InferObject<typeof PostSchema>
type CreatePostInput = InferCreateInput<typeof PostSchema>
type UpdatePostInput = InferUpdateInput<typeof PostSchema>
```

`InferObject` describes persisted values returned by UltimaBase. Required,
defaulted, `autoNow`, auto-incremented, and system-generated fields are always present;
other fields remain optional. Its properties are readonly because persisted
objects are immutable snapshots.

`InferCreateInput` excludes server-generated fields. Required fields must be
provided unless a default, `autoNow`, or auto-increment supplies their value. Immutable
developer fields remain accepted during creation.

`InferUpdateInput` excludes generated and immutable fields, and makes every
remaining property optional. In all three modes, `validation.nullable: true`
adds `null` to the complete field value. Object fields apply the same rules
recursively. A listed object uses create-input rules for each complete
replacement item during update.

The final mapped shapes are materialized at the public inference boundary.
Editor hovers therefore show concrete properties such as
`readonly externalId?: string` instead of internal required/optional mapped
type intersections. This presentation change does not widen values or alter
operation-specific presence rules.

## Generic field contract

- `FieldValidationOptions` represents omission and nullability inside the `validation` option. Fields are optional and non-null by default, and `required: true` cannot be combined with `nullable: true`.
- `FieldOptions<TValue, TValidation>` adds typed defaults, homogeneous lists, field-value immutability, `indexed`, descriptions, and field extensions without introducing database-specific metadata. `list: true` creates one list level, a tuple such as `list: [true, true]` creates nested lists, and `false` disables list wrapping explicitly. `indexed: true` requests a regular index, `indexed: "unique"` requests a unique index, and `false` disables indexing explicitly.
- `FieldDefinition<TKind, TValue, TOptions, TInference>` preserves the literal field kind, its base value type, immutable runtime options, and a type-only operation state for later schema inference.

Concrete field factories construct, validate, and freeze their runtime metadata
in their dedicated implementations. Named option and validation interfaces keep
the public declarations readable and make future documentation local to the
property it describes. Inline options remain contextually typed through one
exact-options generic, so editors suggest the complete option set while
TypeScript preserves literal values and nested object-field inference.
Dependent rules such as `required` with `nullable` and `autoNow` with a default
or list are checked outside the contextual option object. Hover information
documents every built-in factory and option with a focused declaration example.
The `Schema` constructor, its top-level options, and nested composite-index
options expose the same contextual documentation through completion and hover
popups.

Every built-in field uses compact field inference. Return types keep only
effective create, object, update, nullability, and list state. Default presence
and automatic value generation are represented as booleans rather than their
runtime values. Constraints, indexes, descriptions, literal defaults, and
runtime extensions remain available through each widened field-options
interface without appearing as expanded literals in editor hovers.

Enums still retain their exact value domain and objects retain their exact child
field map because those structures determine the resulting JavaScript type.
Field-specific aliases keep shared option and definition internals out of
factory hovers while preserving these operation-relevant facts.

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
const PostSchema = new Schema({
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

Plans retain each original field by identity instead of rebuilding scalar
constraints, enum domains, defaults, or type-specific options. A scalar node
therefore contains only `kind: "scalar"`, `field`, `presence`, and `nullable`.
Object and array nodes add only their operation-specific child structure.
Compilation never invokes a default factory or executes a constraint.

Create plans require only fields without a default or generated value. Update
plans make mutable fields optional and mark generated or immutable fields as
forbidden. List items are always required, non-null values rather than optional
properties. Direct object updates are deep patches, so their mutable children
remain optional. Updating a list replaces its complete value, so object items
inside the replacement use create-input rules and require every child declared
as required without a default.

`ValidationIssue` defaults to closed framework codes and paths containing
property names and array offsets. Plugins derive namespaced codes such as
`pg-vector.vector.dimension` with `PluginValidationIssueCode`. Applications may
combine both through `AnyValidationIssueCode`. Runtime will execute these plans
before access checks and hooks; Schema does not validate request data itself
and does not depend on a third-party schema language.

Runtime consumers call `validateScalarFieldConstraints(field, value, path)`
after the scalar snapshot boundary. The evaluator reads normalized constraints
from the retained declared field and returns immutable issues; it does not
rebuild a second scalar schema or apply structural object/list rules.

## Default values

Static defaults keep the direct syntax and exact literal inference:

```ts
stringField({
	default: 'draft',
})
```

Runtime defaults use a simple arrow function:

```ts
dateTimeField({
	default: () => new Date().toISOString(),
})
```

The callback is stored without being executed during schema declaration. Every
function supplied as `default` is interpreted as a runtime factory;
function-valued static defaults are therefore unsupported. Composite fields
validate the factory return type before considering static object shapes.
Database-specific expressions belong to typed adapter extensions rather than
the portable `default` option.

## Runtime value snapshots

`snapshotScalarFieldValue(field, value, path)` applies the field's registered
logical-scalar capability to unknown input. It preserves exact scalar return
inference while copying mutable binary values and delegating plugin scalars to
their own snapshot behavior. Forged structural fields are rejected.

The function never reads or executes `field.options.default`. Runtime first
traverses object and array plan nodes, then calls this boundary at scalar leaves.
This keeps declaration and Runtime scalar normalization on one field-owned
implementation without confusing object patches with complete values.

## String fields

`stringField(options)` creates immutable string metadata while preserving literal options for later schema inference. Calling `stringField()` defines an optional, non-null string.

String fields add declarative `validation.length.min`, `validation.length.max`,
and `validation.match` constraints. Lengths must be non-negative safe integers,
and `min` cannot exceed `max`. Match constraints use native `RegExp` values.
The field owns a frozen `RegExp` copy. Runtime validators construct or reset
their own matching state so repeated validation cannot leak `lastIndex` across
requests.

## Integer fields

`intField(options)` represents safe JavaScript integers. It supports
`validation.range.min/max` with safe-integer boundaries and
`autoIncrement: true | false` as declarative database-sequence metadata.

## Bigint fields

`bigintField(options)` represents exact native JavaScript `bigint` values. Its
defaults and `validation.range.min/max` boundaries use bigint literals such as
`0n`, and it supports the same declarative `autoIncrement` metadata as integer
fields.

Schema does not serialize bigint values. JSON and GraphQL transports must apply
an explicit string or custom-scalar codec, while PostgreSQL adapters may map
the field directly to the native `bigint` type.

## Float fields

`floatField(options)` represents general JavaScript numbers without promising
decimal precision. It supports finite `validation.range.min/max` boundaries and
the declarative `validation.finite` value constraint. Float fields reject
auto-increment metadata at both the TypeScript and runtime boundaries. Exact
base-10 values use the separate decimal contract below.

## Decimal fields

`decimalField(options)` represents exact base-10 values as strings such as
`"19.99"` or `"9007199254740993.001"`. JavaScript numbers are rejected because
they cannot preserve arbitrary decimal precision. Values use plain decimal
notation without exponent notation, leading zeroes, a leading plus sign, or
negative zero representations.

`validation.precision` limits the total digit precision and must be a positive
safe integer. `validation.scale` limits fractional digits, must be a
non-negative safe integer, and cannot exceed precision when both are supplied.
`validation.range.min/max` uses exact decimal strings and is ordered without
floating-point coercion.

PostgreSQL adapters may map this contract to `numeric` or `decimal`. JSON and
GraphQL transports must preserve the string representation or use an explicit
decimal scalar rather than converting through `number`.

## Boolean fields

`booleanField(options)` creates immutable boolean metadata and preserves literal `true` or `false` defaults. It uses the common presence validation and field options without adding boolean-specific constraints.

## Binary fields

`binaryField(options)` represents raw bytes as a native `Uint8Array`. Node.js
`Buffer` values are accepted because they extend `Uint8Array`, and defensive
copies preserve their runtime subclass. Static scalar, list, and structured
defaults are copied so later mutations of caller-owned storage cannot change
schema metadata.

`validation.length.min/max` constrains the number of bytes with non-negative
safe-integer boundaries. Transport encodings such as Base64, hexadecimal, and
multipart data remain transport concerns. Database adapters own physical
storage decisions such as PostgreSQL `bytea`.

JavaScript cannot freeze the indexed contents of a non-empty typed array.
UltimaBase therefore guarantees binary snapshot isolation by copying byte
sequences at declaration and future Runtime input/output boundaries rather than
claiming deep object freezing.

## Date fields

`dateField(options)` represents a calendar day as a canonical `YYYY-MM-DD`
string such as `2026-07-31`. It contains no time or timezone. Static defaults
and `validation.range.min/max` boundaries use the same format.

`autoNow: true` asks Runtime to derive the current calendar day from the
operation-scoped clock and application timezone when create input omits the
field.

## Time fields

`timeField(options)` represents a complete time of day. It defaults to
`timezone: false` and uses `HH:mm:ss.sss`, for example `14:30:00.000`. With
`timezone: true`, values include `Z` or an ISO offset such as
`14:30:00.000+02:00`.

## Date-time fields

`dateTimeField(options)` represents a complete date and time. It defaults to
`timezone: true`, accepting `YYYY-MM-DDTHH:mm:ss.sssZ` or an ISO offset.
`timezone: false` uses the local `YYYY-MM-DDTHH:mm:ss.sss` form.

All temporal fields support `autoNow: true` only for scalar values and never
alongside `default`. Time-bearing fields also support ordered
`validation.range.min/max` boundaries. Runtime derives automatic values from
one operation-scoped instant shared with system fields. Application timezone
configuration, defaulting to UTC, controls calendar and zone-less projections
without relying on the host machine timezone.

## UUID fields

`uuidField(options)` represents a UUID through its canonical string value.
`validation.version` may restrict accepted values to one UUID version from 1
through 8; omitting it accepts every standard version. The field factory
validates and freezes this metadata while actual UUID value validation belongs
to the compiled runtime plan.

UUID generation uses the common default contract rather than a field-specific
flag. The framework-owned `id` remains a separately generated UUID v7 system
field. PostgreSQL adapters may map both forms to the native `uuid` type without
exposing storage configuration through Schema.

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

`jsonField(options)` represents a root `JsonObject` or `JsonArray` through the
`JsonDocument` type. Nested values use recursive `JsonValue`, so they may still
contain null, booleans, finite numbers, strings, arrays, and plain objects. A
root scalar is rejected; root `null` is reserved for
`validation.nullable: true`. Documents are copied and deeply frozen, while
values such as `undefined`, `Date`, `BigInt`, functions, and circular
references are rejected.

Every developer field supports homogeneous lists without changing its field
kind:

```ts
stringField({ list: true })
intField({ list: [true, true] })
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
non-null. Object definitions may nest to any finite depth, and child definitions
remain reusable immutable values. Factory provenance and immutable construction
make hand-written or circular field-definition graphs invalid by construction.
Structured defaults are detached from caller-owned values and normalized
through their declared child fields. They use create-input presence rules:
required children without a default must be present, while optional, defaulted,
generated, and auto-incremented children may be omitted. Unknown properties are
rejected. Every child reuses its factory-owned scalar and list snapshot contract.

Schema does not select a physical representation. PostgreSQL storage and
Drizzle compilation remain adapter concerns; ADR-0021 defines JSONB as the
portable default mapping without adding database metadata to this package.

## Typed extensions

- `defineSchemaExtension(name, config, pluginName?)` creates plugin-owned schema metadata.
- `defineFieldExtension(name, config, pluginName?)` creates plugin-owned field metadata.
- `defineExtensions(extensions)` copies and freezes a list while rejecting duplicate names within the same scope.

Each extension exposes the literal `scope`, `name`, `pluginName`, and typed
readonly `config` properties. `pluginName` defaults to the extension name; an
explicit value lets one plugin handle several extension identities. Schema
transports this opaque configuration without importing or interpreting the
plugin. Core later verifies that the expected plugin registered the matching
handler before infrastructure starts.

Schema and field names use separate namespaces. The same name may therefore exist once in each scope, while two schema extensions or two field extensions with the same name produce a `TypeError`. Extension values and their configuration objects are shallowly copied and frozen.

Field extensions are runtime-only metadata. They never alter inferred object,
create-input, or update-input shapes. A plugin that introduces a distinct
logical value must expose a plugin-defined field so its factory owns the value
type explicitly.

## Plugin-defined fields

`definePluginField(kind, options, normalizers)` lets a plugin introduce a
logical field kind without teaching Schema about its database representation.
Kinds must be non-empty, namespaced strings and cannot shadow framework-owned
field kinds. The factory reuses common validation, defaults, lists, indexes,
descriptions, immutability, and field extensions while delegating scalar value
snapshots to `snapshotValue`. A custom validation normalizer is optional;
common presence validation remains available when it is omitted.

`snapshotValue(value, path)` is a declaration-time snapshot boundary, not a
request validator. It must be pure, deterministic, and idempotent because
Schema applies it when declaring static defaults. Mutable logical values must
be returned as detached snapshots; plugins should freeze nested data when their
public immutability contract requires it. `assertFieldOptions` is exposed for
community factories that need to validate an unknown options container before
reading plugin-specific properties.

Validation-plan compilation preserves every logical field through the shared
`ScalarValidationPlan`. A plugin type guard checks `plan.field.kind` and narrows
the generic plan to its exact field definition, retaining the complete typed
configuration without a parallel plugin-only plan. A future Core registry will
reject unclaimed or conflicting plugin kinds during application setup; Schema
remains independently usable and does not own that registry.

Plugin validators report machine-readable failures through
`PluginValidationIssueCode<TFieldKind>`, which retains field-kind ownership in
every code. Manually forging plugin field objects has no registered snapshot
capability and is rejected; community fields must use `definePluginField`.

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

## Planned native hook declarations

Schema does not currently expose native hooks. The active
[native-hook plan](../../../CURRENT_PLAN.md) will add schema hooks and inline field
hooks as framework primitives rather than extensions. The dependency boundary
must preserve exact field-value inference, compact field hovers, and documented
autocomplete without making Schema depend on Runtime or concrete plugins. See
[ADR-0089](../../../docs/adr/0089-native-schema-and-field-hooks.md) for the frozen
lifecycle semantics. Permission extensions remain opaque configuration: their
installed plugins attach hooks through the policy-neutral boundary from
[ADR-0090](../../../docs/adr/0090-permission-plugins-through-hooks.md).
