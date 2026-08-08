# @ultimabase/core

The complete foundational UltimaBase framework for Node.js.

Responsibilities:

- immutable schemas, built-in and plugin-defined fields, and type inference;
- canonical object reads plus immutable QueryBuilder and Operation AST builders;
- native schema and field Access declarations plus policy-neutral enforcement foundations;
- anonymous and trusted master request authority with plugin-owned typed values;
- isolated `FrameworkApplication` instances;
- plugin definitions and global plugin graph;
- nested plugin normalization;
- typed service tokens and registries;
- lifecycle phases;
- request engines, validation, transactions, hooks, and database contracts;
- the public `UltimaBase` application facade.

Core must never import a concrete database, server, transport, migration,
permission, authentication, cache, or jobs package. Those optional capabilities
remain plugins above this package.

## Internal domains

One package does not mean one monolithic source folder. The implementation keeps
explicit `schema`, `query`, `access`, and `runtime` domains alongside application
orchestration, plugins, services, and errors. Internal folders are not exported
as package subpaths; every supported API comes from `@ultimabase/core`.

Detailed guides remain focused by domain:

- [Schema and fields](docs/schema.md), with practical [schema examples](examples/schema/README.md);
- [Query and Operation AST](docs/query.md);
- [request authority](docs/access.md);
- [Runtime, engines, transactions, and hooks](docs/runtime.md).

## Pointers and lazy relationship targets

Core resolves relationship targets only after declaration-only plugin setup has
finished. A plugin may therefore register a schema during setup, while a lazy
callback can safely reference a class declared later in the module. Resolution
then closes schema registration and produces one immutable graph owned by the
application:

```ts
const application = await createApplication({
	schemas: [UserSchema, PostSchema],
	plugins: [],
})

application.schemaTargets.values()
```

`pointerField` declares one object reference while preserving the exact target
class in every inferred model:

```ts
const PostSchema = Schema.define({
	className: 'Post',
	fields: {
		author: pointerField({
			target: () => UserSchema,
			validation: { required: true },
		}),
	},
})

const author = UserSchema.pointer('0198f090-2a50-7000-8000-000000000034')
const draft = new PostSchema({ author })
```

`Pointer<TSchema>` contains only immutable logical schema identity and an object
ID. It never loads the target. `new Pointer(UserSchema, id)` provides the
general constructor, while `UserSchema.pointer(id)` is the concise typed form.
Pointers serialize to `{ type: "pointer", className, id }` and compare by exact
schema identity plus ID.

Pointers participate in reads without revealing physical foreign-key names.
Equality and membership predicates accept target object IDs directly; ordered
and string comparisons are rejected. Target traversal stays explicit and
target-typed:

```ts
const memberships = await Membership.findMany({
	where: {
		project: {
			eq: projectId,
			is: { archived: { eq: false } },
		},
	},
})
```

`eq` compares only the stored pointer identity. `is` and `isNot` query fields
of the visible target and therefore apply its Access constraints. Pointer
nullability remains explicit through `isNull` and `isNotNull`. `pointer.findOne()` and
`pointer.exists()` execute normal reads already scoped by the pointer ID, while
bounded single-target inclusion is selection-aware:

```ts
const posts = await PostSchema.findMany(
	{
		select: { id: true, title: true },
		include: { author: { select: { id: true, name: true } } },
	},
	{ ultimabase },
)

// `author` is the selected User model, or null when missing or inaccessible.
```

An included pointer accepts only `select` and nested `include`: the pointer
already identifies at most one target, so inclusion cannot conditionally filter
it. Target Access still applies and may make an inaccessible pointer `null`.

`select` is flat and schema-correlated. Any `true` flag selects only the fields
marked `true`; an object containing only `false` flags selects every other
field. `{}` keeps the complete result shape. Relationship result shaping stays
explicit through `include`.

Runtime evaluates target Access, applies target constraints, and validates
selected targets. Inclusion does not manufacture a target schema lifecycle;
reads expose no schema hooks. PostgreSQL loads the
prepared tree through Drizzle relational `with`. Missing or inaccessible
pointer targets become `null`; a relation contains only its visible targets and
therefore becomes an empty array when none remain. Nested inclusions use the
same rules. Pointer Field Access still receives the field's declared `Pointer`
value; only the result returned to the caller is hydrated.

Pointer field hooks may normalize input. Field Access owns pointer disclosure,
while field definitions and transports own output representation.
`relationField` remains a handle-only
declaration and accepts no field hooks.

The target ID used by pointer reads and inclusion is a private Runtime row
filter. It never enters the developer AST, so application query options can
neither inspect nor remove it. A target read inherits the active request; outside one,
it accepts the same `{ ultimabase, context, useMasterKey }` options as every
schema-root read.

`onDelete` defaults to `restrict`; `cascade` and optional-pointer `setNull` are
explicit alternatives. `indexed: "unique"` declares a one-to-one pointer.
Pointer lists and defaults are rejected so relationship writes stay explicit;
to-many collections use `relationField` instead. Physical foreign keys are
implemented by database plugins. An adapter serving schemas with pointer fields
must advertise the exported versioned
`databasePointerCapability`; setup fails before execution when it does not.

`relationField({ target })` declares the owning side of a to-many relationship.
An inverse names one exact pointer or owning relation on its target through
`mappedBy`:

```ts
const UserSchema = Schema.define({
	className: 'User',
	fields: {
		posts: relationField({ target: () => PostSchema, mappedBy: 'author' }),
	},
})
```

The example represents one-to-many storage through `PostSchema.author`. An
owning relation plus one inverse relation represents many-to-many storage, while
one-to-one remains `pointerField({ indexed: "unique" })`. Relation fields are
root-level schema declarations and never appear in `InferObject`, create input,
update input, validation values, or an ordinary unloaded model.

Reads may explicitly include the collection with an independently shaped target
query:

```ts
const users = await UserSchema.findMany({
	select: { id: true },
	include: {
		posts: {
			orderBy: [{ createdAt: 'desc' }],
			offset: 10,
			limit: 10,
			select: { id: true },
		},
	},
})

// `users[0].posts` is a readonly array of selected Post models.
```

Unlike a pointer, an included relation supports `where`, `orderBy`, `offset`,
`limit`, `select`, and nested `include`. Its offset is applied independently to
every parent collection. Per-parent cursor pagination is deliberately not part
of this contract. Source relation Field Access runs once before loading. Target
Access and output resolution still apply through the target read pipeline.

