# @ultimabase/runtime

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

Runtime re-exports the neutral `BoundQuery` facade from `@ultimabase/query`.
`RequestEngine.query(schema)` creates those bound instances while retaining the
exact application, request context, and pipeline that will execute future
terminal operations.

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

## Framework and request engines

`FrameworkEngine` owns one application's pipeline. It creates a new immutable
request engine for each anonymous or authenticated request:

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

Ordered bulk create and upsert automatically use the same transaction lifecycle
as `request.transaction()` unless the developer passes `{ atomic: false }`.
They therefore commit once, roll back as a unit, and expose post-commit effects
only after the adapter confirms the commit. If already inside an explicit
transaction, they reuse it without attempting a nested transaction. Bulk
update and delete return affected-object counts and do not open an implicit
transaction because each is already one adapter operation.

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
`shouldBypassAccessBoundary` from `@ultimabase/access`. Runtime still executes
structural validation, business hooks, adapter constraints, transactions,
commit, and post-commit events. Tenant isolation is explicitly non-bypassable.

## Hooks and post-commit events

Plugins register typed hook definitions through the Core setup registries. A
schema is optional for global behavior, while `operations` narrows the terminal
kinds handled by a contribution:

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
