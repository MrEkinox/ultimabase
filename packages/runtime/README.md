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

`FrameworkEngine` owns one application's pipeline and transaction runner. It
creates a new immutable request engine for each anonymous or authenticated
request:

```ts
const framework = new FrameworkEngine({
	application,
	pipeline,
	transactionRunner,
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
```

The schema must be the exact definition registered by this application. A
schema from another application is rejected even if it uses the same
`className`, so parallel applications cannot leak queries or request contexts.
Direct `execute(operation)` is the current low-level normalized-operation API;
issues 315 and 316 add developer-facing query and mutation terminals.

`request.transaction(callback)` already preserves the exact application and
context in its callback. Runtime assembly provides the transaction runner;
issue 317 will bind a real transaction adapter and define commit, rollback, and
nested-call behavior. Trusted master request construction remains internal
until issue 319 adds the audited `useMasterKey` API.

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

// readonly Partial<Article>[]
```

`beginTransaction()` returns a distinguishable
`DatabaseTransactionAdapter`. It can execute operations and then `commit()` or
`rollback()`, but cannot silently create nested transactions.

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
commit and post-commit events never observe uncommitted work.