Persisted models expose only their declared to-many fields through an immutable
`Relation<TSource, TTarget>` handle:

```ts
const posts = user.relation('posts')
const recentPosts = await posts.findMany({
	select: { id: true, title: true },
	orderBy: [{ createdAt: 'desc' }],
	limit: 20,
	cursor: true,
})
```

`relation()` autocomplete excludes pointers and scalar fields. Drafts cannot
create a handle, while selected persisted models retain a protected source ID
without adding it to their visible values. The handle is opaque, frozen, and
never serializes a related collection. Its direct `findMany`, `findOne`, `get`,
`count`, and `exists` methods accept the same canonical object inputs as the
target schema. The source edge stays in private Runtime state across every
public input and hook transformation; it never appears in the developer AST
and cannot be replaced by a `QueryBuilder` scope.

Ordered scalar filters include explicit inclusive ranges. `between` keeps
values inside the interval, while `notBetween` keeps values strictly outside
it. Both remain first-class
transport-neutral AST nodes rather than expanding into logical branches.

Structured filters use the same flat vocabulary for dynamic JSON and typed
objects. Object containment accepts recursive partial values, and object keys
and paths retain exact autocomplete:

```ts
const visible = await Post.findMany({
	where: {
		metadata: {
			contains: { visibility: 'public' },
			hasAllKeys: ['visibility', 'category'],
			jsonPathExists: {
				source: '$.items[*] ? (@.price > $minimum)',
				variables: { minimum: 10 },
			},
		},
		profile: {
			at: [
				{
					path: ['contact', 'email'],
					eq: 'ada@example.com',
				},
			],
		},
	},
})
```

`at` keeps segments separate in the Query AST, so dots inside declared field
names are never parsed as paths. A `jsonField` accepts dynamic string
segments and safe `JsonValue` operands. An `objectField` rejects unknown paths,
keys, values, and unsupported terminal operators in TypeScript. Paths cannot
traverse list fields. Embedded object children are stored values, so pointer and
relation fields and auto-incremented integer sequences must remain top-level
schema fields. Since persisted typed objects contain every declared key,
their root key checks are normally redundant; the same operators are primarily
useful for dynamic JSON branches.

`jsonPathExists()` and `jsonPathMatches()` are explicit advanced escape hatches.
Their JSONPath source string is intentionally untyped, but the target remains a
JSON or object structure and variables remain immutable portable JSON. On an
`objectField`, the expression observes encoded JSONB values, including child
storage codecs such as bigint strings.

Relation handles expose atomic logical mutations without join-row commands:

```ts
await post.relation('tags').connect(Tag.pointer(tagId))
await post.relation('tags').disconnect([oldTag, archivedTag])
await post.relation('tags').set([featuredTag, newsTag])
await post.relation('tags').clear()
```

Each call uses the source schema's update Access and hook lifecycle, validates
target visibility, and joins the active or automatic transaction. Inverse
pointer relations execute ordinary target pointer updates through the same
Runtime. Adapters must advertise the versioned relation capability; PostgreSQL
implements scoped reads and atomic edge storage, while unsupported adapters
still fail closed.

Source Queries filter to-many relationships through the exact target schema:

```ts
const visiblePosts = await UserSchema.findMany({
	where: {
		posts: {
			count: {
				where: { published: { eq: true } },
				gte: 3,
				lt: 100,
			},
			some: {
				published: { eq: true },
				tags: { some: { label: { eq: 'typescript' } } },
			},
		},
	},
})
```

`some`, `none`, and `every` create immutable portable Query AST nodes from exact
nested `WhereInput` values. `count` compares a visible relation as a non-null
integer through `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `in`, `notIn`, `between`,
or `notBetween`; operands must be non-negative safe integers. Its optional
target-typed `where` filters the related objects before every comparison, and at
least one comparison is required. Runtime evaluates every target Access filter
into a private adapter scope that source hooks cannot remove. Predicate depth is
bounded, and adapters must advertise the separate versioned relation predicate
capability before execution.

A to-many relation is never nullable. Use `isNotEmpty: true` to require at least
one visible related object and `isEmpty: true` to require an empty visible
collection; `isNull` and `isNotNull` are reserved for stored fields. These
explicit flags normalize to `some: {}` and `none: {}` so adapters retain their
optimized existence predicates. `every` is true for an empty visible
collection, so combine it with `isNotEmpty: true` when at least one target must
exist.

`count: { eq: 0 }` and `count: { gt: 0 }` are valid, but `isEmpty: true` and
`isNotEmpty: true` remain the clearer and cheaper existence forms. Multiple
count comparisons, including a filtered count, reuse one cardinality
calculation rather than issuing one query per operator or parent object.

When an edge owns application data, model it as an ordinary schema with two
pointer fields instead of hiding metadata behind `relationField`:

```ts
const Membership = Schema.define({
	className: 'Membership',
	fields: {
		member: pointerField({
			target: () => Member,
			validation: { required: true },
		}),
		project: pointerField({
			target: () => Project,
			validation: { required: true },
		}),
		role: enumField({
			values: ['editor', 'viewer'] as const,
			validation: { required: true },
		}),
	},
	indexes: [{ fields: ['project', 'member'], unique: true }],
})
```

This explicit edge receives the same inference, read, Access, hook,
transaction, index, and referential behavior as any other schema. Use it when
the relationship has fields or its own lifecycle; keep an implicit owning
`relationField` for metadata-free set membership. See the
[complete relationship example](examples/schema/explicit-relationships.md).

Invalid, throwing, unregistered, and foreign targets fail before infrastructure
connects with the source class and field path. The graph contains logical class
identities only and no PostgreSQL, REST, or GraphQL metadata.

## Plugin-owned request identity

Core has no User schema, session resolver, or authenticated-user authority
mode. Applications work with anonymous and audited master authority until an
optional plugin derives typed values on an immutable request context:

```ts
interface AuthenticatedPrincipal {
	readonly id: string
}

const authenticatedPrincipal = new RequestContextValue<AuthenticatedPrincipal>(
	'auth.principal',
	(value: unknown): AuthenticatedPrincipal => {
		if (
			typeof value !== 'object' ||
			value === null ||
			!('id' in value) ||
			typeof value.id !== 'string'
		) {
			throw new TypeError('Invalid authenticated principal')
		}

		return Object.freeze({ id: value.id })
	},
)

