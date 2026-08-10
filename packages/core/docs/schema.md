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

`Schema.define(options)` records one synchronous Nexus-style declaration and
later compiles its existing immutable field definitions. The logical name comes
first, while the second argument is the corresponding factory's documented
options:

```ts
const PostSchema = Schema.define({
	className: 'Post',
	fields: (field) => ({
		title: field.string({
			validation: {
				required: true,
			},
		}),
		published: field.boolean({ default: false }),
	}),
	extensions: [permissionsExtension],
})
```

The returned value is the final schema-specific class. Its `className` is
available immediately. `createApplication()` executes each configured field
callback once during an infrastructure-free static compilation phase, then
freezes `definition`, `fields`, `indexes`, and `extensions`. Before that phase,
field-dependent static metadata and model construction throw an actionable
`SchemaCompilationError`. Infrastructure reads the compiled `definition`,
while Query and Runtime retain the exact class identity registered by the
application.

Callbacks are synchronous declarations. They may close over static values, but
cannot receive requests, services, adapters,
transactions, or lifecycle state. Field maps still compile immediately for
framework-owned composition and isolated tests that need local inference, but
they are not the ordinary application declaration syntax. Builder declarations
gain their exact application model contract from the deterministic registry
emitted by `@ultimabase/codegen`, and Core resolves public schema APIs through
that registry.

The root builder exposes every Core field kind. `field.object()` receives a
path-aware embedded builder that omits `pointer` and `relation` and rejects
database-generated integer sequences. Methods call the same public field
factories internally rather than reproducing option normalization, validation,
hooks, Access, defaults, or inference rules.

Framework and plugin authors may reuse the immutable low-level field factories
internally. Normal application code uses named builder methods; Core
intentionally does not expose `field.custom()` as ordinary schema DX.

The public constructor and field factories also protect JavaScript callers at
runtime. Schema names, field maps, field definitions, common option flags,
extension definitions, and static defaults are validated before their
immutable snapshots are exposed. Each generated class has trusted provenance,
so class identity is available without introducing mutable metadata.
Registries and cross-package runtime boundaries use `Schema.is(value)` to reject
objects that only imitate the public metadata shape.
Field definitions carry private factory provenance, so a structurally similar
object cannot bypass validation or provide a forged snapshot capability.

## Relationship target names

Application `field.pointer()` and `field.relation()` calls use the stable target
schema name. This avoids value-level cycles between module constants while the
generated registry preserves the exact target type:

```ts
author: field.pointer({ target: 'User' })
```

Framework-owned low-level `pointerField` and `relationField` composition may
still use `SchemaTarget<TSchema>` callbacks. Application code does not need a
`SchemaReference`, resolver function, or local type annotation.

`pointerField` supports input resolution through its one field hook. Pointer
disclosure belongs to field Access, while field definitions and transports own
output representation. Inclusion itself does not run a target schema lifecycle;
reads expose no schema hooks. `relationField` stores no model value and
therefore accepts no field hooks.

An application compiles every configured schema and resolves field-owned target
callbacks before plugin setup or infrastructure lifecycle phases. Plugin setup
receives a read-only view of the completed registry and cannot register a late
schema. Circular module declarations remain possible without a global registry.
The resulting `SchemaTargetGraph` is immutable and application-local. It
identifies an edge by exact source class identity and structural field path.

```ts
const application = await createApplication({
	schemas: [UserSchema, PostSchema],
	plugins: [],
})

application.schemaTargets.get(PostSchema, ['author'])
```

Relationship fields populate this graph while keeping callbacks out of public
field metadata. Application developers normally let the framework own
`SchemaRegistry.compileSchemas()`. Adapter and framework plugin authors may
read the completed graph through the application or their read-only setup
registry. Target callbacks must be pure declarations and are invoked once per
accepted application compilation.

Resolution rejects callbacks that throw or return a non-schema, unregistered,
or foreign schema identity. Duplicate class names remain the registry's
existing ambiguous-ownership error. Every target error includes the logical
source class and field path without exposing physical storage names.

## Pointer fields and values

A pointer is one immutable logical object identity. It contains an exact target
schema and a framework-owned string ID, performs no I/O, and never hides an
automatic target load:

```ts
const PostSchema = Schema.define({
	className: 'Post',
	fields: (field) => ({
		author: field.pointer({
			target: 'User',
			validation: { required: true },
			indexed: true,
			onDelete: 'restrict',
		}),
	}),
})

const author = UserSchema.pointer('0198f090-2a50-7000-8000-000000000034')
const post = new PostSchema({ author })
```

The general form is `new Pointer(UserSchema, id)`. Both forms produce
`Pointer<typeof UserSchema>`, and create, update, persisted, and selected model
types preserve that target. `pointer.equals(other)` compares exact schema
identity and ID. `pointer.toJSON()` returns the frozen logical shape
`{ type: "pointer", className, id }`; it is not a database foreign-key or a
transport-specific Parse object.

`onDelete` defaults to `restrict`. `cascade` deletes the source when its target
is deleted, while `setNull` requires an optional pointer. Use
`indexed: "unique"` for a one-to-one pointer. Pointer defaults and `list: true`
are deliberately unsupported: callers provide relationship identity explicitly,
and to-many values use `relationField` instead.

## Relation field declarations

`relationField` declares logical to-many topology without embedding an array in
the source row. Omitting `mappedBy` creates the owning side. Supplying it creates
an inverse backed by one exact pointer or owning relation on the target:

```ts
const UserSchema = Schema.define({
	className: 'User',
	fields: (field) => ({
		posts: field.relation({
			target: 'Post',
			mappedBy: 'author',
		}),
	}),
})
```

This is one-to-many because `PostSchema.author` is a pointer to `UserSchema`.
For many-to-many, one schema declares an owning `relationField({ target })` and
the other may declare an inverse targeting that field. One-to-one continues to
use a unique pointer.

`mappedBy` is restricted by TypeScript to compatible target field names and is
validated again against exact application-owned schema identities during setup.
Missing fields, wrong targets, inverse-to-inverse cycles, duplicate inverses,
reused owners, and nested relation declarations fail before infrastructure
connects. The logical graph exposes ownership and mapping paths without SQL,
join-table, REST, or GraphQL names.

Relations accept documentation, field extensions, and `access.read` plus
`access.update` rules, but no scalar validation, default, list, index, immutable,
or value-hook options. Update Access receives the exact immutable relation delta.
Relations remain omitted from `InferObject`, `InferCreateInput`, and
`InferUpdateInput`.

## Relation handles and scoped reads

Runtime-materialized models expose independently queryable relations without
adding a collection property:

```ts
const user = await UserSchema.get(
	{ id: userId, select: { name: true } },
	{ ultimabase },
)

const posts = user.relation('posts')
const recentPosts = await posts.findMany({
	select: { id: true, title: true },
	orderBy: { createdAt: 'desc' },
	limit: 20,
	cursor: true,
})
```

The `relation()` argument completes only exact relation field names and returns
`Relation<typeof UserSchema, typeof PostSchema>`. Drafts omit the method from
their type. A persisted projection may use it even when `id` is not visible,
because Runtime retains the validated source identity separately; an adapter
that did not provide protected identity fails before a handle can be created.

`Relation` is a frozen opaque class. `query()` returns the ordinary target
`Query`, so selection, filtering, ordering, offset or cursor pagination, count,
exists, ambient request reuse, and terminal-only execution options stay
consistent. The relationship edge is carried beside the AST in private Runtime
state. It is neither enumerable nor serializable, and every Query branch,
reusable scope, and business hook preserves it monotonically.

Database execution requires the versioned relation capability. PostgreSQL
implements private scoped traversal; an unsupported adapter fails closed
instead of running the public target AST without its relationship restriction.

The handle also exposes transactional edge mutations:

```ts
await user.relation('posts').connect(PostSchema.pointer(postId))
await user.relation('posts').disconnect([oldPost, archivedPost])
await user.relation('posts').set([firstPost, secondPost])
await user.relation('posts').clear()
```

`connect` and `disconnect` require one pointer or a non-empty pointer tuple;
`set` replaces the complete set and accepts an empty array; `clear` expresses
that empty replacement directly. Duplicate or foreign pointers fail before a
transaction starts. Once execution begins, source field write Access, schema
update hooks, target visibility, nested writes, and adapter execution share one
automatic or inherited transaction. Missing and inaccessible sources or targets
both surface as `NOT_FOUND`.

Schema update hooks can narrow `candidate.kind === "relation"` to inspect the
typed `{ action, targets }` delta. Inverse pointer relations execute ordinary
target pointer updates, so target validation, Access, and hooks remain active.
Owning storage stays adapter-owned and requires the versioned relation
capability; PostgreSQL implements deterministic joins and inverse-pointer
updates without exposing physical storage to Core.

