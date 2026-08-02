# Core Runtime domain

The single business-operation engine used by every transport.

Responsibilities:

- `FrameworkEngine` and request-bound engines;
- anonymous, user, and master contexts;
- CRUD, bulk operations, and upserts;
- deterministic operation pipeline;
- hooks and post-commit events;
- transactions;
- AsyncLocalStorage helpers;
- database adapter contracts and execution.

Runtime does not import Drizzle, PostgreSQL, Hono, GraphQL, Yoga, or concrete permission plugins.

The Core entry point exports the neutral `BoundQuery` facade.
`RequestEngine.query(schema)` creates bound instances while retaining the
exact application, request context, and pipeline that will execute future
terminal operations.

## UltimaBase facade

`UltimaBase` is the regular application boundary. Construction validates static
configuration without running plugin setup or opening infrastructure. `start()`
assembles Runtime and completes the deterministic plugin lifecycle:

```ts
const ultimabase = new UltimaBase({
	schemas: [ArticleSchema],
	plugins: [databasePlugin()],
	validation: { timezone: 'Europe/Paris' },
})

await ultimabase.start()

const articles = await ultimabase.query(ArticleSchema).limit(20).find()
```

Outside an active request scope, `query()` uses a fresh anonymous internal
request. Inside a same-application request or transaction, it reuses that exact
engine and authority. Source `internal` never grants master access. The public
return is the compact `UltimaBaseQuery<TSchema>` alias while schema, selection,
input, and result inference remain exact.

`ultimabase.application` exposes advanced Core service and plugin lookup.
`ultimabase.engine` exposes explicit anonymous, user, master, and transport
request composition after startup. `stop()` closes existing queries and cannot
be restarted; `dispose()` or `Symbol.asyncDispose` permanently releases every
owned resource.

## Low-level application assembly

`createFrameworkEngine(application)` remains the lower-level bridge from Core
plugin setup to Runtime execution. The ADR-0076 assembly resolves the application-scoped
`databaseAdapterServiceToken`, installs structural validation, composes hooks
and events, and fills every unclaimed pipeline position with an explicit neutral
stage:

```ts
const application = await createApplication({
	schemas: [ArticleSchema],
	plugins: [databasePlugin()],
})

await application.start()

const framework = createFrameworkEngine(application, {
	validation: { timezone: 'Europe/Paris' },
})
const request = framework.anonymous({
	requestId: 'article-list',
	source: requestSources.internal,
})

const articles = await request.query(ArticleSchema).limit(20).find()
```

The factory accepts an application in `ready` or `started` state and preserves
its exact schema and plugin tuples. A missing or malformed database adapter,
invalid pipeline contribution, currently conflicting access-stage owner, or unusable
application state fails during assembly, before any operation can execute.

Plugins declare supported pipeline positions through `runtimePipelineStage()`:

```ts
const tenantPlugin = (tenantId: string) =>
	definePlugin({
		name: 'example.tenant-access',
		setup: ({ registries }) => {
			registries.pipelines.register(
				'example.tenant-acl',
				runtimePipelineStage({
					stage: 'acl',
					handler: ({ accessConstraints }) => [
						...accessConstraints,
						{ kind: 'tenant', tenantId },
					],
				}),
			)
		},
	})
```

`normalization` and `commit` contributions compose in dependency-first plugin
order. The security positions `clp`, `acl`, and `fieldPermissions` each accept
one owning plugin and reject competing owners. Plugins omit handlers from their
public contribution metadata; only Runtime can resolve definitions created by
the factory. An optional `MasterAuthority` may be supplied to
`createFrameworkEngine` without changing the trusted master boundary.

These named security positions are legacy behavior documented for current
users. ADR-0090 and issue 337 replace them with schema- and field-targeted
monotonic hook contributions; new integrations must not build on the named
stage API.

## Structural validation

`createRuntimeValidationStage()` executes Schema's create and update plans in
the pipeline's mandatory `structuralValidation` position. Creates, bulk
creates, updates, and both upsert branches therefore share defaults, nested
object/list rules, scalar snapshots, and path-aware `VALIDATION_ERROR` issues:

```ts
const structuralValidation = createRuntimeValidationStage({
	timezone: 'Europe/Paris',
	clock: () => new Date(),
})
```