const request = RequestContext.anonymous({
	requestId: 'request-01',
	source: requestSources.internal,
}).withValue(authenticatedPrincipal, { id: 'user-1' })

request.access.mode // 'anonymous'
request.getValue(authenticatedPrincipal)?.id // string | undefined
```

The token owns validation and snapshotting. Matching token names do not share
identity, adding the same token twice fails, and neither context derivation nor
transport data can manufacture master authority. `HookContext.getValue()`
provides the same typed read boundary without exposing `withValue()`.

Permission providers may also consume optional subject capabilities without
importing a concrete authentication or role plugin. Dynamic principals use
nominal `RequestContextValue<T>` identities. An authentication provider may
publish one exact current principal without becoming a Core dependency:

```ts
services.provide(accessPrincipalResolverServiceToken, {
	resolveCurrent: ({ context }) => context.getValue(authenticatedPrincipal),
})
```

Access providers retrieve this service optionally and call
`resolveAccessPrincipal()`. The helper rejects forged Pointers and schemas not
owned by the consuming application. An absent provider or absent request-local
identity returns `undefined`; neither creates authenticated authority.

Role-aware configuration may conditionally call
`services.require(accessRoleResolverServiceToken)` and capture the returned
typed reference in an Access rule. Core validates that requirement after all
plugin setup callbacks and before infrastructure starts, so provider
configuration order is irrelevant. Applications with no role-aware policy
require no resolver at all.

## Read and mutation execution authority

Every schema read resolves authority only when it executes. Inside an
active request, transaction, or hook it inherits that exact engine. Root jobs
identify one application explicitly, while an authentication or tenant plugin
may supply an already-derived context:

```ts
const inherited = await PostSchema.findMany()
const root = await PostSchema.findMany(undefined, { ultimabase })
const authenticated = await PostSchema.findMany(undefined, {
	context: contextCreatedByAuthPlugin,
	ultimabase,
})
```

Trusted backend code may request audited master authority in the same final
option position. Combining both elevates the supplied context and preserves its
typed values:

```ts
const allPosts = await PostSchema.findMany(undefined, { useMasterKey: true })
const imported = await PostSchema.createMany(
	{ data: rows },
	{
		context: contextCreatedByAuthPlugin,
		ultimabase,
		useMasterKey: true,
	},
)
```

Every read and mutation accepts the same `OperationOptions` authority boundary.

The application-owned `MasterAuthority` audits the operation before it runs;
the first configured key ID labels trusted operation elevations. Contexts and
authority flags never enter Query or Operation ASTs, and transports must not
map client input into these server-only options.

## Automatic mutation transactions

Every root create, update, upsert, and delete operation automatically uses the
configured database adapter's transaction lifecycle. Developer code keeps the
same concise API:

```ts
const post = await PostSchema.createOne(
	{ data: { title: 'Atomic by default' } },
	{ ultimabase },
)
```

The complete current Runtime mutation pipeline and database work started inside
it commit or roll back together. Native schema, field, and plugin hooks execute
inside this same active boundary. An explicit
`RequestEngine.transaction()` is reused without nesting, while root reads
remain non-transactional. Collection mutations are ordered singular item
operations inside one transaction: any missing target, input, persistence,
business-hook, or finalization failure rolls back the complete batch.

```ts
const imported = await PostSchema.createMany(
	{
		data: rows,
		select: { id: true, title: true },
	},
	{ ultimabase },
)
```

Database plugins prepare each transaction-bound mutation through one opaque,
single-use handle. Its execution keeps the projected public result separate
from the complete logical materializations supplied to schema lifecycle hooks.
Every model-returning schema mutation accepts the same flat selection contract
as schema reads; no write command performs implicit relation loading:

```ts
const created = await PostSchema.createOne(
	{
		data: { title: 'Created' },
		select: { id: true, title: true },
	},
	{ ultimabase },
)

const updated = await PostSchema.updateOne(
	{
		where: { id: { eq: postId } },
		data: { title: 'Updated' },
		select: { id: true, title: true, author: true },
	},
	{ ultimabase },
)

const deleted = await PostSchema.deleteOne(
	{
		where: { id: { eq: postId } },
		select: { id: true, title: true },
	},
	{ ultimabase },
)

// Itemized batches return only identifiers unless a projection is requested.
const published = await PostSchema.updateMany(
	{
		data: postIds.map((id) => ({
			where: { id: { eq: id } },
			data: { published: true },
		})),
		select: { id: true, published: true },
	},
	{ ultimabase },
)

// Pointer and relation fields remain unloaded references until queried.
const author = await updated?.author.findOne()
```

This protocol belongs to database-adapter authors rather than application code.
The root adapter starts the transaction. For update, delete, and upsert, its
transaction adapter stabilizes the visible target before schema input
resolution and item Access complete. Runtime then runs the item lifecycle and
consumes the prepared mutation exactly once.

Policy and value-object plugins may register `preparedOperation()` when an
accepted `updateOne()` value depends on that locked target. The handler receives
the fully typed current object and may replace only values inside the existing
normalized update shape. Runtime groups this replacement with field and schema
input resolution, then performs one final structural revalidation,
value-dependent field Access, and item Access pass. The adapter receives the
final operation and cumulative constraints for the write. The handler cannot
change the query, target, fields, operators, schema, or terminal kind. Public
collection commands are already itemized before this boundary, so each update
entry uses the same singular lifecycle.

```ts
import { Schema, UltimaBase, booleanField, stringField } from '@ultimabase/core'

const PostSchema = Schema.define({
	className: 'Post',
	fields: {
		title: stringField({ validation: { required: true } }),
		published: booleanField({ default: false }),
	},
})

const ultimabase = new UltimaBase({
	schemas: [PostSchema],
	plugins: [databasePlugin()],
})

const draft = new PostSchema({ title: 'Preview' })
const selectedPosts = await PostSchema.findMany({
	select: { id: true, title: true },
})

const created = await draft.create(
	{ select: { id: true, title: true } },
	{ ultimabase },
)
const updated = await created.update(
	{ data: { title: 'Published' }, select: { id: true, title: true } },
	{ ultimabase },
)
const fresh = await updated.fetch(
	{ select: { id: true, title: true } },
	{ ultimabase },
)

