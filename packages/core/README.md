# @ultimabase/core

The complete foundational UltimaBase framework for Node.js.

Responsibilities:

- immutable schemas, built-in and plugin-defined fields, and type inference;
- immutable Query and Operation AST builders;
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

Pointers participate in Query without revealing physical foreign-key names.
Equality, membership, and existence predicates retain the exact target type;
ordered and string comparisons are rejected. `pointer.query()` builds a normal
target Query already scoped by its ID, while bounded single-target inclusion is
selection-aware:

```ts
const selected = PostSchema.query()
	.select('id', 'title')
	.include('author', (author) => author.select('id', 'name'))

// The result type contains only id, title, and the selected User shape.
```

The inclusion clause is already immutable and transport-neutral. Runtime
expansion belongs to the next pointer vertical issue; until then, executing an
included query fails explicitly rather than returning a misleading Pointer.

`onDelete` defaults to `restrict`; `cascade` and nullable-only `setNull` are
explicit alternatives. `indexed: "unique"` declares a one-to-one pointer.
Pointer lists and defaults are rejected so relationship writes stay explicit;
to-many collections belong to the later `relationField` contract. Physical
foreign keys and pointer Query execution are implemented by subsequent vertical
issues.

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
nominal `RequestContextValue<T>` identities. Role-aware configuration may
conditionally call `services.require(accessRoleResolverServiceToken)` and
capture the returned typed reference in an Access rule. Core validates that
requirement after all plugin setup callbacks and before infrastructure starts,
so provider configuration order is irrelevant. Applications with no role-aware
policy require no resolver at all.

## Terminal execution authority

Every `Query` terminal resolves authority only when it executes. Inside an
active request, transaction, or hook it inherits that exact engine. Root jobs
identify one application explicitly, while an authentication or tenant plugin
may supply an already-derived context:

```ts
const inherited = await PostSchema.query().find()
const root = await PostSchema.query().find({ ultimabase })
const authenticated = await PostSchema.query().find({
	context: contextCreatedByAuthPlugin,
	ultimabase,
})
```

Trusted backend code may request audited master authority in the same final
option position. Combining both elevates the supplied context and preserves its
typed values:

```ts
const allPosts = await PostSchema.query().find({ useMasterKey: true })
const imported = await PostSchema.query().createMany(rows, {
	context: contextCreatedByAuthPlugin,
	ultimabase,
	useMasterKey: true,
})
```

The application-owned `MasterAuthority` audits the operation before it runs;
the first configured key ID labels trusted terminal elevations. Contexts and
authority flags never enter Query or Operation ASTs, and transports must not
map client input into these server-only options.

## Automatic mutation transactions

Every root create, update, upsert, and delete terminal automatically uses the
configured database adapter's transaction lifecycle. Developer code keeps the
same concise API:

```ts
const post = await PostSchema.query().create(
	{ title: 'Atomic by default' },
	{ ultimabase },
)
```

The complete current Runtime mutation pipeline and database work started inside
it commit or roll back together. Native schema, field, and plugin hooks execute
inside this same active boundary. An explicit
`RequestEngine.transaction()` is reused without nesting, while root reads
remain non-transactional. Bulk `{ atomic: false }` stops at the first adapter
persistence failure and returns the committed-prefix candidate explicitly. The
prefix still commits only after every result and finalization hook succeeds.

```ts
const imported = await PostSchema.query().createMany(rows, {
	atomic: false,
	ultimabase,
})

if (imported.status === 'stopped') {
	console.error(imported.failedIndex, imported.error)
}
```

Database plugins prepare each transaction-bound mutation through one opaque,
single-use handle. Its execution keeps the exact public result separate from
complete logical materializations used by native field hooks. A narrow
selection therefore stays narrow without depriving hooks of the values needed
to enforce business invariants:

```ts
const updated = await PostSchema.query()
	.select('id')
	.update(
		{ set: { title: 'Visible only to the hook outcome' } },
		{ ultimabase },
	)

// The developer result remains exactly `{ readonly id: string } | null`.
```

This protocol belongs to database-adapter authors rather than application code.
The root adapter starts the transaction; its transaction adapter stabilizes the
target so the native dispatcher can run affected-field before hooks before
Runtime consumes the prepared mutation exactly once.

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
const query = PostSchema.query().select('id', 'title')

