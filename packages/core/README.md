# @ultimabase/core

The complete foundational UltimaBase framework for Node.js.

Responsibilities:

- immutable schemas, built-in and plugin-defined fields, and type inference;
- canonical object reads plus immutable QueryBuilder and Operation AST builders;
- plugin-owned schema and field option compilation plus policy-neutral enforcement foundations;
- anonymous and trusted master request authority with plugin-owned typed values;
- isolated `FrameworkApplication` instances;
- plugin definitions and global plugin graph;
- nested plugin normalization;
- versioned declaration and application capabilities;
- lifecycle phases;
- request engines, validation, transactions, generic Runtime behavior, and database contracts;
- the public `UltimaBase` application facade.

Core must never import a concrete database, server, transport, migration,
permission, authentication, cache, or jobs package. Those optional capabilities
remain plugins above this package.

## Internal domains

One package does not mean one monolithic source folder. The implementation keeps
explicit `schema`, `query`, and `runtime` domains alongside application
orchestration, plugins, capabilities, and errors. Internal folders are not exported
as package subpaths; every supported API comes from `@ultimabase/core`.

Detailed guides remain focused by domain:

- [Schema and fields](docs/schema.md), with practical [schema examples](examples/schema/README.md);
- [Query and Operation AST](docs/query.md);
- [request authority](docs/access.md);
- [Runtime, engines, transactions, and optional behavior](docs/runtime.md).

## Static schema compilation and relationship targets

`Schema.define()` retains a synchronous field declaration instead of resolving
fields during module evaluation. `createApplication()` first runs the pure,
synchronous `declare` callback of every plugin in dependency order, then
compiles every configured schema atomically before plugin setup or
infrastructure lifecycle work. Setup receives the resulting read-only schema
registry; plugins cannot register late schemas or field methods:

```ts
const PostSchema = Schema.define({
	className: 'Post',
	fields: (field) => ({
		title: field.string({ required: true }),
		published: field.boolean({ default: false }),
		metadata: field.object({
			fields: (field) => ({
				source: field.string(),
			}),
		}),
	}),
})

const application = await createApplication({
	schemas: [PostSchema],
	plugins: [],
})
```

Before compilation, `PostSchema.className` is available, but field-dependent
metadata and `new PostSchema(...)` fail with `SchemaCompilationError`. The
callback executes once for an accepted application compilation and its result
becomes immutable schema metadata. Applications, tests, and framework-owned
schemas use the same map-returning FieldBuilder declaration.
Every builder method delegates to the corresponding immutable field factory, so
structural validation, defaults, plugin-owned options, and adapter metadata keep one implementation.
Embedded builders deliberately omit pointers, relations, and generated database
sequences.

Exact decimal fields keep storage-relevant shape as direct metadata:
`field.decimal({ precision: 12, scale: 2 })`. Core validates those options and
enforces them at Runtime, while adapters may inspect them without depending on
application policy.

Every built-in factory immediately rejects Core-owned root options that the
selected field kind does not support. Other unknown root properties are detached and retained until application compilation:
one exact installed plugin option descriptor validates and normalizes each used
property. Duplicate descriptor names remain harmless while unused; a developer
occurrence with no owner or several possible owners fails deterministically,
while a plugin-owned occurrence resolves against its exact plugin and instance.
Plugin-defined fields retain their native structural option keys.

The first mutation pass resolves defaults and generators and produces a
structurally trusted immutable operation. Optional behavior may then normalize
that typed input, after which Core always repeats structural snapshots before
value-dependent enforcement, observers, or persistence. Reads, adapter results,
mutation materializations, includes, and final projections retain the same Core
structural boundary.

Install [`@ultimabase/validation-plugin`](../validation-plugin/README.md) to add
the direct `validation` option and synchronous Standard Schema application rules.
Core neither publishes Standard Schema types nor allocates that optional behavior.

TypeScript reports invalid option combinations on the primary option contract.
For example, empty enum domains identify `values`, required pointers using
`onDelete: "setNull"` identify `onDelete`, and temporal generation conflicts
identify the corresponding `Defaulted*FieldOptions` contract. These diagnostics
never request a synthetic positional argument. Valid zero-argument calls and
option completion retain their compact factory signatures.

Exact developer and plugin-contributed field maps also reject names reserved by system
fields, Query logical operators, or immutable model capabilities in TypeScript.
Those same canonical name declarations drive runtime checks for dynamic plugin
maps that cannot provide a sound literal-key guarantee.

Framework and plugin authors may still compose the immutable low-level field
factories internally. Application schemas use named builder methods; there is
no general application-facing `field.custom()`.

A plugin can contribute one application-local named method without Core knowing
its field kind. Its declaration records the existing field factory plus compact
type-generation references:

```ts
const vectorMethod = defineFieldBuilderMethod({
	name: 'vector',
	fieldKind: 'pg-vector.vector',
	factory: vectorField,
	typegen: {
		module: '@ultimabase/pg-vector-plugin',
		methodType: 'VectorFieldBuilderMethod',
		valueType: 'VectorValue',
	},
})

const plugin = definePlugin({
	pluginId: '@ultimabase/pg-vector-plugin',
	version: '1.0.0',
	core: '^0.0.0',
	privileges: [
		{
			name: 'schema:declare',
			reason: 'Declares the vector FieldBuilder method.',
		},
	],
	declare({ fields }) {
		fields.register(vectorMethod)
	},
	setup: () => ({ ready: true }),
})
```

Registrations are isolated per application and reject built-in overrides,
duplicates, unstable declarations, and factories returning another field kind.
`declare` receives only exact capability reads and facades authorized by active
privileges; it receives no setup services or runtime state and must return
synchronously. The generated application declaration emitted by
`@ultimabase/typegen` adds the contributed method to that application's
`FieldBuilder`; Core's base `FieldBuilder` does
not expose plugin methods globally. Calling a missing method through untyped or
stale code fails during static schema compilation before plugin setup.

A plugin that contributes a reserved field through a schema patch can declare
its generated value contract without exposing a misleading builder method:

```ts
const secretType = definePluginFieldType({
	fieldKind: 'fixture.secret',
	typegen: {
		module: '@fixture/secret-plugin',
		structuralContainsType: 'SecretContainsOperand',
		valueType: 'SecretValue',
	},
})

declare({ fields, schemas }) {
	fields.declareType(secretType)
	// The plugin may now patch its `fixture.secret` field through `schemas`.
}
```

This metadata is application-local and Typegen-only: it creates no field and no
Runtime behavior. Registering a regular `FieldBuilder` method automatically
declares the same value metadata, so builder-based plugins do not repeat it.

### Plugin-owned schema compilation

The same owner-bound `schemas` facade lets an authorized plugin add stable
`Schema.define()` classes, declare direct schema and field option contracts, and
apply callback-free immutable patches. Every persisted contribution has one
stable `contributionId`; Core injects the exact plugin ID, optional instance ID,
package version, protocol version, and normalized static options into the final
schema provenance:

```ts
const workflowOption = defineSchemaOption({
	normalize(value, path) {
		if (
			typeof value !== 'object' ||
			value === null ||
			!('enabled' in value) ||
			typeof value.enabled !== 'boolean'
		) {
			throw new TypeError(`${path}.enabled must be a boolean`)
		}

		return { enabled: value.enabled }
	},
	protocolVersion: 1,
	typegen: {
		module: '@example/workflow-plugin',
		type: 'WorkflowSchemaOption',
	},
})

const workflowPlugin = definePlugin({
	pluginId: '@example/workflow-plugin',
	version: '1.0.0',
	core: '^0.0.0',
	privileges: [
		{
			name: 'schema:declare',
			reason: 'Declares workflow options and logical schema fields.',
		},
	],
	declare({ schemas }) {
		schemas.defineOptions({
			contributionId: 'workflow-options',
			schema: { workflow: workflowOption },
		})

		const workflowSchemas = schemas.select({
			option: { name: 'workflow' },
		})

		schemas.patch({
			targets: workflowSchemas,
			operations: [
				addSchemaField({
					contributionId: 'workflow-state',
					name: 'workflowState',
					field: stringField({ required: true }),
				}),
				addSchemaIndex({
					contributionId: 'workflow-state-index',
					fields: ['workflowState', 'createdAt'],
				}),
			],
		})
	},
})
```

A selector is an inert immutable descriptor. Core evaluates every selector once
against the graph completed by earlier plugins, before applying any patch from
its current owner. A plugin therefore cannot make its own selection grow by
adding a matching field or schema first. Additions require `schema:declare`;
replacement, rename, and removal require `schema:transform` plus the exact prior
owner, contribution ID, and expected logical shape. Core schema identity and
system fields remain protected. `{ option: { name } }` checks only that the
normalized direct option occurs and therefore also supports opaque callback
values without exposing or invoking them. `{ option: { name, path?, equals } }`
keeps structural JSON equality: object key order is irrelevant, while array
order and primitive identity remain exact. Contribution IDs are local to the
full `{ pluginId, instanceId? }` identity, so two explicit instances may reuse
the same local ID.

Direct plugin options use ordinary properties rather than a separate options
bag. Core validates them without generated files. Typegen augments `SchemaOptions`
and `FieldOptions` with the public contracts for option definitions that occur
in the final application graph. Unused definitions remain absent and therefore
cannot create application-wide TypeScript conflicts. JavaScript uses the same
Runtime contract without generated files.

A factory-owned compiler marker declares `typegen: false`. Core still resolves,
normalizes, attributes, and compiles every occurrence, while Typegen deliberately
omits it from public option augmentation and autocomplete. This is for nominal
markers inserted by specialized factories, not a way to hide options developers
are expected to write directly.

An option contract may also declare a Runtime compiler backed by one exact
application-lifetime capability requirement. Static compilation only records
the final normalized option occurrences, so `application.compileSchemas()` and
Typegen never materialize infrastructure or invoke the compiler. During real
application initialization, Core materializes capabilities first, invokes each
used option compiler in plugin declaration and schema order, then starts plugin
`setup`. The compiler receives a frozen target context and its owner-bound
capability, must return `undefined`, and contributes behavior through that
capability rather than through a generic Core registry. Unused option contracts
run nothing; a compiler failure aborts initialization and disposes already
materialized capability resources.

Static compilation stages plugin schemas away from the public registry and
publishes the complete validated graph once. Registration, option, selector,
patch, or final validation failure therefore exposes no partial plugin schema
set. Every declaration failure uses `PLUGIN_DECLARATION_INVALID`, retains the
original cause and safe owner, contribution, and path diagnostics, and
permanently closes compilation, initialization, and startup for that application
instance.

`schema.definition.provenance` explains the final schema, fields, direct options,
indexes, portable constraints, and applied patches. Typegen and
later migration bridges consume this inert logical snapshot; removing a plugin
never authorizes Core to drop persisted data. Compilation registries are
application-local. Reusing one stable schema class succeeds only when its whole
final logical graph is compatible; a different installed plugin surface fails
without rebinding or cleaning the previously compiled class.

Framework tooling can call `application.compileSchemas()` to run exactly this
synchronous static phase without plugin setup or infrastructure. The method is
idempotent after success and rethrows the original failure after an unsuccessful
attempt. `@ultimabase/typegen` uses it to emit the application-owned FieldBuilder,
model, operation, relationship, Access, and hook contracts. When that generated
declaration is part of the TypeScript project, `Schema.define()` and every public
read, mutation, Access, hook, pointer, and relation surface resolve
the compact contract by literal `className`. Without that generated entry, Core
keeps only the safe `BaseItem` bootstrap contract and broad object inputs; it
does not reconstruct local field-map inference. Regeneration through
`@ultimabase/typegen` replaces those bootstrap types with the exact application
contract.

Complete schema compilers target the exported `SchemaCompilerInput` and
`SchemaCompilerOutput` protocol instead of Core's private prepared-schema
objects. The IR is immutable and callback-free. It exposes portable declarations,
owners, selectors, patches, protocol versions, and normalized static options;
schema classes, factory-created fields, option definitions, and
other Runtime-bearing values cross it only as nominal application-local artifact
references. Compiler code cannot resolve or forge those references. Core retains
their private values and validates graph completeness, stable schema identity,
provenance, portability, and application ownership before decoding any output.
Schema additions keep their exact contribution identity and static options,
while option nodes separately attribute their definition owner and current
value contributor.
Core's canonical compiler consumes this same IR, revalidates its complete
output through the public contract, and decodes trusted artifacts only through
the private compilation session. A plugin with `schema:replace` may use
`replaceSchemaCompiler(...)` to replace that whole compiler before it runs. The
ordinary capability replacement helper and `schema:transform` cannot cross this
boundary, and the schema compiler capability cannot be decorated.

`application.schemaCompilerProvenance` reports the selected capability and IR
protocol versions, exact contribution target, plugin ID and optional instance,
package version, and normalized static options. Core derives this record from
the selected capability chain; compiler output cannot claim or alter it. A
replacement receives one immutable `SchemaCompilerInput`, returns one complete
immutable `SchemaCompilerOutput`, and runs once per application compilation.
Core rejects partial or mutable output, stale artifacts, inconsistent
provenance, schema identity changes, protected `id`, `createdAt`, or `updatedAt`
changes, and invalid final relationship graphs before plugin setup.

```ts
const compiler = definePlugin({
	pluginId: 'community.schema-compiler',
	version: '1.0.0',
	core: '^0.0.0',
	privileges: [
		{
			name: 'schema:replace',
			reason: 'Selects our complete logical compiler.',
		},
	],
	capabilities: {
		replaces: [
			replaceSchemaCompiler({
				contributionId: 'compiler-v1',
				compile: (input) => compileCommunitySchemaGraph(input),
				staticOptions: { dialect: 'portable-v1' },
			}),
		],
	},
})
```

