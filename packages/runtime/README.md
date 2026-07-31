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
`exists`, `createOne`/`create`, `updateOne`, and `deleteOne`; bulk operations and
upserts remain in issue 316.

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
not pretend an adapter supports savepoints. Trusted master request construction
remains internal until issue 319 adds the audited `useMasterKey` API.

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

There is deliberately no public master-context factory yet. Issue 319 will add
trusted `RequestEngine` elevation with a mandatory reason and an audit-ready
event; raw master keys will only be verification inputs and will never be
retained by `RequestContext`.

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