const pointer = fresh.toPointer()
console.log(fresh.equals(pointer), await fresh.exists({ ultimabase }))

await updated.delete({ select: { id: true } }, { ultimabase })
```

`new PostSchema(input)` creates a typed immutable draft and never performs I/O.
Runtime queries and mutations return immutable `PostSchema` instances only after
hooks and field restrictions finish. `get(field)` and `toJSON()` expose only the
fields visible in that result, so a selected result cannot recover omitted data.
Draft `create` and `upsert` plus persisted `update`, `delete`, and `fetch` accept
the same exact result selections as their static read or mutation equivalents.
`fetch` and `exists` reuse the normal read pipeline, including Access and hooks.
`toPointer` and `equals` operate locally on protected identity, even when `id`
was not selected. All instance commands remain immutable conveniences: a
mutation starts without the receiver's read selection and returns a new model.
`get`, `fetch`, `update`, and `delete` target one exact identity and throw
`NOT_FOUND` when it no longer exists. Schema `updateOne({ where })` and
`deleteOne({ where })` remain nullable conditional mutations and skip their item
lifecycle hooks when no row matches.
Collection reads and writes live on the generated schema class. Models
deliberately expose no mutable `save()` method.

## Native Access and schema hooks

Access and hooks are complementary Core capabilities. Access declares security
boundaries through `operation`, `filter`, `item`, and `field` policies. Hooks
express business transformations and effects only after Access has restricted
the operation.

Schemas now accept native declaration-only policies, and every built-in or
plugin field accepts its own inline policy. One logical family covers singular
commands and every item from a collection command. Item-oriented mutation
callbacks therefore expose the business `kind` (`create`, `update`, `upsert`,
or `delete`) without cardinality. Early `operation` Access and an exposed
`operation.kind` retain the exact normalized terminal such as `update-one`:

```ts
const PostSchema = Schema.define({
	className: 'Post',
	access: {
		operation: {
			read: { one: true, many: true, count: false, exists: true },
			delete: ({ context }) => context.access.mode === 'master',
		},
		filter: {
			read: ({ where }) => where.eq('published', true),
		},
		item: {
			update: ({ originalItem, item }) =>
				item.authorId === originalItem.authorId,
		},
	},
	fields: {
		authorId: stringField({
			access: {
				update: ({ originalValue, value }) => value === originalValue,
			},
			validation: { required: true },
		}),
		published: booleanField({
			access: {
				create: true,
				read: { item: true, filter: false, order: false },
				update: false,
			},
		}),
		title: stringField({ validation: { required: true } }),
	},
})
```

These declarations are validated and retained privately; they do not enter
schema metadata, validation plans, migrations, or inferred model values. An
operation read may instead use one shared rule, and a field `read: false`
denies item output, filtering, and ordering together. Every grouped form is
complete so indirect disclosure cannot inherit an accidentally broader rule.
An omitted rule does not create an implicit callback: the compiled application
fallback decides operation and field access. Runtime executes every matching
rule sequentially through the same cancellation, recursion, and diagnostic
boundary as native hooks.

Access callbacks are pure decisions and may be evaluated again after input
transformation, target locking, or final upsert branch resolution. This keeps
the decision attached to the value that is actually persisted.

Field create Access traverses normalized objects parent-first. Nested fields in
object lists are evaluated once per concrete entry, including multidimensional
lists. Cross-field decisions use schema `item.create`, which receives the
complete draft.

Field output Access follows the same concrete traversal. A denied parent omits
its complete property and skips descendant rules; a denied nested occurrence
omits only that property from its object. Lists retain their elements, order,
and dimensions. The omission is structural projection rather than persisted
`null`.

Schema `item` Access receives operation-specific materializations. Create
decisions and the create branch of an upsert receive an immutable
`SchemaPreparedDraft` with no persistence commands. Update receives the
complete persisted `originalItem` plus an immutable plain `item` containing the
final candidate after operators such as `increment` have been applied. Delete
receives that persisted `originalItem` and `item: null`; upsert exposes the
actual branch through `mode`. Every contribution for one decision observes the
same materialized values.

Generic field update Access follows the same rule through `originalValue` and
the final `value`. Nested object fields are evaluated at their concrete paths,
including each object-list entry; removing a nested value exposes `null` as its
final canonical value. Relation fields intentionally keep their typed mutation
delta because to-many relations are not embedded inside the parent object.

An Access filter uses the canonical `WhereInput` contract and normalized
predicate nodes from `Query.where`, while remaining in private monotonic state.
Developer query options can add filters, ordering, or limits but cannot inspect,
replace, or remove Access filters. ACL and community policy plugins register
contributions to this native system rather than business hooks.

The callback receives one immutable schema-aware `WhereBuilder` utility and no
terminal `kind`, so `get`, `findOne`, `findMany`, `count`, and `exists` always
observe the same protected row universe. It may return `true`, `false`, a
`WhereInput` object, or the supplied builder. Every independent native or
plugin contribution is later combined through `AND`:

```ts
filter: {
	read: ({ context }) => {
		const principal = context.getValue(authenticatedPrincipal)

		return principal === undefined
			? { published: { eq: true } }
			: {
					OR: [
						{ published: { eq: true } },
						{ authorId: { eq: principal.id } },
					],
				}
	},
}
```

The object form is the source of truth shared with future transports. The
builder remains an immutable utility for dynamic composition and has no
selection, ordering, pagination, terminal, or execution method. Its equality,
comparison, membership, string, regex, relationship, and logical methods build
the same `WhereInput` contract without exposing the developer Query or its AST.

Relationship predicates declared by Access are trusted server policy. They may
reference relation or target fields whose public field `filter` rule is false,
while Runtime still applies the target schema's operation Access, row filters,
plugin constraints, and recursively nested relationship policies.

Application initialization compiles native declarations and owner-bound plugin
policies once, before infrastructure connects. Plugins contribute through the
typed `access` setup facade, select exact schema or field targets, and state
whether audited master requests bypass or enforce their contribution. Omitted
decisions use the configurable application fallback; it allows both operation
and field access by default for applications that declare no policy:

```ts
const ultimabase = new UltimaBase({
	access: { default: { operation: false, field: true } },
	schemas: [PostSchema],
	plugins: [visibilityPlugin],
})
```

At execution time, Access filters travel beside the operation in the private
database request. Business hooks see only the developer Query, while adapters
combine both predicates with logical `AND`. Singular mutation item checks run
against the adapter's prepared target before the write; value-dependent field
output is removed before business output hooks and checked again after their
transformations. See [Core Access](docs/access.md) for the complete lifecycle.

Neutral declaration helpers keep common policies explicit without creating
Runtime behavior. A read-only schema can deny every mutation concisely:

```ts
import {
	allMutations,
	allOf,
	allOperations,
	allowAll,
	anyOf,
	denyAll,
	not,
} from '@ultimabase/core'