## Drafts, static reads, and persisted models

The generated class is constructible and exposes canonical object-input reads:

```ts
const draft = new PostSchema({ title: 'Preview' })
const posts = await PostSchema.findMany({ select: { id: true, title: true } })

draft.title // string
draft.get('title') // string
draft.toJSON() // { readonly title: string }
```

Draft construction validates declared fields, snapshots mutable values, and
performs no I/O. Persistence always passes through Runtime. After hooks and
output restrictions complete, Runtime converts neutral adapter records into the
exact registered class:

```ts
const post = await PostSchema.findOne(
	{ select: { id: true, title: true } },
	{ ultimabase },
)

if (post !== null) {
	post instanceof PostSchema // true
	post.toJSON() // Only id and title are present.
}
```

Direct properties, `get()`, enumeration, inspection, and `toJSON()` all share
the same visible snapshot. Omitted fields are absent at runtime and from the
inferred result type. Runtime retains the protected object identity separately,
so an instance selected with only `title` can still target itself without
revealing `id` through properties or serialization. A later `update()` or
`delete()` applies its own result selection rather than preserving that earlier
read projection. Without `select`, it returns the complete model allowed by
Access.

Drafts expose only `create` and `upsert`; persisted or queried models expose only
`update` and `delete`:

```ts
import { increment } from '@ultimabase/core'

const draft = new PostSchema({ title: 'Hello' })
const created = await draft.create(
	{ select: { id: true, title: true } },
	{ ultimabase },
)

const imported = await new PostSchema({ title: 'Imported' }).upsert(
	{
		select: { id: true, title: true },
		where: { slug: { eq: 'imported' } },
		update: { imports: increment(1) },
	},
	{ ultimabase },
)

const updated = await created.update(
	{ data: { title: 'Updated' }, select: { id: true, title: true } },
	{ ultimabase },
)
await updated.delete({ select: { id: true } }, { ultimabase })
```

`where` must build distinct non-null equalities matching `id`, one unique field,
or one composite unique index. Every command returns a new model and delegates
to Runtime validation, hooks, policies, cancellation, and transactions.
Persisted `fetch`, `update`, and `delete` are strict protected-identity commands:
they return a model or throw `NOT_FOUND`, including when Access hides the target.
There is no dirty tracking, implicit batching, `save()`, or instance collection
operation.

## Native schema hook declarations

`Schema.define({ hooks })` accepts the typed mutation lifecycle directly through
three focused groups: input transformation, before-operation observers, and
after-operation observers. Collection commands
are itemized before dispatch. Their public `kind` is the cardinality-free
business family (`create`, `update`, `upsert`, or `delete`), while an exposed
`operation.kind` remains the exact singular terminal such as `update-one`.

```ts
const ArticleSchema = Schema.define({
	className: 'Article',
	fields: (field) => ({
		title: field.string({ validation: { required: true } }),
	}),
	hooks: {
		resolveInput: {
			create: ({ operation }) => operation,
		},
		beforeOperation: {
			update: ({ originalItem, item }) => {
				auditChange(originalItem, item)
			},
		},
		afterOperation: {
			create: ({ item }) => {
				auditCreation(item)
			},
		},
	},
})
```

`resolveInput` is the only transforming schema hook and may throw to reject an
input. It receives the existing visible `originalItem` after Access approval
and target preparation (`null` for a create candidate). Before- and
after-operation handlers are observers: they may perform
transactional work or throw, but Runtime ignores their return values. Read
filtering belongs to Query options for developer choices and schema Access for
mandatory restrictions; there are no schema read hooks.

Every non-null `originalItem` is materialized as a complete immutable
`SchemaResult` instance. It retains protected persisted identity and therefore
supports `get()`, `toJSON()`, and the regular instance commands through the same
Runtime pipeline.

Before-operation branches cover create, update, and delete. After-operation
branches additionally cover upsert, whose create or update branch is known only
after the atomic database operation. Each observer runs once per affected item
with complete selection-independent values. A non-null `afterOperation.item`
is a complete persisted `SchemaResult`, independently of the mutation result
selection; there is no separate `result` hook value. `beforeOperation.create` exposes
only `context`, `kind: "create"`, and the candidate `item`; there is no constant
`originalItem` or internal operation AST. The candidate is a
`SchemaPreparedDraft`: an immutable instance of the generated schema class with
normalized defaults and system fields, `get()`, and `toJSON()`, but without
persistence commands in its public type. Its shape is identical for direct and
batched commands. A missing directed batch target raises `NOT_FOUND` and rolls
back the complete batch.