The clock is optional and primarily injectable for tests; production defaults
to the current time. One instant is shared by every `autoNow` and system
timestamp in an operation, including all items in a bulk mutation. Runtime
default factories execute once per created object. Auto-increment values and
adapter-specific default expressions stay database-owned. Master authority
does not bypass this phase.

The same stage generates the reserved `id` from Schema's framework-owned
`uuidVersion: 7` metadata. Production uses the maintained `uuid` package's
cryptographic UUID v7 generator. Tests can provide a deterministic fixture
without changing application code:

```ts
const structuralValidation = createRuntimeValidationStage({
	uuidV7Generator: () => '0198a43e-2431-7000-8000-000000000001',
})
```

Injected output is still validated as the system UUID field. Distinct
millisecond timestamps retain UUID v7 ordering, while values generated inside
one millisecond intentionally carry no strict ordering promise.

## Framework and request engines

`FrameworkEngine` owns one application's pipeline. It creates a new immutable
request engine for each anonymous or authenticated request. Direct construction
remains the low-level boundary for Runtime internals and focused engine tests:

```ts
const framework = new FrameworkEngine({
	application,
	pipeline,
})

const request = framework.user(userId, {
	requestId: 'request-01',
	source: requestSources.graphql,
})

const publishedArticles = request
	.query(ArticleSchema)
	.equalTo('status', 'published')
	.descending('createdAt')
	.limit(20)
	.find()
```

The schema must be the exact definition registered by this application. A
schema from another application is rejected even if it uses the same
`className`, so parallel applications cannot leak queries or request contexts.
Direct `execute(operation)` remains available as the low-level
normalized-operation API. Bound queries expose `find`, `first`, `get`, `count`,
`exists`, `createOne`/`create`, `createMany`, `updateOne`, `updateMany`,
`upsertOne`/`upsert`, `upsertMany`, `deleteOne`, and `deleteMany`.

Every root mutation automatically uses the same adapter transaction lifecycle
as `request.transaction()`. This includes singular and bulk create, update,
upsert, and delete operations, including the set-based `updateMany` and
`deleteMany` terminals. An operation already inside an explicit transaction
reuses that exact scope without attempting a nested transaction. Root reads do
not open a transaction.

The bulk `{ atomic: false }` option never bypasses this boundary. It may control
future collection grouping, but every resulting group remains transactional.
Issue 334 owns partial-success, stopping, and per-item grouping semantics;
until then, one normalized bulk operation uses one automatic transaction.

Automatic mutation transactions install their derived request engine in the
active asynchronous scope before the operation pipeline runs. Internal code and
future native hooks therefore resolve that engine through `getCurrentEngine()`.
Native hook inputs do not expose a temporary engine property: issue 340 adds the
explicit immutable `HookContext` and its transaction-bound query capability.

`request.transaction(callback)` begins a transaction through the database
adapter retained by the pipeline. The callback receives a distinct engine with
the same application, context, authentication, capabilities, and metadata:

```ts
const article = await request.transaction(async (transaction) => {
	const created = await transaction.query(ArticleSchema).create({
		title: 'Atomic article',
	})

	await transaction
		.query(StatsSchema)
		.equalTo('id', 'global')
		.updateOne({ increment: { articleCount: 1 } })

	return created
})
```

Runtime commits once after every started operation finishes. A callback or
operation failure rolls back, post-commit effects wait for the successful outer
commit, and the transaction engine becomes unusable after the callback.
`getCurrentEngine()` resolves to the transaction engine inside the callback and
restores the previous asynchronous scope afterward.
Nested transactions currently fail with `TRANSACTION_ERROR`; UltimaBase does
not pretend an adapter supports savepoints.

## Trusted master authority

Master access starts from a configured `MasterAuthority`. It hashes configured
keys immediately, requires an audit handler, and turns a matching raw key into
an opaque grant owned by that exact framework:

```ts
const masterAuthority = new MasterAuthority({
	keys: [{ id: 'maintenance-cli', value: env.MASTER_KEY }],
	onUse: (event) => audit.write(event),
})

const framework = new FrameworkEngine({
	application,
	masterAuthority,
	pipeline,
})

const grant = framework.authorizeMasterKey(receivedMasterKey)
const master = await request.useMasterKey(grant, 'Rebuild article search index')

await master.query(ArticleSchema).find()
```