const readOnly = {
	read: allowAll,
	...allMutations(denyAll),
}

const explicitDefaultDeny = {
	...allOperations(denyAll),
	read: { one: allowAll, many: allowAll, count: denyAll, exists: allowAll },
}

const editorOrOwner = anyOf(hasRole(Editor), isOwner('author'))
const editable = allOf(editorOrOwner, not(isLocked))
```

Each helper returns a fresh frozen record and retains a supplied callback by
identity. Ordinary object-spread order controls overrides; the helpers add no
custom merge semantics or permission-provider concepts.

`anyOf`, `allOf`, and `not` compose booleans plus synchronous or asynchronous
decision callbacks in deterministic short-circuit order. They simplify
constants and single callbacks during declaration, check cancellation between
awaited decisions, and allocate no request-local registry or policy object.
Composition is local to one rule: separate native and plugin contributions
still combine through the Runtime's monotonic `AND` boundary.

### Schema hooks

Schemas can colocate typed mutation lifecycle declarations without installing a
plugin. The public surface has four concepts: `resolveInput`,
`beforeOperation`, `afterOperation`, and `transaction`:

```ts
const PostSchema = Schema.define({
	className: 'Post',
	fields: {
		title: stringField({ validation: { required: true } }),
	},
	hooks: {
		resolveInput: {
			all: ({ operation }) => operation,
			create: ({ operation }) => operation,
		},
		beforeOperation: {
			update: ({ originalItem, item }) => audit(originalItem, item),
		},
		afterOperation: {
			create: ({ item }) => audit(item),
		},
		transaction: {
			afterCommit: ({ changes }) => publish(changes),
		},
	},
})
```

Every branch accepts one handler or a non-empty ordered handler list.
`resolveInput` accepts the `all`, `create`, `update`, and `upsert` families.
`beforeOperation` exposes `create`, `update`, and `delete`.
`afterOperation` additionally exposes `upsert`. A collection command is
itemized before hook dispatch. `beforeOperation.create` exposes the business
discriminant `kind: "create"` and the complete candidate without leaking its
internal `create-one` terminal. Its `item` is a `SchemaPreparedDraft`: a real
immutable instance of the generated schema class with normalized defaults and
system fields, `get()`, and `toJSON()`, but no persistence command in its public
type.

Mutation hooks receive complete selection-independent values per affected
object, using the same shape for direct and batched commands.
`beforeOperation.create` sees `context`, `kind: "create"`, and `item`;
`beforeOperation.update` sees `kind: "update"`, `originalItem`, and the
candidate `item`; `beforeOperation.delete` sees `kind: "delete"`,
`originalItem`, and `item: null`. Matching
after-operation hooks receive the persisted pair. Upserts receive their pair
only after persistence because the database chooses the create or update
branch atomically. Mutation before-hooks may perform transactional work or
throw, but their return value is ignored. `resolveInput` receives
`originalItem`: `null` for create, the visible locked object for update, and
either for upsert. Every non-null `originalItem` is a complete immutable
`SchemaResult` instance with protected persisted identity, `get()`, `toJSON()`,
and the regular instance commands. Access approves the target before developer
code observes it, then Runtime revalidates transformed values before
persistence.

The same short business `kind` is used by schema `item` Access, mutation field
Access, field `resolveInput`, schema `resolveInput`, operation observers, and
transaction changes. When a callback also receives `operation`, its
`operation.kind` remains the exact internal terminal for diagnostics and AST
narrowing.

The constructor validates every phase, snapshots every list and family map, and
keeps them in private identity-owned storage. Hooks never appear on
`SchemaDefinition`, never affect input or object inference, and never enter
validation plans, indexes, migrations, or physical diffs.

After target-aware input resolution and structural revalidation, Runtime invokes
the matching `beforeOperation` observer once per prepared item and the matching
`afterOperation` observer once per persisted item. Both may perform
transactional work or throw. Their return values are ignored; only
`resolveInput` transforms data. Every batch shares one transaction, preserves
declaration order, and rolls back when a target is missing or an item fails.

Reads deliberately have no schema lifecycle hook. Query options define
developer filtering and projection, while schema Access owns mandatory read
filters:

```ts
const ArticleSchema = Schema.define({
	className: 'Article',
	fields: {
		title: stringField({
			validation: { required: true },
		}),
		published: booleanField({ default: false }),
	},
	access: {
		filter: {
			read: ({ where }) => where.eq('published', true),
		},
	},
})

const articles = await ArticleSchema.findMany(
	{ select: { id: true, title: true } },
	{ ultimabase },
)

