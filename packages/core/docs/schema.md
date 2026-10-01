# Core Schema domain

Static schema declarations are the source of truth for UltimaBase.

Responsibilities:

- `UltimaBase.Schema` and the shared low-level `Schema` implementation;
- primitive field definitions;
- system-field metadata;
- direct plugin option contracts;
- plugin-defined logical field contracts;
- normalized index metadata;
- TypeScript inference;
- transport-neutral validation plans;
- isolated `SchemaRegistry` instances.

This domain must not know Hooks, Access, ACL, CLP, roles, database engines,
servers, or transport products. Optional plugins contribute typed direct options
and capabilities that Core validates without interpreting their product semantics.

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
├── plans/
├── inference/
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

`UltimaBase.Schema.define(options)` records one synchronous declaration and
later compiles its existing immutable field definitions. The logical name comes
first, while each builder call receives its documented options:

```ts
const PostSchema = UltimaBase.Schema.define({
	className: 'Post',
	fields: (field) => ({
		title: field.string({
			required: true,
		}),
		published: field.boolean({ default: false }),
	}),
})
```

The returned value is the final schema-specific class. Its `className` and
exact local TypeScript contracts are available immediately. The callback is
executed once at definition time to capture inert builder calls without
registering the schema. Core-only calls resolve their Runtime metadata
immediately. Configured plugin calls remain unresolved until a compatible
`UltimaBase.compile()` resolves the declaration during its infrastructure-free
static phase. The exported class and prototype never change. Infrastructure
reads the compiled `definition`, while Query and Runtime retain the exact class
identity explicitly registered by the application.

Callbacks are synchronous declarations. They may close over static values, but
cannot receive requests, services, adapters, transactions, or lifecycle state.
Core derives local model, create, update, filter, selection, nested-write, and
result contracts from the captured field map. The deterministic registry emitted
by `@ultimabase/typegen` remains the application-wide literal-name graph for
pointers, relations and circular schemas. It also supplies complete filters,
schema Access/Hooks/ACL callbacks, exact Password User results and retained
standalone/advanced contracts. Configured local plugin surfaces infer from
`App.Schema` without regeneration; see the [Typegen contract](../../typegen/README.md).

The root builder exposes every Core field kind. `field.object()` receives a
path-aware embedded builder with a named option type for every built-in factory.
It omits `pointer`, `relation`, portable `indexed`, system generation, and
database-generated integer sequences while retaining value behavior such as
defaults, immutability, lists, structural normalization, and temporal
`autoNow`. Methods call the same public field factories internally rather than
reproducing their normalization or inference rules. Runtime compilation applies
the same restrictions to untyped calls, low-level object composition, and
plugin-transformed schemas.

Plugin-owned methods and direct field options declare a non-empty subset of the
closed `stored`, `embedded`, `virtual`, and `output` contexts. Each supported
method context has its own factory; one stored
field factory is never converted into an embedded field or output descriptor.
Configured builders infer their methods from those factories. Public Typegen
references retain only the matching standalone contextual interface. Core repeats the
same checks for JavaScript and stale generated declarations before setup.

Framework and plugin authors may reuse the immutable low-level field factories
internally. Normal application code uses named builder methods; Core
intentionally does not expose `field.custom()` as ordinary schema DX.

## Output-only value declarations

`OutputBuilder` describes returned values without manufacturing stored schema
fields. Its built-in factories cover strings, booleans, integers, floats,
bigints, decimals, UUIDs, dates, times, date-times, binary values, JSON, closed
enums, lists, and recursive objects. Every factory accepts `description`,
`nullable`, and `list`; decimal, temporal, enum, and object declarations retain
only their relevant representation metadata.

Output nullability applies to the complete scalar or list container and defaults
to `true`. A list element is always non-null. Every declared object property is
required in the resolved object, though a child descriptor may allow that
property's value to be `null`. Core snapshots output values through the same
transport-neutral descriptor regardless of whether REST or GraphQL eventually
represents the result.

Unlike root and embedded field builders, `OutputBuilder` deliberately has no
input defaults, `required`, `immutable`, indexes, generators, mutation
validation, hooks, pointers, relations, columns, or other persistence options.
Unsupported properties are absent from autocomplete, rejected by TypeScript,
and rejected again when an untyped declaration is resolved. Issue 2503 exposes
this declaration contract; virtual schema fields become its first owning public
API in issue 2505 rather than exposing standalone output operations.

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