Tooling configured in the plugin graph receives the same compiled schema
registry plus an immutable application-local FieldBuilder method snapshot during
setup. This lets `typegenPlugin()` regenerate before infrastructure connects
without introducing a Core dependency on the Typegen package.

Generated pointer and relation handles correlate targets by their stable schema
name. Runtime values remain ordinary `Pointer` and `Relation` instances, and
relation mutations still verify the exact registered schema identity before
creating an operation.

### Application-owned schema, model, and operation handles

Plugin-created schemas and conditional public methods never mutate an exported
schema class or its prototype. `ultimabase.schema(nameOrClass)` resolves one
cached handle from the final application graph. Stable classes preserve their
ordinary package-owned methods, while configuration-dependent schemas remain
available by runtime name in JavaScript:

```ts
const Posts = ultimabase.schema(PostSchema)
const AuditEntries = ultimabase.schema('WorkflowAuditEntry')

Posts.schema === PostSchema
AuditEntries.schema.className === 'WorkflowAuditEntry'
```

Custom operations are immutable namespaced SemVer tokens. Their input and
result contracts validate and detach untrusted values, while target and
transaction metadata stay transport-neutral:

```ts
const publishPost = defineOperation({
	errors: ['community.workflow.publish-rejected'],
	name: 'community.workflow.publish-post',
	version: '1.0.0',
	target: 'model',
	transaction: 'required',
	input: defineOperationValue(snapshotPublishInput),
	result: defineOperationValue(snapshotPublishResult),
})
```

`operation:declare`, `model:extend`, and `query:extend` expose separate static
registrars. A model surface may target existing schemas through a frozen
selector or directly target an exact schema class owned by the same plugin.
The direct form lets one dynamic schema receive its own commands without
changing selector ordering:

```ts
declare({ models, operations, queries, schemas }) {
	schemas.add({ contributionId: 'audit-schema', schema: AuditEntry })
	operations.declare(publishPost)
	models.extend(AuditEntry, {
		contributionId: 'audit-commands',
		modelCommands: { publish: publishPost },
	})
	queries.extend(
		{ className: 'Post' },
		{ contributionId: 'post-queries', extensions: { byWorkflowState } },
	)
}
```

Schema commands remain application-owned operation handles, while models
returned through the application expose their generated commands as direct
callable methods. Query extensions are ordinary `QueryBuilder` factories.
`prepare()` validates one immutable logical envelope without I/O; `execute()`
enters the active `RequestEngine`, enforces cancellation and transaction policy,
invokes the exact owner handler, and validates the result. Handlers are separate
application capability contributions and may throw only declared `PluginError`
codes as public domain failures. Codes use either a namespaced lowercase form
such as `community.workflow.rejected` or a stable constant identifier such as
`PASSWORD_AUTH_INVALID_SESSION`:

```ts
const Post = ultimabase.schema('Post')
const post = await Post.findOne({ where: { id: postId } })
const published = await post.publish({ reason: 'reviewed' })
const query = Post.byWorkflowState('ready')
```

When a command name is only known at runtime, use
`Post.for(post).command(name).execute(input)`. The transparent model view is
cached per application, preserves the schema instance and immutable model
behavior, and never mutates the exported class or prototype.

Transport exposure is a second explicit boundary. The operation owner requests
`transport:expose`, provides a nominal wire codec through
`provideOperationTransportBinding`, and the application selects a non-empty
allowlist with `ultimabase.exposeOperations({ transport, operations })`.
Version 1 of this generic protocol binds application-targeted operations; schema
and model targets remain directly executable through their owned handles. Wire
requests supply an already validated `RequestContext` and cannot select Master,
Runtime replacement, or a raw adapter.

Protocol identities are canonical by exact name and version, so an operation
owner and transport package can contribute compatible bindings without
importing one another. A binding may attach deeply snapshotted inert JSON
metadata whose meaning belongs solely to that transport. The fixed exposure
facade lists only each selected operation's name, version, declared public
errors, owner, and metadata; executable callbacks and protected Runtime state
remain private.

Transports that must compile a public shape before the engine exists require
`applicationOperationTransportPlanningCapability` during application
materialization. Its `plan({ transport, operations })` method applies the same
exact-token, canonical-protocol, binding-owner, and `transport:expose` checks,
but returns only immutable inert descriptors. The planner is demand-installed,
Core-owned, non-replaceable, and invalid after application disposal. Actual
requests must still use the separately late-bound
`ApplicationRequestExecutor.exposeOperations()` facade; the planner cannot
decode, execute, or authorize anything.

Core cannot prove complete transport coverage from arbitrary policy callbacks.
Every exposure that has not acknowledged that uncertainty emits one structured
`UNVERIFIED_PUBLIC_TRANSPORT_PROTECTION` warning per transport protocol. Its
`policy.providerPresence` distinguishes `none` from `present`, while
`policy.coverage` remains `unverified` in both cases. Official Access, ACL, a
community engine, an unrelated policy, and a no-op policy therefore never
silence the warning merely by being installed:

```ts
const exposed = ultimabase.exposeOperations({
	acknowledgeUnverifiedProtection: true,
	operations: [publicStatus],
	transport: httpProtocol,
})
```

### Enter application requests from a transport plugin

Transport plugins require Core's `applicationRequestExecutionCapability` and
read it only from an application capability factory. Core materializes the
facade only when a plugin declares that requirement, then privately binds it
after engine construction. A factory retains its exact owner and callback
executor so later asynchronous route callbacks cannot inherit another plugin's
authority:

```ts
const requestExecution = requireCapability(
	applicationRequestExecutionCapability,
	'^1.0.0',
)

provideCapability(httpApplicationCapability, {
	contributionId: 'http-application',
	create: ({ callbacks, capabilities, owner }) => {
		const requests = capabilities.get(requestExecution)

		return {
			value: {
				handle: (requestId: string) =>
					callbacks.runPlugin(owner, () => {
						const context = requests.createAnonymousContext({
							requestId,
							source: 'community-http',
						})

						return requests.runWithContext(context, routeApplicationRequest)
					}),
			},
		}
	},
})
```

`verifyMasterKey({ context, rawKey, reason })` is the only credential exchange
on this facade. It requires the exact active plugin instance to declare
`authority:elevate`, verifies and audits against the selected application, and
returns only its derived Master context. The raw key, authority, grant, engine,
adapter, and lifecycle controls never escape. Already verified owning Master
contexts may enter `runWithContext` and explicit operation exposures; foreign,
forged, stale, or wrong-authority contexts fail before request work.