// The exact result is readonly { id: string; title: string }[].
```

Opaque Access and adapter constraints remain outside the developer Query.
Runtime projects the adapter result, hydrates requested pointer and relation
targets, then applies monotonic output restrictions as the final public
boundary.
`count` and `exists` retain `number` and `boolean` results and skip value
resolution. Root reads do not open an automatic transaction; reads inside an
explicit transaction reuse it.

Runtime compiles declarations once per application. Input resolution runs from
nested children to parents, and transformed input is structurally revalidated
without replaying defaults or generators. `resolveInput` may throw for business
validation. Operation observers run inside the automatic mutation transaction,
so throwing rolls back database work performed earlier in the same request.

Transaction finalization is explicit and ordered. Both
`transaction.beforeCommit` and `transaction.afterCommit` receive one immutable
per-schema `changes` summary. The former may abort; the latter runs only after
the outer commit and is intended for external effects. See the
[Runtime guide](docs/runtime.md#transaction-finalization-hooks) for the public
contract and example.

Every native and low-level business hook receives a safe execution `context`:

```ts
const PostSchema = Schema.define({
	className: 'Post',
	fields: { title: stringField() },
	hooks: {
		beforeOperation: {
			create: async ({ context, item, kind }) => {
				await AuditSchema.createOne({ data: { action: kind } })
				context.emit('post.created', { title: item.title })

				console.log(context.requestId, context.transactionId)
			},
		},
	},
})
```

`requestId` correlates the originating request. `transactionId` is defined for
automatic mutations and explicit transactions and remains identical across
nested operations. `signal` carries cooperative request cancellation and native
deadlines such as `AbortSignal.timeout()`. A regular schema read keeps exact
inference and reuses the current transaction. Unawaited nested work is
drained before finalization, and a caught nested failure still makes the
transaction rollback-only. The context intentionally omits request metadata,
credentials, adapters, commit/rollback controls, and hook bypasses.

`context.emit(name, payload)` snapshots one JSON object or array and queues it
for delivery only after commit. A plugin registers an explicit consumer:

```ts
setup: ({ registries }) => {
	registries.events.register(
		'posts.created',
		onEvent({
			name: 'post.created',
			handler: ({ event }) => searchIndex.add(event.payload),
		}),
	)
}
```

Emission requires an active transaction and a matching consumer. Rollback
discards the event. Finalization hooks and event consumers receive the same
class for correlation and capability checks, but cannot start queries after the
operation journal has closed.

Runtime rejects direct and indirect re-entry into the same active hook with
`HOOK_RECURSION`. Other phases, fields, and schemas remain available for finite
nested work and retain the active transaction. Cancellation produces
`OPERATION_CANCELLED`, waits for the currently running callback to settle, stops
later pre-commit hooks, and rolls an active transaction back.

One optional plugin may provide `hookDiagnosticsObserverServiceToken` to receive
redacted immutable timing events:

```ts
setup: ({ services }) => {
	services.provide(hookDiagnosticsObserverServiceToken, (event) => {
		metrics.observe(event.phase, event.durationMs, event.status)
	})
}
```

The observer runs outside request-engine scope and receives no operation input,
result, raw error, metadata, credential, or adapter value. Its synchronous or
asynchronous failure never changes hook order, the business result, rollback,
or the original error identity.

## Inline field hooks

Every built-in and plugin-defined field accepts value-focused hooks without
placing callbacks in `field.options` or widening its compact return type. The
callback sees the exact logical value, including enum literals, nullability,
list dimensions, nested objects, and community field values:

```ts
const UserSchema = Schema.define({
	className: 'User',
	fields: {
		email: stringField({
			hooks: {
				resolveInput: [
					({ value }) => {
						const normalized = value.trim()

						if (!normalized.includes('@')) {
							throw new TypeError('Invalid email')
						}

						return normalized
					},
					({ value }) => value.toLowerCase(),
				],
			},
		}),
	},
})
```

Each field exposes only `resolveInput`. A direct handler is the short form; it
also accepts a non-empty ordered list or a family map with `all`, `create`,
`update`, and `upsert`:

```ts
title: stringField({
	hooks: {
		resolveInput: ({ value }) => {
			const normalized = value.trim()

			if (normalized === '') throw new TypeError('Title must not be empty')

			return normalized
		},
	},
})
```

Inline hooks deliberately cannot access sibling fields. A rule comparing
`email` with another property belongs in `UserSchema` hooks, where the complete
operation is available. Omitted input properties do not produce fake
`undefined` executions. `resolveInput` may throw to reject a value; structured
or cross-field validation belongs to schema hooks.

Each `updateMany` entry transforms its supplied update values once, while
`deleteMany` has no field input to resolve. For nested objects, siblings retain
declaration order and input resolution visits children before their parent.
Output representation, business validation, mutation lifecycle, transaction
finalization, and error observation remain field-definition, transport, and
schema concerns rather than additional field hook phases.

## Policy-neutral enforcement primitives

Core currently exposes five protected factories without adding policy names to
Runtime. Definitions are registered in the same owner-scoped hook registry as
other plugin contributions:

```ts
const tenantPlugin = (tenantId: string) =>
	definePlugin({
		name: 'example.tenant',
		setup: ({ registries }) => {
			registries.hooks.register(
				'tenant-row-filter',
				constraint({
					schema: PostSchema,
					handler: () => databaseConstraint('example.tenant', 1, { tenantId }),
				}),
			)
			registries.hooks.register(
				'tenant-visible-fields',
				restrictSelection({
					schema: PostSchema,
					handler: () => ['id', 'title'],
				}),
			)
		},
	})
```

`guard` only allows or throws. `constraint` returns protected namespaced,
versioned `databaseConstraint` nodes that Runtime appends for the adapter. The
version selects the exact payload contract registered by its compiler.
`restrictInput`, `restrictSelection`, and `restrictOutput` return allowed field
names that compose by intersection. Restricted mutation input is rejected,
while selection and output restrictions project excluded fields away. Runtime
evaluates guards, constraints, input restrictions, and selection restrictions
before business effects, keeps the accumulated state private, then reevaluates
monotonically and reapplies input and selection limits after operation
transforms. It evaluates output restrictions once against the fully transformed
result. No policy
contribution means no enforcement stage or permission placeholder.
Each definition may opt into `master: "bypass"`; omission enforces it for
master too, so trusted provider-internal queries skip only explicitly bypassable
policy work before hook-recursion checks.

ADR-0116 retains these guarantees as Access's low-level implementation layer.
After issues 401 and 416–419, official permission providers register native
Access contributions and the application compiler lowers them into these
primitives. Advanced framework plugins may continue using the low-level
factories when they require a policy-neutral capability outside the public
Access vocabulary.

## Framework application

The regular developer entry point is `new UltimaBase(options)` from
`@ultimabase/core`. `createApplication(options)` remains the lower-level
composition boundary used by advanced integrations. It
validates the schema registry and complete plugin graph, runs declaration-only
plugin setup, and returns before infrastructure or transports start:

```ts
const application = await createApplication({
	schemas: [UserSchema],
	plugins: [databasePlugin(), serverPlugin()],
})