When the official Hooks plugin is installed, `pointerField` may receive its
plugin-owned input resolver. Pointer disclosure can be narrowed by an installed
policy plugin, while field definitions and transports own output representation.
Inclusion itself does not manufacture target behavior. `relationField` stores no
model value and therefore has no Core lifecycle option.

An application compiles every configured schema and resolves field-owned target
callbacks before plugin setup or infrastructure lifecycle phases. Plugin setup
receives a read-only view of the completed registry and cannot register a late
schema. Circular module declarations remain possible without a global registry.
The resulting `SchemaTargetGraph` is immutable and application-local. It
identifies an edge by exact source class identity and structural field path.

```ts
const application = new UltimaBase({
	schemas: [UserSchema, PostSchema],
})

application.compile().schemas.schemaTargets.get(PostSchema, ['author'])
```

Relationship fields populate this graph while keeping callbacks out of public
field metadata. Application developers normally let the framework own
`UltimaBase.compile()`. Adapter and framework plugin authors may
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
const PostSchema = UltimaBase.Schema.define({
	className: 'Post',
	fields: (field) => ({
		author: field.pointer({
			target: 'User',
			required: true,
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
const UserSchema = UltimaBase.Schema.define({
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
join-table or transport names.

An optional `where` narrows the visible target collection for this exact
relation. It accepts an ordinary target `WhereInput` or one synchronous
contextual resolver:

```ts
const ConversationSchema = UltimaBase.Schema.define({
	className: 'Conversation',
	fields: (field) => ({
		activeParticipants: field.relation({
			target: 'User',
			where: { suspended: { eq: false } },
		}),
		otherParticipants: field.relation({
			target: 'User',
			where: ({ context, where }) =>
				where.ne('id', String(context.metadata.currentUserId)),
		}),
	}),
})
```

The resolver receives no source model, engine, adapter, transaction, or mutable
context. Its builder starts empty, is immutable, and is correlated with the
exact target schema, including nested relationship predicates. Core retains the
callback privately; schema snapshots and Typegen contain no executable code.
The relation filter is application shaping rather than authorization: it always
narrows caller filters with `AND` and cannot replace Access, ACL, or protected
constraints. It also remains active for Master unless the resolver explicitly
chooses an empty filter.

Relations accept documentation, but no scalar validation,
default, list, index, immutable, or Core lifecycle options. Installing the
official Access plugin adds its typed `access.read` and `access.update`
namespace; update policy rules then receive the exact immutable relation delta.
Relations remain omitted from `InferObject`, `InferCreateInput`, and
`InferUpdateInput`.

## Relation handles and scoped reads

Runtime-materialized models expose independently queryable relations without
adding a collection property:

```ts
const user = await UserSchema.get({ id: userId, select: { name: true } })

const posts = user.relation('posts')
const recentPosts = await posts.findMany({
	select: { id: true, title: true },
	orderBy: { createdAt: 'desc' },
	limit: 20,
})
```

The `relation()` argument completes only exact relation field names and returns
`Relation<typeof UserSchema, typeof PostSchema>`. Drafts omit the method from
their type. Every persisted projection exposes `id`, even when its selection
does not name it. Runtime also retains validated source identity separately so
a visible field alone cannot forge a relation handle; an adapter that did not
provide trusted identity fails before a handle can be created.

`Relation` is a frozen opaque class. `query()` returns the ordinary target
`Query`, so selection, filtering, ordering, offset pagination, count,
exists, ambient request reuse, and terminal-only execution options stay
consistent. The relationship edge is carried beside the AST in private Runtime
state. It is neither enumerable nor serializable, and every Query branch,
reusable scope, and business hook preserves it monotonically.

Database execution requires the versioned relation capability. PostgreSQL
implements private scoped traversal; an unsupported adapter fails closed
instead of running the public target AST without its relationship restriction.

The handle also exposes transactional edge mutations:

```ts
await user.relation('posts').connect(postId)
await user.relation('posts').disconnect([oldPostId, archivedPostId])
await user.relation('posts').set([firstPostId, secondPostId])
await user.relation('posts').clear()
```

`connect` and `disconnect` require one pointer or a non-empty pointer tuple;
`set` replaces the complete set and accepts an empty array; `clear` expresses
that empty replacement directly. Duplicate or foreign pointers fail before a
transaction starts. Once execution begins, installed source-field policy,
plugin-owned schema behavior, target visibility, nested writes, and adapter
execution share one automatic or inherited transaction. Missing and inaccessible
sources or targets both surface as `NOT_FOUND`.

The official Hooks plugin's schema update handlers can narrow
`candidate.kind === "relation"` to inspect the typed `{ action, targets }`
delta. Inverse pointer relations execute ordinary target pointer updates, so
target validation and every installed policy or behavior remain active.
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
performs no I/O. Persistence always passes through Runtime. After installed
behavior and output restrictions complete, Runtime converts neutral adapter records into the
exact registered class:

```ts
const post = await PostSchema.findOne({ select: { id: true, title: true } })

if (post !== null) {
	post instanceof PostSchema // true
	post.toJSON() // Only id and title are present.
}
```

Direct properties, `get()`, enumeration, inspection, and `toJSON()` all share
the same visible snapshot. Omitted fields other than `id` are absent at runtime
and from the inferred result type. Every persisted selection includes visible
`id`, even when the caller selects only `title`. Runtime separately retains
validated identity to target instance commands safely. A later `update()` or
`delete()` applies its own result selection rather than preserving that earlier
read projection. Without `select`, it returns the complete model allowed by
installed output policy.

Drafts expose `create` and `upsert` as executing commands. Persisted or queried
models expose `fetch`, `exists`, `update`, and `delete`, plus local identity
helpers:

```ts
import { increment } from '@ultimabase/core'

const draft = new PostSchema({ title: 'Hello' })
const created = await draft.create({ select: { id: true, title: true } })

const imported = await new PostSchema({ title: 'Imported' }).upsert({
	select: { id: true, title: true },
	where: { slug: { eq: 'imported' } },
	update: { imports: increment(1) },
})

const updated = await created.update({
	data: { title: 'Updated' },
	select: { id: true, title: true },
})
await updated.delete({ select: { id: true } })
```

`where` must build distinct non-null equalities matching `id`, one unique field,
or one composite unique index. Every command returns a new model and delegates
to Runtime validation, installed behavior and policies, cancellation, and
transactions.
Persisted `fetch`, `update`, and `delete` are strict protected-identity commands:
they return a model or throw `NOT_FOUND`, including when an installed policy
hides the target.
There is no dirty tracking, implicit batching, `save()`, or instance collection
operation.

## Plugin-owned schema option namespaces

Core does not declare `hooks` or `access` schema and field options. Authorized
plugins contribute option contracts during static application compilation.
Schema options use `defineSchemaOption()`. Direct field options use
`defineFieldOption()` and state their exact declaration contexts. The official
`@ultimabase/hooks-plugin` and
`@ultimabase/access-plugin` packages own their authoring types, normalization,
target selectors, and Runtime implementations; omitting either plugin makes its
option unknown.

Compiled option values remain owner-scoped static contributions. They do not
enter portable field metadata, inferred model values, validation plans,
indexes, migrations, or Core-owned registries. JavaScript executes the same
compiled application graph without generated declarations.

Context support describes executable field behavior rather than value
representation. A storage or wire codec does not imply that an input Hook,
validator, Access rule, index, or database column option can execute in every
context. Unsupported occurrences are rejected instead of silently removed.

## System fields

Every schema field map includes three immutable framework-owned definitions:

- `id` is a `string` value represented by the `uuid` field kind with
  `uuidVersion: 7`;
- `createdAt` and `updatedAt` are zoned ISO date-time strings represented by the
  `dateTime` field kind.

System options expose `system: true`, `generatedOn`, `immutable: true`, and
`required: true`. The identifier and both timestamps are generated
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

- `FieldOptions<TValue>` adds direct `required`, typed defaults, homogeneous lists, field-value immutability, `indexed`, and descriptions without introducing database-specific metadata. Optional fields persist as `null`; `required: true` makes their persisted value non-null and requires create input unless a default or generator supplies it. `list: true` creates one list level and `false` disables list wrapping explicitly. Nested arrays belong in `jsonField()`. `indexed: true` requests a regular index, `indexed: "unique"` requests a unique index, and `false` disables indexing explicitly.
- `FieldDefinition<TKind, TValue, TOptions, TInference>` preserves the literal field kind, its base value type, immutable runtime options, and a type-only operation state for later schema inference.

Concrete field factories construct, validate, and freeze their runtime metadata
in their dedicated implementations. Named option interfaces keep the public
declarations readable and make future documentation local to the property it
describes. Inline options remain contextually typed through one
exact-options generic, so editors suggest the complete option set while
TypeScript preserves literal values and nested object-field inference.
Built-in factories also validate JavaScript-shaped declarations against an
explicit option contract for their exact kind. The shared Core normalizer
deliberately does not impose these built-in allowlists on
`definePluginField()`: plugin-owned structural option keys remain the
responsibility of the plugin factory.
Dependent rules such as `autoNow` with a default or list are checked outside
the contextual option object. Hover information
documents every built-in factory and option with a focused declaration example.
`App.Schema.define()`, its top-level options, and nested composite-index
options expose the same contextual documentation through completion and hover
popups.

Every built-in field uses compact field inference. Return types keep only
effective create, object, update, nullability, and list state. Default presence
and automatic value generation are represented as booleans rather than their
runtime values. Constraints, indexes, descriptions, literal defaults, and
runtime option values remain available through each widened field-options
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
const PostSchema = UltimaBase.Schema.define({
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

Plans retain each original field by identity instead of rebuilding validators,
enum domains, defaults, or type-specific options. A scalar node
therefore contains only `kind: "scalar"`, `field`, `presence`, and `nullable`.
Object and array nodes add only their operation-specific child structure.
Compilation never invokes a default factory or executes a validator.

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
before installed policy and behavior; Schema does not validate request data itself
and does not depend on a third-party schema language.

Runtime applies these structural plans before optional mutation guards and
installed policy. Plans never rebuild a second schema or execute application
callbacks during compilation.

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
Database-specific expressions belong to typed adapter plugins rather than
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

## Optional application field validation

Core deliberately exposes no application validator. It always enforces required
presence, nullability, canonical scalar and object shapes, lists, enum domains,
pointers, relations, defaults, generators, immutable fields, decimal shape,
and repeatable structural snapshots.

Install [`@ultimabase/validation-plugin`](../../validation-plugin/README.md) to
add the direct `validation` option and synchronous Standard Schema V1 rules.
That plugin owns validator typing, execution, diagnostics, projected arithmetic,
and the stable `field.validation` issue code. Without it, the configured factory omits the
option and application compilation rejects a stale or untyped declaration that
uses it.

## String fields

`stringField(options)` creates immutable string metadata while preserving
literal options for later schema inference. Calling `stringField()` defines an
optional string whose persisted absence is represented by `null`.

Additional length, pattern, email, URL, slug, and application-specific string
rules can be supplied by an installed application plugin.

### Application formats are composition, not field kinds

A format or numeric bound does not create a new logical field value. Keep the
native field that owns the canonical TypeScript and storage value, then apply
the optional application policy selected by the developer:

| Application rule                                          | Native UltimaBase field |
| --------------------------------------------------------- | ----------------------- |
| email, phone, URL, hostname, IP address, slug, color      | `field.string()`        |
| country, currency, language, locale, timezone identifiers | `field.string()`        |
| port and positive safe integer                            | `field.int()`           |
| percentage, positive number, latitude, longitude          | `field.float()`         |
| exact positive decimal or exact percentage                | `field.decimal()`       |

Phone parsing, slug rewriting, case conversion, locale canonicalization, and
similar value changes remain explicit input transformations rather than Core
field-shape behavior. UltimaBase does not select or publish a validator library.

A plugin-defined field kind is justified only when it owns at least one
distinct semantic boundary: a canonical value type, storage representation,
Query behavior, Runtime snapshot, relationship behavior, or adapter contract.
Such fields continue through the public plugin field, codec, Query, Runtime,
and adapter contracts; they do not lower through a speculative native-field
derivation layer.

## Integer fields

`intField(options)` represents safe JavaScript integers. It supports
`autoIncrement: true | false` as declarative database-sequence metadata.
Additional numeric rules may be supplied by an installed application plugin.

## Bigint fields

`bigintField(options)` represents exact native JavaScript `bigint` values. Its
defaults use bigint literals such as `0n`, and it supports the same declarative
`autoIncrement` metadata as integer fields.

Schema does not serialize bigint values. Transport plugins must apply an
explicit string or protocol-specific codec, while PostgreSQL adapters may map
the field directly to the native `bigint` type.

## Float fields

`floatField(options)` represents general JavaScript numbers without promising
decimal precision. Float fields reject auto-increment metadata at both the
TypeScript and runtime boundaries. Finiteness and range rules use Standard
Schema. Exact base-10 values use the separate decimal contract below.

## Decimal fields

`decimalField(options)` represents exact base-10 values as strings such as
`"19.99"` or `"9007199254740993.001"`. JavaScript numbers are rejected because
they cannot preserve arbitrary decimal precision. Values use plain decimal
notation without exponent notation, leading zeroes, a leading plus sign, or
negative zero representations.

The direct `precision` option limits total digit precision and must be a
positive safe integer. The direct `scale` option limits fractional digits,
must be a non-negative safe integer, and cannot exceed precision when both are
supplied. They remain inspectable structural shape used by database adapters;
for example, PostgreSQL compiles them to `numeric(p)` or `numeric(p, s)`.
Additional decimal rules may be supplied by an installed application plugin.

PostgreSQL adapters may map this contract to `numeric` or `decimal`. Transport
plugins must preserve the string representation or use an explicit decimal
codec rather than converting through `number`.

## Boolean fields

`booleanField(options)` creates immutable boolean metadata and preserves literal `true` or `false` defaults. It uses the direct common `required` option without adding boolean-specific constraints.

## Binary fields

`binaryField(options)` represents raw bytes as a native `Uint8Array`. Node.js
`Buffer` values are accepted because they extend `Uint8Array`, and defensive
copies preserve their runtime subclass. Static scalar, list, and structured
defaults are copied so later mutations of caller-owned storage cannot change
schema metadata.

Byte-length rules may be supplied by an installed application plugin over the
complete `Uint8Array`. Transport encodings such as Base64, hexadecimal, and multipart
data remain transport concerns. Database adapters own physical storage
decisions such as PostgreSQL `bytea`.

JavaScript cannot freeze the indexed contents of a non-empty typed array.
UltimaBase therefore guarantees binary snapshot isolation by copying byte
sequences at declaration and future Runtime input/output boundaries rather than
claiming deep object freezing.

## Date fields

`dateField(options)` represents a calendar day as a canonical `YYYY-MM-DD`
string such as `2026-07-31`. It contains no time or timezone. Static defaults
use the same format; additional date rules validate that canonical string.

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
alongside `default`. Runtime derives automatic values from
one operation-scoped instant shared with system fields. Application timezone
configuration, defaulting to UTC, controls calendar and zone-less projections
without relying on the host machine timezone.

## UUID fields

`uuidField(options)` represents a UUID through its canonical string value.
UUID syntax is an unconditional field-shape invariant. Version restrictions
and other application rules may be supplied by an installed application plugin.

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

Persisted values form the exact inferred string union, while mapping keys remain available to future schema and SDK generators. Sources must be non-empty, persisted values must be unique, and static defaults must belong to the inferred domain. Numeric TypeScript enums are rejected because their runtime reverse mappings do not represent a string domain.

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
				required: true,
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
portable `indexed` metadata needs a top-level schema field, while
`intField({ autoIncrement: true })` and
`bigintField({ autoIncrement: true })` require a dedicated top-level database
column and cannot be embedded. These option names are absent from the embedded
builder even when their value would be `false`; unsupported metadata is rejected
rather than ignored.

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

## Plugin-defined fields

`definePluginField(kind, options, normalizers)` lets a plugin introduce a
logical field kind without teaching Schema about its database representation.
Kinds must be non-empty, namespaced strings and cannot shadow framework-owned
field kinds. The factory reuses direct presence, defaults, lists, indexes,
descriptions and immutability while delegating scalar value snapshots to
`snapshotValue`. Installed direct field-option plugins may augment built-in and
plugin-defined values only in the contexts they explicitly support. Direct
`required` presence remains independent.

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
configuration without a parallel plugin-only plan. Application compilation
rejects unclaimed or conflicting plugin kinds; Schema remains independently
usable and does not own that registry.

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

## Optional schema behavior

Schema and field lifecycle behavior is supplied by plugins rather than native
Schema declarations. See the
[`@ultimabase/hooks-plugin` README](../../hooks-plugin/README.md) for the
official `hooks` namespace and extension targets. Policy declarations likewise
belong to the
[`@ultimabase/access-plugin` README](../../access-plugin/README.md), while ACL
uses Core's generic protected-policy contracts directly.