The declaration record is copied and frozen outside enumerable schema metadata.
Changing only hooks cannot alter validation plans, adapter schemas, or
migrations. Runtime compiles the private declaration once per application.

Each phase accepts one callback or a non-empty ordered callback list. Phases
covering several logical operation families also accept an `all` plus family
map:

```ts
hooks: {
	resolveInput: {
		all: ({ operation }) => operation,
		create: [
			({ operation }) => operation,
			({ operation }) => operation,
		],
		update: ({ operation }) => operation,
	},
}
```

Only compatible family keys are suggested for a phase. Family handlers cover
direct and batched items while retaining the same business `kind` discriminant.
For `resolveInput`, shared `all` handlers run before the matching family.
Configuration property order never changes this nesting.

## Inline field hook declarations

Common field options accept `hooks` as a declaration-only capability. Each
handler receives this field's exact logical type without access to sibling
schema values:

```ts
const ProfileSchema = Schema.define({
	className: 'Profile',
	fields: (field) => ({
		displayName: field.string({
			hooks: {
				resolveInput: [
					({ value }) => value.trim(),
					({ value }) => value.toLocaleLowerCase(),
				],
			},
		}),
	}),
})
```

`resolveInput` is the explicit same-type transformation boundary. Every
transform output becomes the following transform input. It may throw to reject
one value and supports direct handlers, non-empty lists, and compatible
`all`/`create`/`update`/`upsert` family maps without widening the field's logical
value. An omitted optional field runs no value hook. Structured and cross-field
validation belongs to schema hooks.

Every `updateMany` entry runs input resolution over its supplied update values.
`deleteMany` has no field input to resolve. Mutation lifecycle and cross-field
behavior belong to schema hooks, whose callbacks receive complete
`originalItem` and `item` pairs independently of selection. Post-commit work is
queued through `context.emit()` from an operation hook.
Field definitions and transports own output
representation, while diagnostics and infrastructure plugins own low-level
failure observation.

Nested fields use one deterministic depth-first order. Siblings retain field
declaration order, and input resolution visits children before their parent.
Callback declarations are
stored in private field capabilities and never appear in field metadata,
validation plans, indexes, migrations, or physical schema diffs.

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
remaining property optional. Every complete field property is present: required
fields use `T`, while optional fields use `T | null`. Create and update inputs
keep optional properties so omission still means default resolution or no change.
Object fields apply the same rules recursively. A listed object uses create-input rules for each complete
replacement item during update.

The final mapped shapes are materialized at the public inference boundary.
Editor hovers therefore show concrete properties such as
`readonly externalId?: string` instead of internal required/optional mapped
type intersections. This presentation change does not widen values or alter
operation-specific presence rules.

## Generic field contract

- `FieldValidationOptions` exposes `required` plus field-specific constraints. Optional fields persist as `null`; `required: true` makes their persisted value non-null.
- `FieldOptions<TValue, TValidation>` adds typed defaults, homogeneous lists, field-value immutability, `indexed`, descriptions, and field extensions without introducing database-specific metadata. `list: true` creates one list level and `false` disables list wrapping explicitly. Nested arrays belong in `jsonField()`. `indexed: true` requests a regular index, `indexed: "unique"` requests a unique index, and `false` disables indexing explicitly.
- `FieldDefinition<TKind, TValue, TOptions, TInference>` preserves the literal field kind, its base value type, immutable runtime options, and a type-only operation state for later schema inference.

Concrete field factories construct, validate, and freeze their runtime metadata
in their dedicated implementations. Named option and validation interfaces keep
the public declarations readable and make future documentation local to the
property it describes. Inline options remain contextually typed through one
exact-options generic, so editors suggest the complete option set while
TypeScript preserves literal values and nested object-field inference.
Dependent rules such as `autoNow` with a default or list are checked outside
the contextual option object. Hover information
documents every built-in factory and option with a focused declaration example.
`Schema.define()`, its top-level options, and nested composite-index
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
builder-method and low-level factory hovers while preserving these
operation-relevant facts.