`executeRead(context, operation)` accepts only a normalized Core schema-read
AST and returns its exact logical result through the same Runtime pipeline as a
direct Query. It preserves the bound context, cancellation, policy, inclusion,
materialization, and strict-target behavior without exposing a request engine,
application, adapter, or transaction facade.

`executeMutation(context, schema, request)` accepts only the closed set of
schema create, update, delete, upsert, and homogeneous bulk commands. It
delegates to the same schema-command normalizers as direct class calls. The
facade therefore cannot execute an arbitrary AST or control transactions, while
bulk commands retain their ordered itemized all-or-nothing semantics.

Generated schema transports call
`reportPublicTransportProtection({ transport })` to share the same
`UNVERIFIED_PUBLIC_TRANSPORT_PROTECTION` diagnostic as operation exposures.
Passing `acknowledgeUnverifiedProtection: true` records the developer's explicit
acceptance without claiming that installed policy providers cover every route.
Execution is available only after the whole application has started and expires
on stop or disposal.

The acknowledgement accepts only Core's inability to verify complete coverage.
It never declares policy coverage, installs behavior, grants authority, or
relocates or exposes Core Master authority. Core intentionally defines no
self-asserted complete-coverage boolean; such a protocol requires independently
specified executable proof semantics.

Core preserves stable token input and result precision, stable schema-class
precision, and safe dynamic JavaScript access. The generated registry adds exact
autocomplete for application-specific command, query, operation, and dynamic
schema names without generating executable client state.

Pointer and relation declarations name their target schema without referencing
another module-level constant. Static compilation resolves those names after
every schema has been registered, then publishes one immutable graph owned by
the application:

```ts
const application = await createApplication({
	schemas: [UserSchema, PostSchema],
	plugins: [],
})

application.schemaTargets.values()
```

`field.pointer()` declares one object reference while preserving the exact
target class in every generated model:

```ts
const PostSchema = Schema.define({
	className: 'Post',
	fields: (field) => ({
		author: field.pointer({
			target: 'User',
			required: true,
		}),
	}),
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
of the visible target and therefore apply installed target constraints. Pointer
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
it. Installed target policies still apply and may make an inaccessible pointer `null`.

`select` is flat and schema-correlated. Any `true` flag selects only the fields
marked `true`; an object containing only `false` flags selects every other
field. `{}` keeps the complete result shape. Every returned model always
contains `id`, including nested pointer and relation results, so an explicit
selection adds it implicitly. `id: false` is rejected rather than silently
ignored. Relationship result shaping stays explicit through `include`.

Runtime evaluates installed target policies, applies target constraints, and validates
selected targets. Inclusion does not manufacture a target schema lifecycle;
reads expose no official schema Hooks lifecycle. PostgreSQL loads the
prepared tree through Drizzle relational `with`. Missing or inaccessible
pointer targets become `null`; a relation contains only its visible targets and
therefore becomes an empty array when none remain. Nested inclusions use the
same rules. When installed, official field Access receives the field's declared `Pointer`
value; only the result returned to the caller is hydrated.

When installed, official field Hooks may normalize pointer input and official
field Access owns pointer disclosure. Field definitions and transports own output representation.
`relationField` remains a handle-only
declaration and accepts no official field Hooks.

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
	fields: (field) => ({
		posts: field.relation({
			target: 'Post',
			mappedBy: 'author',
		}),
	}),
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
			orderBy: { createdAt: 'desc' },
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
every parent collection. Installed source-relation field policy runs once
before loading. Target policy and output resolution still apply through the
target read pipeline.

Persisted models expose only their declared to-many fields through an immutable
`Relation<TSource, TTarget>` handle:

```ts
const posts = user.relation('posts')
const recentPosts = await posts.findMany({
	select: { id: true, title: true },
	orderBy: { createdAt: 'desc' },
	limit: 20,
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

One-dimensional field lists expose exact element-aware filters:

```ts
const matching = await Post.findMany({
	where: {
		tags: {
			has: 'typescript',
			hasEvery: ['backend', 'typescript'],
			isEmpty: true,
		},
	},
})
```

`eq` and `ne` compare the complete list, `has` tests one element, and
`hasSome`/`hasEvery` test candidate sets. `isEmpty: true` applies only to a
non-null empty list; `isNull` and `isNotNull` retain complete-value nullability
semantics. Multidimensional data uses `jsonField()` and its structural or
JSONPath filters instead of typed list operators.

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
await post.relation('tags').connect(tagId)
await post.relation('tags').disconnect([oldTagId, archivedTagId])
await post.relation('tags').set([featuredTagId, newsTagId])
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
least one comparison is required. Runtime evaluates every installed target
policy filter into a private adapter scope that behavior cannot remove. Predicate depth is
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
	fields: (field) => ({
		member: field.pointer({
			target: 'Member',
			required: true,
		}),
		project: field.pointer({
			target: 'Project',
			required: true,
		}),
		role: field.enum({
			values: ['editor', 'viewer'] as const,
			required: true,
		}),
	}),
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
identities only and no database or transport metadata.

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
transport data can manufacture master authority. Product plugins may expose
narrower callback contexts with the same typed read boundary without exposing
`withValue()`.

Permission providers may also consume optional subject capabilities without
importing a concrete authentication or role plugin. Dynamic principals use
nominal `RequestContextValue<T>` identities. An authentication provider may
publish one exact current principal without becoming a Core dependency:

```ts
provideCapability(requestPrincipalResolverCapability, {
	contributionId: 'authenticated-principal',
	create: () => ({
		value: {
			resolveCurrent: ({ context }) => context.getValue(authenticatedPrincipal),
		},
	}),
})
```

Policy providers declare the capability as optional and call
`resolveRequestPrincipal()`. The helper rejects forged Pointers and schemas not
owned by the consuming application. An absent provider or absent request-local
identity returns `undefined`; neither creates authenticated authority.

Role-aware configuration declares an optional or required
`requestRoleResolverCapability` requirement and captures the returned typed
resolver in a policy rule. Core validates requirements before capability
materialization and plugin setup, so provider configuration order is
irrelevant. Applications with no role-aware policy require no resolver at all.

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

Only the application execution shell creates Master contexts. A
`MasterAuthority` verifies credentials and returns opaque grants, but it has no
public context-minting method. An explicit Master context is accepted only by
the exact application and authority that issued it; contexts from another
application remain invalid even when both applications share one authority
object. A plugin callback initiating a new elevation must declare the exact
critical `authority:elevate` privilege. Inheriting a Master context already
selected by trusted server code does not create another elevation or audit.

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
it commit or roll back together. Configured schema, field, and plugin behavior executes
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
from the complete logical materializations supplied to installed schema lifecycle behavior.
Every model-returning schema mutation accepts the same flat selection contract
as schema reads. `createOne()`, `createMany()`, `updateOne()`, and `updateMany()`
also accept the generated `include` contract. Each write completes first, then
Runtime projects its persisted ID inside the same transaction. Singular
commands issue one relationship read; collection commands group every persisted
ID into one read and restore declaration order independently from database
order. These internal reads do not replay root mutation policies or lifecycle
behavior, and they are omitted entirely when no relationship is requested:

```ts
const created = await PostSchema.createOne(
	{
		data: { author: { connect: authorId }, title: 'Created' },
		select: { title: true },
		include: { author: { select: { name: true } } },
	},
	{ ultimabase },
)

const updated = await PostSchema.updateOne(
	{
		id: postId,
		data: { title: 'Updated' },
		select: { title: true },
		include: { author: { select: { name: true } } },
	},
	{ ultimabase },
)

const deleted = await PostSchema.deleteOne(
	{
		id: postId,
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
		include: { author: { select: { id: true, name: true } } },
	},
	{ ultimabase },
)

// Explicitly included targets are materialized with their nested projection.
const authorName = updated?.author?.name
const publishedAuthorNames = published.map((post) => post.author?.name)
```

Singular creates and updates accept schema-aware nested pointer and relation
commands inside `data`. A pointer command is exclusive, while relation
`create`, `connect`, `update`, and `disconnect` commands may compose in that
fixed order. Field-bound identities are plain target IDs:

```ts
await PostSchema.createOne({
	data: {
		author: { connect: authorId },
		comments: {
			create: [{ body: 'First' }],
			connect: [existingCommentId],
		},
		title: 'Nested',
	},
})
```

Core separates scalar candidates from relationship commands in one immutable,
application-owned graph before effects. The default ceiling is five nested
target levels and 100 statically declared operations; applications can set
`validation.nestedWrites.maxDepth` and `maxOperations`. Bulk mutations,
upserts, and draft construction retain their existing flat inputs.

For `createOne`, `create` and `connect` now execute recursively inside the
root's automatic transaction. Core verifies every existing target before the
first business Hook or write, creates pointer targets before their source,
creates relation targets after their source, and adds an owning edge only after
both identities have been persisted. Every object still crosses its ordinary
Runtime, Validation, Access, ACL, Hooks, constraints, persistence-rewrite, and
materialization lifecycle. Any descendant, edge, projection, cancellation, or
finalization failure rolls the complete graph back. The remaining nested
update commands are compiled by the same graph contract and are implemented by
the following nested-write milestone issue.

This protocol belongs to database-adapter authors rather than application code.
The root adapter starts the transaction. For update, delete, and upsert, its
transaction adapter stabilizes the visible target before schema input
resolution and installed item policy complete. Runtime then runs optional item behavior and
consumes the prepared mutation exactly once.

Policy and value-object plugins may register `preparedOperation()` when an
accepted `updateOne()` value depends on that locked target. The handler receives
the fully typed current object and may replace only values inside the existing
normalized update shape. Runtime groups this replacement with field and schema
input resolution, then performs one final structural validation followed by
optional rejection-only mutation guards and value-dependent installed field and
item policy. A guard may receive the stable prepared target so an installed
plugin can inspect projected atomic numeric values without converting them to
`set` operations. The adapter
receives the final operation and cumulative constraints for the write.
The handler cannot change the query, target, fields, operators, schema, or
terminal kind. Public collection commands are already itemized before this
boundary, so each update entry uses the same singular lifecycle.

```ts
import { Schema, UltimaBase } from '@ultimabase/core'

const PostSchema = Schema.define({
	className: 'Post',
	fields: (field) => ({
		title: field.string({ required: true }),
		published: field.boolean({ default: false }),
	}),
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
installed behavior and field restrictions finish. `get(field)` and `toJSON()` expose only the
fields visible in that result, so a selected result cannot recover omitted data.
Draft `create` and `upsert` plus persisted `update`, `delete`, and `fetch` accept
the same exact result selections as their static read or mutation equivalents.
`fetch` and `exists` reuse the normal read pipeline, including installed policies and behavior.
`toPointer` and `equals` operate locally on protected identity, even when `id`
was not selected. All instance commands remain immutable conveniences: a
mutation starts without the receiver's read selection and returns a new model.
`get`, `fetch`, `update`, and `delete` target one exact identity and throw
`NOT_FOUND` when it no longer exists. Schema `updateOne` and `deleteOne` accept
exactly one of `id` or `where`; `id` is only a concise alias for
`where: { id: { eq: id } }`. They remain nullable conditional mutations and
skip installed item lifecycle behavior when no row matches.
Collection reads and writes live on the generated schema class. Models
deliberately expose no mutable `save()` method.

## Optional Hooks and Access engines

Core exposes product-neutral Runtime behavior and protected-policy contracts.
The official authoring vocabularies live in their vertical packages and are
enabled only by configuring their plugin definitions:

```ts
import { UltimaBase } from '@ultimabase/core'
import { accessPlugin } from '@ultimabase/access-plugin'
import { hooksPlugin } from '@ultimabase/hooks-plugin'

const ultimabase = new UltimaBase({
	plugins: [accessPlugin(), hooksPlugin()],
	schemas: [Post],
})
```

Importing either package installs nothing. Without `hooksPlugin()`, the `hooks`
schema and field options are unknown. Without `accessPlugin()`, the `access`
options are unknown and direct CRUD has no Access policy stage. Core still
applies structural validation, transactions, protected constraints, anonymous
or audited-master authority, and every behavior contributed by other plugins.

JavaScript applications use the same compiled graph without Typegen:

```js
import { Schema, UltimaBase } from '@ultimabase/core'

const Note = Schema.define({
	className: 'Note',
	fields: (field) => ({ body: field.string() }),
})

const ultimabase = new UltimaBase({ schemas: [Note], plugins: [] })
await ultimabase.start()
await Note.findMany(undefined, { ultimabase })
```

See the [`hooks-plugin`](../hooks-plugin/README.md) and
[`access-plugin`](../access-plugin/README.md) READMEs for their declarations,
provider contracts, diagnostics, and exact Runtime semantics. Community
alternatives may define different vocabularies through Core's generic public
kernel; they do not inherit an official engine or a neutral no-op stage.

An authorized behavior provider may use `guardMutationInput` for a final
mutation-only rejection boundary. The handler receives the structurally
validated immutable operation plus stable prepared targets, returns no
replacement value, and runs before value-dependent enforcement reevaluation.
Providers compose in plugin graph order. Applications with no such provider
materialize no guard callback.

This absence claim is measurable rather than a promise of literal zero CPU
time: a no-product application materializes no optional behavior or enforcement
bundle and invokes no such stage per request. Canonical Runtime assembly,
validation, database execution, transactions, result materialization, and
unrelated installed capabilities still perform their normal work. The
repository protects this boundary with the deterministic
`yarn test:performance` budget.

## Policy-neutral enforcement primitives

Core exposes policy-neutral enforcement factories without adding product names to Runtime.
Definitions are materialized through the exact privilege-scoped
`provideRuntimeConstraint()` capability facade:

```ts
const tenantPlugin = (tenantId: string) =>
	definePlugin({
		pluginId: 'example.tenant',
		version: '1.0.0',
		core: '^0.0.0',
		privileges: [
			{
				name: 'runtime:constrain',
				reason: 'Applies tenant row and field restrictions.',
			},
		],
		capabilities: {
			provides: [
				provideRuntimeConstraint({
					contributionId: 'tenant-row-filter',
					create: () => ({
						value: constraint({
							schema: PostSchema,
							handler: () =>
								databaseConstraint('example.tenant', 1, { tenantId }),
						}),
					}),
				}),
				provideRuntimeConstraint({
					contributionId: 'tenant-visible-fields',
					create: () => ({
						value: restrictSelection({
							schema: PostSchema,
							handler: () => ['id', 'title'],
						}),
					}),
				}),
			],
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
The official Access policy and ACL authorization use bypass unconditionally;
their separate integrity-maintenance contributions remain enforceable for
master.

The official Access plugin compiles its package-owned declarations into
`protectedPolicy()` contributions supplied through this same
`provideRuntimeConstraint()` boundary. ACL uses the generic boundary directly
and does not depend on Access. Advanced framework plugins may use either the
focused factories above or `protectedPolicy()` when they own a policy-neutral
capability outside the official Access vocabulary.

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

Every application owns its schema registry, materialized capabilities, exact
Core contribution stores, plugin exports, and lifecycle state. No singleton or
global mutable registry is created. `application.getPlugin('fixture.database')` resolves the setup export
using the configured literal plugin ID; nested plugin definitions participate
in the same typed lookup. Repeated configurations use the structured
`{ pluginId, instanceId }` overload instead.

Plugins consume only capability requirements declared in their own manifest.
Application code reaches deliberately public application-local behavior through
typed plugin exports returned by `application.getPlugin(...)`; there is no
general service lookup or capability-enumeration escape hatch.

Runtime also uses `application.ownsSchema(schema)` to verify exact object
identity. A separately declared schema with the same `className` is not owned by
the application, which prevents request engines from crossing application
boundaries accidentally.

`new FrameworkApplication(options)` remains available for advanced composition.
It validates static schema and graph configuration synchronously but leaves setup
lazy until `initialize()` or `start()` is called. A stopped application cannot be
restarted; disposal permanently releases its plugin and capability resources.

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
Transports map that payload to their protocol-specific error formats without
adding transport metadata to Core.

## Cross-plugin integration

Versioned capabilities are the only public cross-plugin integration host.
Declaration capabilities expose immutable facts before compilation; application
capabilities materialize one application-local `{ value, dispose? }` resource
before setup. Consumers can read only the exact required or optional capability
objects listed in their manifest. Cardinality and explicit replacement or
decoration rules reject ambiguous providers instead of using string names or
last-writer-wins behavior.

Legacy service tokens and string slots have no compatibility bridge. A former
exclusive service maps to a `single` application capability, while behavior
intended for application developers is exposed through the owning plugin's
typed setup export.

### Adapter bridge capabilities

Portable plugins negotiate adapter behavior through five independent Core
tokens: `adapterValueStorageCapability`, `adapterConstraintCapability`,
`adapterPersistencePlanCapability`, `adapterPhysicalSchemaCapability`, and
`adapterMigrationCapability`. Requiring one of these capabilities needs
`adapter:consume` and fails during application assembly when no compatible
provider exists. A provider must use `provideAdapterCapability()` so a generic
capability declaration cannot present itself as adapter support.

Database-specific packages define their own physical-schema and migration
contribution tokens with `defineAdapterContributionCapability()`. Core replaces
each provider value with an attributed snapshot before composition. The
snapshot contains the real plugin and instance IDs, package and protocol
versions, stable contribution ID, adapter family, and normalized static
options; a provider cannot claim another owner. Physical contributions require
`adapter:consume`, while upgrade intent independently requires
`migration:contribute`.

`planAdapterMigrations(previous, current, intents)` separates new, unchanged,
explicitly upgraded, and orphaned physical contributions. A changed prior
contribution without a matching versioned intent fails instead of inferring a
rename, drop, or other destructive operation. Removed metadata remains an
orphan for a database migration plugin to review.

Raw integration is deliberately adapter-specific. The adapter package exports
a nominal token created with `defineAdapterRawCapability()`, and the consumer
must require that exact token plus `adapter:raw`. Setup and operation handlers
receive only the Core-owned lease callback:

```ts
const databaseRaw = requireCapability(databaseRawCapability, '^1.0.0')

setup: ({ adapters }) =>
	adapters.withRaw(databaseRaw, async (database) => {
		return database.inspectDialect()
	})
```

The facade is revoked when the callback settles. Runtime raw access additionally
requires an active transaction and receives no request authority, Master grant,
protected-constraint controls, or generic SQL contract from Core.

### Owner-private plugin storage

Plugins that persist verifier-like records without creating application models
request the critical `storage:private` privilege and declare nominal,
callback-free collections during static compilation:

```ts
const sessions = definePrivateCollection({
	contributionId: 'sessions',
	fields: {
		secret: stringField({ immutable: true, required: true }),
		version: stringField({ required: true }),
	},
	indexes: [{ fields: ['secret'] }] as const,
})

definePlugin({
	pluginId: 'example.sessions',
	version: '1.0.0',
	core: '^1.0.0',
	privileges: [
		{ name: 'storage:private', reason: 'Stores revocable session verifiers.' },
	] as const,
	declare: ({ privateStorage }) => {
		privateStorage.register(sessions)
	},
})
```

Inside an attributed callback owned by that exact plugin instance,
`privateStore(sessions)` exposes only `findUnique`, `insert`, `update`, `delete`,
and `compareAndSwap`. Reads reuse the current request; writes reuse its active
transaction or open one automatic transaction. A retained handle is bound to
the application and owner that created it and is rechecked on every operation.

Private collections compile through the selected database adapter but never
enter the application schema registry, Query/model handles, Typegen schema
declarations, transports, Hooks, Access, validators, policies, observers, or
events. References may target an exact public schema with `fail` or `cascade`
deletion behavior without making the private row traversable. Applications with
no declaration perform no private adapter configuration.

## Plugin definitions

`definePlugin(options)` creates immutable metadata without executing setup or
lifecycle work:

```ts
const dialectCapability = defineCapability<{
	readonly dialect: 'postgres'
}>()({
	capabilityId: 'fixture.database-dialect',
	version: '1.0.0',
	cardinality: 'single',
	lifetime: 'declaration',
	compose: ([provider]) => provider,
})

export const databasePlugin = () =>
	definePlugin({
		pluginId: 'fixture.database',
		version: '1.0.0',
		core: '^0.0.0',
		privileges: [
			{
				name: 'adapter:consume',
				reason: 'Uses the configured database adapter.',
			},
		],
		environment: ['environment:network'],
		dependencies: [{ pluginId: 'fixture.config', version: '^1.0.0' }],
		capabilities: {
			provides: [
				provideCapability(dialectCapability, {
					contributionId: 'postgres',
					value: { dialect: 'postgres' },
				}),
			],
		},
		setup: () => ({ dialect: 'postgres' as const }),
	})
```

The manifest snapshots a namespaced stable `pluginId`, an optional explicit
`instanceId`, the plugin's canonical semantic version, its supported Core
range, exact requested privileges with reasons, and direct Node.js environment
claims. Enforceable privileges and informational environment claims are
separate contracts. The closed privilege vocabulary has documented Core facade
ownership and severity; wildcard requests are invalid. Direct filesystem and
network behavior is reported only through `environment:filesystem` and
`environment:network`: Core has no enforceable host-I/O facade or corresponding
privilege. Typegen contributions retain reference, structured contribution, and
inert output privileges, but there is no Typegen replacement privilege without
a replaceable Core-owned engine.

Manifest literals and setup exports retain their exact types for plugin lookup.
Setup, declaration, and lifecycle callbacks remain private to Core and do not
run during manifest inspection. Required dependencies, optional dependencies,
conflicts, hooks, and nested definitions are copied and frozen. Nested plugins remain
global graph entries with their own manifest and privileges; their placement
under `plugins` is composition syntax and grants no inherited power.

Named dependencies use `{ pluginId, version, instanceId? }`. Their SemVer range
is checked against the installed plugin version, and `instanceId` targets one
exact configuration when the same plugin is installed more than once. Prefer a
capability requirement when several packages can provide the same behavior:

```ts
const auditRequirement = optionalCapability(auditSinkCapability, '^1.0.0')

const consumer = definePlugin({
	pluginId: 'fixture.audit-consumer',
	version: '1.0.0',
	core: '^0.0.0',
	capabilities: { optional: [auditRequirement] },
	privileges: [
		{
			name: 'event:publish',
			reason: 'Publishes audit records when a sink is installed.',
			when: auditRequirement,
		},
	],
})
```

`defineCapability<Provider, Consumer>()` creates a nominal token with its own
protocol version, `single`, `multiple`, or `pipeline` cardinality, and
`declaration` or `application` lifetime. Its required `compose` function turns
the final ordered provider tuple or list into the exact consumer view while
remaining outside serializable inspection metadata. Declaration providers copy
and deeply freeze a portable JSON `value`. Application providers instead expose
an inert `create` factory that runs once per application before plugin setup and
returns `{ value, dispose? }`.

Every provider has one stable owner-local `contributionId`. A privileged
`replaceCapability` targets one exact structured owner and contribution while
preserving the original position; replacement chains remain inspectable through
`PluginGraph.capabilities`. `decorateCapability` wraps the complete consumer
view for `single` and `pipeline` tokens, with the earliest dependency outermost.
`multiple` providers remain independent and cannot be decorated.

Plugins read only the exact `requireCapability(...)` or
`optionalCapability(...)` objects listed in their manifest:

```ts
const auditRequirement = requireCapability(auditCapability, '^1.0.0')

definePlugin({
	pluginId: 'fixture.audit-consumer',
	version: '1.0.0',
	core: '^0.0.0',
	capabilities: { requires: [auditRequirement] },
	setup: ({ capabilities }) => {
		const audit = capabilities.get(auditRequirement)
		return { audit }
	},
})
```

Structurally recreated or undeclared requirements fail without probing the
installed graph. The default `materialization` phase establishes provider-first
factory and lifecycle order. Peer plugins that only need each other's values in
`setup` may opt out of that graph edge explicitly:

```ts
const peerRequirement = optionalCapability(peerCapability, '^1.0.0', {
	phase: 'setup',
})
```

Core still validates the provider and version before materializing all
application capabilities, but setup-phase requirements cannot be read by an
application capability factory and do not establish `connect`, `stop`, or
`dispose` order. Application resources are isolated per application and
disposed after their owner's plugin `dispose` hook. A conditional privilege
must reference the same optional requirement object listed by its manifest.
Every application capability factory also receives its Core-bound `owner` and
an `assertPrivilege(...)` function for exact effect-time checks; neither value
can grant a privilege missing from the plugin's active manifest.

Factories also receive `callbacks`, an application-bound execution-attribution
helper for vertical engines that host callbacks from several owners. Use
`callbacks.runApplication(callback)` for an inline application declaration and
`callbacks.runPlugin(owner, callback)` for a capability contribution retaining
its exact plugin and optional instance identity. The helper preserves exact
sync or async result types, validates plugin ownership against the application,
and exposes no application, authority, credential, or Runtime service. Nested
attribution replaces the outer engine owner; it never lends the host plugin's
privileges to a contributor.

When a plugin only requires another plugin's compatible public protocol, use a
non-ordering peer instead of a dependency:

```ts
definePlugin({
	pluginId: 'community.workflow-addon',
	version: '1.0.0',
	core: '^1.0.0',
	peers: [{ pluginId: 'community.workflow-engine', version: '^2.0.0' }],
})
```

Peers are required, versioned, and instance-aware, but add no graph or
lifecycle edge. They do not grant setup exports or capability reads. Use
`dependencies` or `optionalDependencies` whenever provider-first order is part
of the contract.

`pluginPrivileges` evaluates cumulative denials before field declarations,
schema compilation, Typegen, setup, or infrastructure work. Core-controlled
privileges and informational environment claims stay visibly separate:

```ts
const ultimabase = new UltimaBase({
	schemas: [PostSchema],
	plugins: [workflowPlugin({ instanceId: 'editorial' })],
	pluginPrivileges: {
		deny: ['runtime:replace'],
		denyClaims: ['environment:native-code'],
		plugins: {
			'community.workflow': {
				deny: ['adapter:raw'],
				instances: {
					editorial: {
						deny: ['transport:expose'],
					},
				},
			},
		},
	},
})
```

`deny` prevents an active request for an enforceable Core facade.
`denyClaims` rejects a plugin that announces direct filesystem, network,
process, or native-code behavior; it never claims to sandbox trusted in-process
JavaScript. Unknown privileges, claims, plugin IDs, and instance IDs are
configuration errors. Denied active requests and claims produce one aggregate
`PLUGIN_PRIVILEGE_DENIED` error, while a denied capability-conditioned request
remains inspectable and harmless when its optional capability is absent.
Every denial identifies the exact plugin and optional instance, reason, review
severity, and whether policy blocked execution before static declaration or a
later Core facade rejected the effect.

The default logger emits one ordered report through `console.info`, or through
`console.error` when active requests are denied. Set
`pluginPrivileges.logger: false` to silence it, or provide `{ info, error }` to
route the same immutable report elsewhere. Logger failures are isolated from
policy results. `application.pluginPrivilegeReport` exposes the detached report
without plugin options, credentials, capability values, or stack traces.

`normalizePlugins(definitions)` resolves that syntax into immutable flat
metadata without running plugin code. Children receive implicit parent
dependencies, source order is retained, and the exact same definition can be
reused safely. Repeated configurations of one stable ID require distinct,
explicit instance IDs. A duplicate structured identity fails with
`PLUGIN_CONFLICT`; exclusive provider selection belongs to `single`
capabilities.

`new PluginGraph(normalizedPlugins)` validates required and optional
dependencies, capability availability and nominal identity, semantic versions,
explicit conflicts, duplicate entries, and cycles. It exposes
the deterministic dependency-first order through `graph.plugins` and iteration:

```ts
const graph = new PluginGraph(normalizePlugins(configuredPlugins))

for (const plugin of graph) {
	console.log(plugin.definition.manifest.identity)
}

for (const capability of graph.capabilities) {
	console.log(capability.token.capabilityId, capability.providers.length)
}
```

Configuration position breaks ties between plugins that are ready together.
Missing optional dependencies and capabilities remain inspectably inactive.
Graph construction remains static, exposes no declaration capability values,
and never executes setup or lifecycle hooks.

## Setup facades and migration map

Plugin setup retains only infrastructure-specific compatibility facades still
owned by Core. Each accepts only its nominal definition or
requirement type, records the exact plugin and instance owner, checks its
dedicated privilege, and closes when setup finishes. Their backing stores are
private to Core; applications cannot enumerate or mutate them.

Milestone 14 maps the removed generic paths as follows:

- exclusive string slots become canonical `single` capabilities;
- public service tokens become application capabilities;
- optional Hooks and Access use application capabilities owned by their packages;
- low-level behavior, policy enforcement, post-commit events, and fixed
  pipeline stages use `provideRuntimeBehavior()`,
  `provideRuntimeConstraint()`, and `provideRuntimeObserver()` respectively;
- Runtime execution is a replaceable `single` application capability behind
  Core-owned application, authority, cancellation, and transaction boundaries;
- physical persistence rewrites use the ordered
  `persistencePlanRewriterCapability` and exact
  `providePersistencePlanRewriter()` facade under `persistence:rewrite`;
- database constraint compilers retain their exact adapter-authorized facade;
- cross-plugin commands become domain capabilities, such as
  `requestSubjectReferenceCleanupCapability`;
- legacy ownership claims disappear because compiled schemas already retain owner
  provenance; and
- unused operator, generator, and transport registry categories are removed
  without replacement.

Persistence plan protocol version 1 keeps logical operations immutable while
allowing only `delete-one` to `update-one` and `delete-many` to `update-many`
physical rewrites. A rewriter receives the logical operation and an immutable
target, data, returning, and provenance plan, but never receives protected row
filters or adapter constraints. Core keeps those restrictions in the adapter
request envelope and applies them to the final physical statement. Adapters
must advertise `databasePersistencePlanCapability`; missing versions or plan
kinds fail before an adapter effect. Rewrites use neither nested Runtime
operations nor master authority.

Independent subject consumers provide deletion participation without importing
the provider that resolves that subject:

```ts
provideCapability(requestSubjectReferenceCleanupCapability, {
	contributionId: 'documents.subject-references',
	create: () => ({
		value: {
			name: 'documents.subject-references',
			cleanup: defineRequestSubjectReferenceCleanup({
				kind: 'role',
				hasReferences: ({ reference }) => referenceStore.has(reference.value),
				cleanup: ({ reference }) => referenceStore.remove(reference.value),
			}),
		},
	}),
})
```

Both callbacks execute only when the subject provider explicitly discovers the
contribution. Their database work inherits the active request transaction;
Core does not name a concrete reference store or policy product.

Principal owners can encode an exact Pointer without sharing their schema with
the cleanup provider:

```ts
const reference = createAccessPrincipalReference(User.pointer(userId))
const identity = parseAccessPrincipalReference(reference)
```

The versioned neutral value preserves only `className` and `id`. Parsing
validates that boundary without resolving a User schema or importing an
authentication package.

Plugin schema patches may contribute fields without teaching Core about the
plugin domain. Contributed fields join ordinary validation, inference,
installed behavior, policies, and adapter metadata. Core rejects collisions
with developer, system, model, or other contributed fields. A plugin field may
explicitly defer its required create value until `resolveInput`; the normal
revalidation boundary still requires that value before installed policies and
persistence.

Portable plugin scalars may additionally declare a private, versioned JSON
storage codec through `definePluginField()`. Core validates and snapshots both
codec directions without placing executable functions in field metadata.
Database adapters may consume `getPluginFieldStorageCodec()` generically, while
plugin kinds without a portable codec still require a specialized adapter
integration. A non-list field with that codec also receives complete-value
`eq`, `ne`, `in`, and `notIn` filters. Operands pass through the same logical
snapshot guard; the codec does not imply ordering, string, structural, or
custom domain operators.

Plugin fields may independently attach private JSON wire codecs to exact
nominal protocol objects. `definePluginFieldWireProtocol({ name, version })`
returns the process-canonical identity for one namespaced protocol and exact
semantic version, allowing a field owner and transport to agree without
importing each other. `getPluginFieldWireCodec(field, protocol)` resolves only
that identity-matching codec. Core reapplies the logical scalar snapshot in
both directions and validates encoded JSON without placing callbacks in field
metadata. Storage and wire codecs are never interchangeable by default.

A scalar plugin field may separately opt into `structuralContains` when it has
that JSON codec. Its pure `snapshotOperand` validates the plugin-owned partial
input; Core then independently validates, detaches, and freezes the returned
JSON fragment. Query and protected `rowFilter` authoring reuse the ordinary
`contains` leaf. Typegen reads the owner-scoped `structuralContainsType`, while
inert schema and generated artifacts retain no callback. Adapters must announce
the exact `databasePluginFieldStructuralContainsCapability` marker before Core
sends such a leaf. Lists remain unsupported, and the opt-in does not grant
`containedBy` or other operators. See the
[`community field example`](examples/schema/plugin-field-containment.md).

## Plugin-owned declaration targets

Core provides provenance-checked generic schema, nested-field, and
field-kind target resolution. Concrete products own the factories and
declarations they place on those targets. The official Hooks and Access
packages therefore expose their own typed target helpers without a Core setup
registry, hidden dispatcher, or private bridge.

Application compilation expands owner-scoped selectors deterministically and
rejects foreign schemas, invalid paths, forged field-kind
targets, duplicate contribution identities, and orphaned owners before
infrastructure starts. Removing a concrete plugin removes both its option
namespace and its target vocabulary from the compiled application graph.

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