The raw key is only a verification input: neither the grant, `RequestContext`,
nor the audit event retains it. A grant cannot be constructed publicly, cannot
be shared across framework instances, and must produce a successful audit event
before `useMasterKey` returns. Master retains the request ID, source, metadata,
capabilities, transaction lifetime, and application identity.

Master permission plugins bypass CLP, ACL, and field permissions through
`shouldBypassAccessBoundary` from `@ultimabase/core`. Runtime still executes
structural validation, business hooks, adapter constraints, transactions,
commit, and post-commit events. Tenant isolation is explicitly non-bypassable.

## Hooks and post-commit events

Native schema and inline field declarations require no plugin. Plugin setup uses
the same declaration contracts through an owner-bound `hooks` facade:

```ts
const auditPlugin = () =>
	definePlugin({
		name: 'example.audit',
		setup: ({ hooks }) => {
			hooks.global('measure-all', {
				afterOperation: ({ result }) => result,
			})
			hooks.schema('audit-articles', ArticleSchema, {
				beforeSave: ({ operation }) => operation,
			})
			hooks.field('normalize-title', ArticleSchema, ['title'], {
				resolveInput: ({ value }) => value.trim(),
			})
		},
	})
```

The other target methods are `schemaExtension`, `fieldExtension`, and
`fieldKind`. Extension and field-kind selectors accept initialization
factories rather than declarations directly. Core invokes a factory once for
each deterministic match after plugin setup, and the returned hook may close
over the matched configuration. That configuration never becomes a property of
the Runtime hook input:

```ts
hooks.schemaExtension('retention', retentionExtension, ({ extension }) => ({
	beforeOperation: ({ operation }) => {
		retention.observe(extension.config.policy)
		return operation
	},
}))
```

Exact field targets use typed non-empty segment tuples, including nested object
paths. Community field packages expose a reusable selector with
`defineFieldKindHookTarget<TField>(kind)`, preserving the field's exact logical
value in the factory and returned field declarations.

Every target contribution records the setup plugin automatically. Its public
name is local to that owner, so separate plugins may use the same name while a
same-owner duplicate fails. Registration closes when setup finishes, target
resolution completes before `connect`, and the immutable match snapshots remain
isolated per application. Order follows plugin dependencies, configuration
position, registration order, schema order, and deterministic field traversal;
there is no numeric priority.

Issue 328 provides this registration and initialization boundary. The Runtime
dispatcher in issue 330 appends resolved plugin declarations to developer hooks
and invokes them. No plugin can replace developer declarations. The contract is
governed by
[ADR-0089](../../../docs/adr/0089-native-schema-and-field-hooks.md),
[ADR-0097](../../../docs/adr/0097-owner-scoped-typed-plugin-hook-targets.md), and
[ADR-0090](../../../docs/adr/0090-permission-plugins-through-hooks.md).

### Legacy low-level definitions

ADR-0070's opaque before/after factories remain the existing low-level plugin
foundation while the native dispatcher is completed. Plugins register those
definitions through the generic Core setup registries. A schema is optional for
global behavior, while `operations` narrows the terminal kinds handled by a
contribution:

```ts
const articleAutomationPlugin = () =>
	definePlugin({
		name: 'example.article-automation',
		setup: ({ registries }) => {
			registries.hooks.register(
				'articles.normalize-title',
				beforeOperation({
					schema: ArticleSchema,
					operations: ['create-one'],
					handler: ({ operation }) => ({
						operation: {
							...operation,
							input: {
								...operation.input,
								title: operation.input.title.trim(),
							},
						},
					}),
				}),
			)

			registries.events.register(
				'articles.search-index',
				postCommitEvent({
					schema: ArticleSchema,
					operations: ['create-one', 'update-one'],
					handler: ({ result }) => searchIndex.upsert(result),
				}),
			)
		},
	})
```

Before-hooks return exactly `{ operation }`; after-hooks return exactly
`{ result }`. Inputs are immutable, and a before-hook must preserve both the
operation kind and exact schema identity. `createRuntimeHookStages(application)`
composes definitions in dependency-first plugin order into the fixed Runtime
pipeline positions. After-hooks still run before commit and can abort the
transaction. Post-commit events run only after a successful standalone commit;
explicit transactions buffer them until the outer commit and discard them on
rollback.