const created = await draft.create({ ultimabase })
const updated = await created.update(
	{ set: { title: 'Published' } },
	{ ultimabase },
)
await updated?.delete({ ultimabase })
```

`new PostSchema(input)` creates a typed immutable draft and never performs I/O.
Runtime queries and mutations return immutable `PostSchema` instances only after
hooks and field restrictions finish. `get(field)` and `toJSON()` expose only the
fields visible in that result, so a selected result cannot recover omitted data.
Draft `create` and `upsert` plus persisted `update` and `delete` are immutable
convenience commands over the same Query pipeline. Collection writes remain on
`PostSchema.query()`, and models deliberately expose no mutable `save()` method.

## Native Access and schema hooks

Access and hooks are complementary Core capabilities. Access declares security
boundaries through `operation`, `filter`, `item`, and `field` policies. Hooks
express business transformations and effects only after Access has restricted
the operation.

Schemas now accept native declaration-only policies, and every built-in or
plugin field accepts its own inline policy. One logical family covers singular
and bulk terminals while `kind` remains available for exact narrowing:

```ts
const PostSchema = Schema.define({
	className: 'Post',
	access: {
		operation: {
			read: { one: true, many: true, count: false, exists: true },
			delete: ({ context }) => context.access.mode === 'master',
		},
		filter: {
			read: ({ filter }) => filter.equalTo('published', true),
		},
		item: {
			update: ({ input, item }) =>
				input.authorId === undefined || input.authorId === item.authorId,
		},
	},
	fields: {
		authorId: stringField({ validation: { required: true } }),
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

An Access filter reuses the same typed field predicates as Query, but remains
in private monotonic state. `beforeFind` can add application defaults such as
ordering or limits and cannot inspect, replace, or remove Access filters. CLP,
ACL, and field-permission plugins register policy contributions to this native
system rather than business hooks.

The callback receives one immutable schema-aware builder and no terminal
`kind`, so `get`, `find`, `count`, and `exists` always observe the same protected
row universe. It may return `true`, `false`, or one predicate branch. Every
independent native or plugin contribution is later combined through `AND`:

```ts
filter: {
	read: ({ context, filter }) => {
		const principal = context.getValue(authenticatedPrincipal)

		return principal === undefined
			? filter.equalTo('published', true)
			: filter
					.equalTo('published', true)
					.or(filter.equalTo('authorId', principal.id))
	},
}
```

The builder deliberately has no selection, ordering, pagination, terminal, or
execution method. Its equality, comparison, membership, string, regex,
existence, and logical methods share Query's field capabilities and normalized
predicate nodes without exposing the developer Query or its AST.

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
	allOperations,
	allowAll,
	denyAll,
} from '@ultimabase/core'

const readOnly = {
	read: allowAll,
	...allMutations(denyAll),
}

const explicitDefaultDeny = {
	...allOperations(denyAll),
	read: { one: allowAll, many: allowAll, count: denyAll, exists: allowAll },
}
```

Each helper returns a fresh frozen record and retains a supplied callback by
identity. Ordinary object-spread order controls overrides; the helpers add no
custom merge semantics or permission-provider concepts.

### Schema hooks

Schemas can colocate typed business lifecycle declarations without installing a
plugin. One handler covers the complete compatible operation family, and the
terminal `kind` narrows its exact operation and result:

```ts
const PostSchema = Schema.define({
	className: 'Post',
	fields: {
		title: stringField({ validation: { required: true } }),
	},
	hooks: {
		resolveInput: ({ operation }) => operation,
		beforeSave: {
			all: ({ operation }) => operation,
			create: ({ operation }) => {
				// The exact family still covers createOne and createMany.
				return operation
			},
		},
		afterOperation: (input) => {
			if (input.kind === 'count') {
				// The result is narrowed to number in this branch.
				return Math.max(input.result, 0)
			}

			return input.result
		},
	},
})
```

Every phase accepts one handler or a non-empty ordered handler list. Broad
phases also accept a family map: `all` runs shared behavior while `create`,
`update`, `upsert`, `delete`, and `find` narrow callbacks to compatible
operation families. A family callback still covers singular and bulk terminals;
use `kind` when their behavior differs instead of duplicating `one` and `many`
declarations.

The constructor validates every phase, snapshots every list and family map, and
keeps them in private identity-owned storage. Hooks never appear on
`SchemaDefinition`, never affect input or object inference, and never enter
validation plans, indexes, migrations, or physical diffs.

The lifecycle nests broad phases around exact phases. Saves use
`beforeOperation → beforeSave → beforeCreate|beforeUpdate|beforeUpsert`, then
unwind through the exact after phase, `afterSave`, and `afterOperation`. Generic
`beforeOperation` and `afterOperation` hooks also cover reads. Read phases nest
as `beforeOperation → beforeFind`, then unwind through field `resolveOutput`,
`afterFind`, and `afterOperation`:

```ts
const ArticleSchema = Schema.define({
	className: 'Article',
	fields: {
		title: stringField({
			validation: { required: true },
			hooks: {
				// Output resolution sees only selected, readable values.
				resolveOutput: ({ value }) => value.trim(),
			},
		}),
		published: booleanField({ default: false }),
	},
	hooks: {
		beforeFind: ({ query }) => query.equalTo('published', true),
		afterFind: ({ result }) => result,
	},
})

const articles = await ArticleSchema.query()
	.select('id', 'title')
	.find({ ultimabase })

// The exact result is readonly { id: string; title: string }[].
```

`beforeFind` may add filters, ordering, pagination, or a limit, but it must
preserve the exact schema and selected-field union. Opaque adapter constraints
remain outside the developer Query. Runtime projects the adapter result before
field output resolution, validates every native and low-level result transform,
then applies monotonic output restrictions as the final public boundary.
`count` and `exists` retain `number` and `boolean` results and skip value
resolution. Root reads do not open an automatic transaction; reads inside an
explicit transaction reuse it.

Runtime compiles declarations once per application. Input resolution runs from
nested children to parents, transformed input is structurally revalidated
without replaying defaults or generators, and all field and schema validation
issues are reported together before policy or database work begins. Business
before hooks run inside the automatic mutation transaction, so throwing from a
hook rolls back database work performed earlier in the same request.

Transaction finalization is explicit and ordered. `beforeCommit` receives one
immutable per-schema summary before the adapter commits. Field and schema
`afterCommit` handlers run in operation order after the outer commit;
`afterRollback` runs only after a confirmed rollback. `onError` distinguishes
an operation failure, commit failure, rollback failure, and already committed
post-commit failure without exposing adapter controls. See the
[Runtime guide](docs/runtime.md#transaction-finalization-hooks) for the public
contract and example.

Every native and low-level business hook receives a safe execution `context`:

```ts
const PostSchema = Schema.define({
	className: 'Post',
	fields: { title: stringField() },
	hooks: {
		beforeCreate: async ({ context, operation }) => {
			if (operation.kind === 'create-one') {
				await AuditSchema.query().create({
					action: 'post.create',
				})
				context.emit('post.created', { title: operation.input.title })
			}

			console.log(context.requestId, context.transactionId)
			return operation
		},
	},
})
```

`requestId` correlates the originating request. `transactionId` is defined for
automatic mutations and explicit transactions and remains identical across
nested operations. `signal` carries cooperative request cancellation and native
deadlines such as `AbortSignal.timeout()`. A regular `Schema.query()` terminal
keeps exact inference and reuses the current transaction. Unawaited nested work is
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
					({ value }) => value.trim(),
					({ value }) => value.toLowerCase(),
				],
				validate: ({ value }) =>
					value.includes('@')
						? []
						: [
								{
									code: 'hook.invalid-email',
									path: [],
									message: 'Invalid email',
								},
							],
			},
		}),
	},
})
```

Inline hooks deliberately cannot access sibling fields. A rule comparing
`email` with another property belongs in `UserSchema` hooks, where the complete
operation is available. Omitted input properties do not produce fake
`undefined` executions. `onChange` instead receives explicit `present` states
for a real create, replacement, or unset. Set-based `updateMany` may transform
the supplied update value once, but it and `deleteMany` never load matching rows
to simulate per-object CRUD or change hooks.

For nested objects, siblings retain declaration order. Input resolution,
validation, and output resolution visit children before their parent; before
CRUD/save phases enter the parent before its descendants, and after phases
unwind descendants before their parent. These declarations are retained by
private field capabilities and compiled with plugin field targets. Before hooks
receive complete prepared values, after hooks and `onChange` receive complete
private materializations, and the public result still honors the developer's
`.select(...)` projection.

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
			hooks.global('measure-operations', {
				afterOperation: ({ result }) => result,
			})
			hooks.schema('normalize-posts', PostSchema, {
				beforeSave: ({ operation }) => operation,
			})
			hooks.field('normalize-title', PostSchema, ['title'], {
				resolveInput: ({ value }) => value.trim(),
			})

			hooks.schemaExtension('audit', audited, ({ extension }) => ({
				beforeOperation: ({ operation }) => {
					audit.route(extension.config.stream)
					return operation
				},
			}))
			hooks.fieldExtension('redact', redacted, ({ extension }) => ({
				beforeSave: () => {
					redactor.use(extension.config.replacement)
				},
			}))
			hooks.fieldKind('validate-vectors', vectorHookTarget, ({ field }) => ({
				validate: ({ value }) =>
					value.length === field.options.dimensions
						? []
						: [vectorDimensionIssue(field.options.dimensions)],
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
const permissionsPlugin = definePlugin({
	name: '@example/permissions',
	setup: ({ registries }) => {
		registries.extensions.register(
			extensionHandlerKey('schema', 'class-permissions'),
			classPermissionHandler,
		)
		registries.extensions.register(
			extensionHandlerKey('field', 'field-permissions'),
			fieldPermissionHandler,
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