## Indexes

Single-field indexes stay next to their field:

```ts
fields: (field) => ({
	slug: field.string({ indexed: 'unique' }),
})
```

Schema-level declarations represent composite indexes and require at least two
distinct top-level fields:

```ts
const PostSchema = Schema.define({
	className: 'Post',
	fields: (field) => ({
		authorId: field.string(),
		slug: field.string({ indexed: 'unique' }),
	}),
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
root scalar is rejected; root `null` is accepted for optional JSON fields.
Documents are copied and deeply frozen, while
values such as `undefined`, `Date`, `BigInt`, functions, and circular
references are rejected.

Every developer field supports homogeneous lists without changing its field
kind:

```ts
fields: (field) => ({
	tags: field.string({ list: true }),
	weights: field.int({ list: true }),
	matrix: field.json(),
})
```

`field.object()` composes existing fields into one structured value:

```ts
fields: (field) => ({
	profile: field.object({
		typeName: 'Profile',
		fields: (field) => ({
			displayName: field.string({
				validation: { required: true },
			}),
			preferences: field.object({
				fields: (field) => ({
					darkMode: field.boolean(),
				}),
			}),
			tags: field.string({ list: true }),
		}),
	}),
})
```

An object field is one embedded stored value, not an independently addressable
schema record. Its children may therefore be value fields, including nested
objects and lists, but not `pointerField` or `relationField`. Declare schema
relationships as top-level fields; use an explicit relationship schema when the
relationship itself needs additional structured data. Likewise,
`intField({ autoIncrement: true })` and
`bigintField({ autoIncrement: true })` require a dedicated top-level database
column and cannot be embedded.

`typeName` follows the same optional identity contract as enum fields. A
generator may use it as the base for distinct output, create-input,
update-input, filter, or other generated type names.

`list: true` wraps the scalar or object value exactly once. Static list defaults
are copied and frozen. Multidimensional or heterogeneous array documents must
use `jsonField()` instead of hiding an untyped nested shape behind a value field.
An optional list has the complete value `readonly T[] | null`; list elements
remain non-null. Object definitions may nest to any finite depth, and child definitions
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
- `defineContextualSchemaExtensionFactory<Kind>()(factory)` lets an extension author expose sibling-field-aware callback options.

Each extension exposes the literal `scope`, `name`, `pluginName`, and typed
readonly `config` properties. `pluginName` defaults to the extension name; an
explicit value lets one plugin handle several extension identities. Schema
transports this opaque configuration without importing or interpreting the
plugin. Core later verifies that the expected plugin registered the matching
handler before infrastructure starts.

Callback-bearing extensions can opt into exact sibling-field inference through
the neutral schema binder:

```ts
const Post = Schema.define({
	className: 'Post',
	fields: (field) => ({
		title: field.string({ validation: { required: true } }),
		visibility: field.string(),
	}),
	extensions: ({ bind }) => [
		bind(contentPolicy, {
			resolve: ({ data }) => data.visibility ?? data.title,
		}),
	],
})
```

The callback data contains only the exact developer field values. Required,
optional, nullable, structured, list, pointer, and community plugin field types
retain their ordinary object inference. Framework system fields and fields
reserved by extensions stay private. The bound factory still returns the same
ordinary immutable extension object stored on the schema.

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

## Native hook declarations

`Schema.define({ hooks })` and every built-in or plugin-defined field's `hooks`
option expose native lifecycle declarations as framework primitives rather than
extensions. Private identity-owned capabilities retain the normalized callbacks
without placing them in schema definitions, field options, validation plans, or
physical metadata. Exact field-value inference, compact field hovers, and
documented autocomplete therefore remain independent from hook literals.

Plugins attach the same declarations through the owner-bound targets documented
in the [Runtime guide](runtime.md#hooks-and-post-commit-events). Extension
configuration remains an initialization selector and never enters a native hook
input. See
[ADR-0089](../../../docs/adr/0089-native-schema-and-field-hooks.md) and
[ADR-0097](../../../docs/adr/0097-owner-scoped-typed-plugin-hook-targets.md) for
the lifecycle and target semantics. Permission extensions remain opaque
configuration. Under
[ADR-0116](../../../docs/adr/0116-fundamental-access-system.md), their owning
plugins will contribute policies to Core's native Access registry rather than
business hooks; the Access compiler will lower those policies into the existing
monotonic enforcement primitives.