await application.start()
```

Every application owns its schema registry, services, contribution registries,
plugin exports, and lifecycle state. No singleton or global mutable registry is
created. `application.getPlugin('fixture.database')` resolves the setup export
using the configured literal plugin name; nested plugin definitions participate
in the same typed lookup.

Framework packages consume plugin-provided services through the application's
read-only lookup boundary:

```ts
const database = application.getService(DatabaseServiceToken)
const optionalCache = application.getOptionalService(CacheServiceToken)
```

The token determines the exact return type. Required lookup reports a
`SERVICE_NOT_FOUND` framework error when no plugin provided the token, while
optional lookup returns `undefined`. Both methods become available after plugin
setup and remain usable while the application is stopped, but fail before setup
or after disposal. They do not expose registration, replacement, enumeration,
ownership, or service disposal.

Runtime also uses `application.ownsSchema(schema)` to verify exact object
identity. A separately declared schema with the same `className` is not owned by
the application, which prevents request engines from crossing application
boundaries accidentally.

`new FrameworkApplication(options)` remains available for advanced composition.
It validates static schema and graph configuration synchronously but leaves setup
lazy until `initialize()` or `start()` is called. A stopped application cannot be
restarted; disposal permanently releases its plugin and service resources.

## Framework errors

`FrameworkError` carries one stable framework code while separating trusted
diagnostics from transport-safe metadata:

```ts
const error = new FrameworkError('NOT_FOUND', 'User row was absent', {
	cause: databaseError,
	publicMessage: 'The requested user was not found.',
	publicDetails: { resource: 'User', id: userId },
	internalDetails: { table: 'users' },
})
```

The regular error message, stack, cause, and `internalDetails` remain diagnostic
state. `JSON.stringify(error)` uses the error's immutable public payload and
includes only its code, retryability, `publicMessage`, and `publicDetails`.
Transports map that payload to HTTP, GraphQL, or other protocol-specific error
formats without adding transport metadata to Core.

## Service tokens

`createServiceToken<TService>(debugName)` replaces untyped service names with
one immutable identity carrying the exact service contract:

```ts
export interface DatabaseService {
	query(sql: string): Promise<readonly unknown[]>
}

export const DatabaseServiceToken = createServiceToken<DatabaseService>(
	'ultimabase.database',
)
```

The debug name exists only for logs and errors. Creating another token with the
same name produces a different identity; consumers must import and share the
exported token value. Every token accepts one provider per application, and the
service registry rejects duplicate provision rather than replacing an existing
service through plugin order.

`ServiceRegistry` stores those values per application and distinguishes required
from optional lookup:

```ts
const services = new ServiceRegistry()

services.provide(DatabaseServiceToken, database)

const requiredDatabase = services.get(DatabaseServiceToken)
const optionalCache = services.getOptional(CacheServiceToken)
```

Direct registry access is intended for application internals and plugin setup.
Plugin authors register through the owner-scoped `services` value supplied to
their setup callback. Application consumers use `application.getService(...)`
or `application.getOptionalService(...)` instead, so they cannot mutate or
dispose the application-owned registry.

Providing the same token twice is an error and never replaces the original
value. Each registry is isolated and has no global state. Calling `dispose()`
clears its references and releases services implementing `Symbol.dispose` or
`Symbol.asyncDispose` once, in reverse registration order.

## Plugin definitions

`definePlugin(options)` creates immutable metadata without executing setup or
lifecycle work:

```ts
export const databasePlugin = () =>
	definePlugin({
		name: 'fixture.database',
		slot: 'database-adapter',
		dependencies: ['fixture.config'],
		setup: ({ services }) => {
			const database = createDatabase()

			services.provide(DatabaseServiceToken, database)

			return { database }
		},
		hooks: {
			connect: ({ pluginExports }) => pluginExports.database.connect(),
		},
	})
```

Names and setup exports retain their exact types for future plugin lookup.
The optional `slot` reserves one exclusive architectural role. Required
dependencies, optional dependencies, conflicts, hooks, and nested definitions
are copied and frozen. Nested plugins remain global graph entries; their
placement under `plugins` is composition syntax.

`normalizePlugins(definitions)` resolves that syntax into immutable flat
metadata without running plugin code. Children receive implicit parent
dependencies, source order is retained, and the exact same definition can be
reused safely. Separate definitions with the same name or two plugins sharing
one exclusive slot fail with `PLUGIN_CONFLICT`.

`new PluginGraph(normalizedPlugins)` validates required and optional
dependencies, explicit conflicts, duplicate entries, exclusive slots, and
cycles. It exposes the deterministic dependency-first order through
`graph.plugins` and iteration:

```ts
const graph = new PluginGraph(normalizePlugins(configuredPlugins))

for (const plugin of graph) {
	console.log(plugin.definition.name)
}
```

Configuration position breaks ties between plugins that are ready together.
Missing optional dependencies are ignored. Graph construction remains static
and never executes setup or lifecycle hooks.

## Plugin setup registries

`PluginSetupRegistries` groups every application-owned setup boundary. A
plugin receives a stable context whose writes automatically record its name:

```ts
const setupRegistries = new PluginSetupRegistries(schemaRegistry)
const context = setupRegistries.forPlugin('fixture.database')

context.services.provide(DatabaseServiceToken, database)
context.registries.commands.register('fixture.reindex', reindexCommand)
```

Extensions, operators, hooks, generators, transports, pipelines, events, and
commands use isolated `ContributionRegistry` instances. Duplicate names within
one category fail instead of replacing the first owner. Setup contexts only
collect declarations; infrastructure work begins in later lifecycle phases.

After setup completes, framework packages can read immutable contribution
snapshots through `application.getContributions('hooks')` and the other
categories. Their insertion order is the resolved plugin graph order: required
dependencies first, then configuration position. Reading during setup or after
disposal fails, and the returned values do not expose a writable registry.
Core's Runtime domain uses this boundary to compose hook and event declarations
without application orchestration depending on their concrete contracts.

Independent subject consumers can register deletion participation without
importing the provider that resolves that subject. The nominal factory prevents
arbitrary command values from being mistaken for cleanup behavior:

```ts
context.registries.commands.register(
	'acl.role-references',
	defineAccessReferenceCleanup({
		kind: 'role',
		hasReferences: ({ reference }) => aclStore.hasSubject(reference.value),
		cleanup: ({ reference }) => aclStore.removeSubject(reference.value),
	}),
)
```

Both callbacks execute only when the subject provider explicitly discovers the
contribution. Their database work inherits the active request transaction;
Core does not name roles, ACL, or a concrete reference store.

Principal owners can encode an exact Pointer without sharing their schema with
the cleanup provider:

```ts
const reference = createAccessPrincipalReference(User.pointer(userId))
const identity = parseAccessPrincipalReference(reference)
```

The versioned neutral value preserves only `className` and `id`. Parsing
validates that boundary without resolving a User schema or importing an
authentication package.

Schema extensions may contribute reserved fields without teaching Core about
the plugin domain:

```ts
const owned = defineSchemaExtension(
	'fixture.owned',
	{ version: 1 },
	'fixture.ownership',
	{ fields: { ownerKey: stringField({ validation: { required: true } }) } },
)
```

Contributed fields join ordinary validation, inference, hooks, Access, and
adapter metadata. Core rejects collisions with developer, system, model, or
other extension fields. A plugin field may explicitly defer its required
create value until `resolveInput`; the normal revalidation boundary still
requires that value before Access and persistence.

Portable plugin scalars may additionally declare a private, versioned JSON
storage codec through `definePluginField()`. Core validates and snapshots both
codec directions without placing executable functions in field metadata.
Database adapters may consume `getPluginFieldStorageCodec()` generically, while
plugin kinds without a portable codec still require a specialized adapter
integration.

## Typed plugin hook targets

A plugin registers native declarations through the owner-bound `hooks` setup
facade. Direct targets retain an exact schema or nested field type, while
extension and field-kind targets expand over every matching declaration during
application initialization:

```ts
import {
	defineFieldExtension,
	defineFieldKindHookTarget,
	definePlugin,
	defineSchemaExtension,
} from '@ultimabase/core'
import { type VectorField, vectorFieldKind } from '@ultimabase/pg-vector-plugin'