## Scoped contextual access

Explicit `RequestEngine` injection remains the primary API for transports and
services. When forwarding the same engine through several internal layers would
only add noise, a transport can open one Node.js asynchronous scope:

```ts
const publishArticle = async () => {
	const engine = getCurrentEngine()

	return engine.execute(operation)
}

await runWithRequestEngine(requestEngine, async () => {
	await publishArticle()
})
```

`getCurrentFrameworkContext()` returns an immutable, consistent view containing
`application`, `frameworkEngine`, `requestEngine`, and `request`. The focused
helpers `getCurrentApplication()`, `getCurrentApplicationEngine()`,
`getCurrentEngine()`, and `getCurrentRequest()` read those same references.
Calling any helper outside a scope throws `MISSING_EXECUTION_CONTEXT` rather
than returning `undefined` or retaining an earlier request.

Only the explicit request engine is accepted when opening a scope. The other
references are derived from it, preventing a transport from combining an
application, framework engine, and request context that do not belong together.
Nested scopes restore their parent, parallel promise chains remain isolated,
and synchronous or asynchronous callback results keep their exact type.

## Request contexts

Public code can create immutable anonymous or authenticated user contexts:

```ts
const tenantRead = new RequestCapability('tenant:read')

const context = RequestContext.user(userId, {
	requestId: 'request-01',
	source: requestSources.graphql,
	capabilities: [tenantRead],
	metadata: { traceId: 'trace-01' },
})

context.access // { mode: 'user', userId }
context.hasCapability(tenantRead) // true
```

Custom transport plugins may use their own non-empty source literal, such as
`grpc`. Options, metadata records, access state, capability collections, and
the context instance are copied or frozen at their boundary.

There is deliberately no public master-context factory. Master contexts can
only be produced by `RequestEngine.useMasterKey` after verification through the
framework-owned authority described above.

## Database adapter boundary

Database plugins implement `DatabaseAdapter`; application developers normally
receive one from a plugin such as the future `postgresPlugin`. The contract
receives only a normalized operation and portable access constraints. SQL,
Drizzle sessions, and transport state remain private to concrete plugins.

Every call keeps the operation-specific result type:

```ts
const articles = await adapter.execute({
	operation: {
		kind: 'find',
		query: new Query(articleSchema).limit(20).ast,
	},
	accessConstraints: [{ kind: 'tenant', tenantId: 'tenant-1' }],
})

// readonly Article[]
```

`beginTransaction()` returns a distinguishable
`DatabaseTransactionAdapter`. It can execute operations and then `commit()` or
`rollback()`, but cannot begin another transaction. Runtime enforces the same
no-nesting policy on `RequestEngine`.

## Deterministic operation pipeline

`RuntimePipeline` is the low-level assembly boundary used by
`FrameworkEngine`. Application developers will execute a bound query; engine
and plugin authors provide every named stage explicitly:

The example below documents the currently implemented ADR-0064 API. It is
scheduled for replacement by issue 337: policy plugins will contribute generic
monotonic hooks, and these three permission-specific properties will disappear.

```ts
const pipeline = new RuntimePipeline({
	normalization,
	structuralValidation,
	clp,
	acl,
	fieldPermissions,
	globalBeforeHooks,
	schemaBeforeHooks,
	databaseOperation: adapter,
	schemaAfterHooks,
	globalAfterHooks,
	commit,
	postCommitEvents,
})

const articles = await pipeline.execute({ context, operation })
```

The fixed order is normalization, structural validation, CLP, ACL, field
permissions, global before-hooks, schema before-hooks, database execution,
schema after-hooks, global after-hooks, commit, then post-commit events. A
disabled capability still supplies an explicit neutral stage, so assembly can
never omit a predecessor accidentally.

Stage envelopes and access-constraint collections are immutable. A
`FrameworkError` thrown by any stage crosses the pipeline unchanged, while
later stages do not run. In particular, business after-hooks may prevent a
commit and post-commit events never observe uncommitted work. Inside an explicit
transaction, the pipeline reuses every stage with the transaction adapter,
commits only after the callback succeeds, and buffers post-commit effects until
that outer commit.