const audited = defineSchemaExtension(
	'audited',
	{ stream: 'security' },
	'example.behavior',
)
const redacted = defineFieldExtension(
	'redacted',
	{ replacement: '[redacted]' },
	'example.behavior',
)
const vectorHookTarget = defineFieldKindHookTarget<VectorField>(vectorFieldKind)

const behaviorPlugin = () =>
	definePlugin({
		name: 'example.behavior',
		setup: ({ hooks }) => {
			hooks.global('audit-creates', {
				afterOperation: { create: ({ item }) => void item },
			})
			hooks.schema('normalize-posts', PostSchema, {
				beforeOperation: { create: ({ item }) => void item },
			})
			hooks.field('normalize-title', PostSchema, ['title'], {
				resolveInput: ({ value }) => value.trim(),
			})

			hooks.schemaExtension('audit', audited, ({ extension }) => ({
				beforeOperation: {
					create: () => {
						audit.route(extension.config.stream)
					},
				},
			}))
			hooks.fieldExtension('redact', redacted, ({ extension }) => ({
				resolveInput: ({ value }) => {
					redactor.use(extension.config.replacement)
					return value
				},
			}))
			hooks.fieldKind('validate-vectors', vectorHookTarget, ({ field }) => ({
				resolveInput: ({ value }) => {
					if (value.length !== field.options.dimensions) {
						throw new TypeError('Invalid vector dimensions')
					}

					return value
				},
			}))
		},
	})
```

The six scopes are `global`, `schema`, `field`, `schemaExtension`,
`fieldExtension`, and `fieldKind`. Field paths are non-empty segment tuples, so
`['profile', 'email']` infers the terminal field without parsing a dot string.
`defineFieldKindHookTarget<TField>(kind)` creates a reusable typed token for a
namespaced community field kind.

Indirect target factories run during initialization, once per deterministic
match. They can read extension configuration or matched field metadata and
close over it, but that configuration is never added to Runtime hook inputs.
Application initialization rejects foreign schemas, invalid paths, foreign
extensions, forged field-kind targets, and registration attempted after setup.

Names are local to their setup owner. Two plugins may both register `audit`,
while registering it twice from the same plugin fails. Contributions follow
plugin dependency order, configuration position, registration order, then
schema and nested-field declaration order. Resolved snapshots are immutable and
isolated per application.

Runtime composes resolved plugin declarations with developer hooks once during
application assembly. Before phases run plugins in dependency and configuration
order before the developer declaration; after phases run the developer first and
then unwind plugins in reverse order.

The completed
[native-hook plan](../../docs/plans/completed/native-hooks-and-contextual-execution.md)
gives Core's Schema domain identity-owned declaration storage and gives its
Runtime domain interpretation and execution. Native developer hooks require no
plugin. The completed
[Access plan](../../docs/plans/completed/fundamental-access-system.md) reuses the
same private declaration and application-compilation principles while keeping
Access decisions separate from business hooks.

[ADR-0096](../../docs/adr/0096-native-hook-declaration-capabilities.md)
keeps callbacks outside `SchemaDefinition`, `FieldDefinition`, field options,
validation plans, and migration metadata. Private Schema capabilities retain
immutable declarations by exact identity; Runtime reads them internally and
creates no neutral handler when a phase is absent.

Extension handlers use a scope-qualified identity so schema and field names stay
independent:

```ts
const contentMetadataPlugin = definePlugin({
	name: '@example/content-metadata',
	setup: ({ registries }) => {
		registries.extensions.register(
			extensionHandlerKey('schema', 'content-category'),
			contentCategoryHandler,
		)
		registries.extensions.register(
			extensionHandlerKey('field', 'search-metadata'),
			searchMetadataHandler,
		)
	},
})
```

Application initialization checks every schema and nested field extension after
all setup callbacks and before `connect`. The setup context supplies the handler
owner, so a plugin cannot claim another plugin's identity. Missing or wrongly
owned handlers fail with `PLUGIN_EXTENSION_HANDLER_MISSING`; duplicate handler
keys retain the shared `PLUGIN_CONFLICT` contribution policy.

## Plugin lifecycle

`PluginLifecycleManager` executes the resolved graph without merging declaration
and infrastructure work:

```ts
const lifecycle = new PluginLifecycleManager(graph, setupRegistries)

await lifecycle.setup()
// Application validation can run here before any connection is opened.
await lifecycle.start()
await lifecycle.stop()
await lifecycle.dispose()
```

Setup and forward phases use dependency order. The forward sequence is
`connect`, `prepareSchema`, `startRuntime`, then `startTransports`. Stop and
dispose use reverse dependency order. Setup, start, stop, and dispose retain one
promise while active and do not repeat completed work. A lifecycle cannot start
again after stop or disposal; calling stop before start is a no-op.

When setup or startup fails, completed plugins are stopped when active, disposed
in reverse order, and application services are released. Cleanup continues after
individual teardown failures. An `AggregateError` preserves the original failure
alongside any additional cleanup errors.
