# Core Runtime domain

The single business-operation engine used by every transport.

Responsibilities:

- `FrameworkEngine` and request-bound engines;
- anonymous and master authority with plugin-owned typed context values;
- CRUD, bulk operations, and upserts;
- deterministic operation pipeline;
- optional plugin behavior and post-commit observers;
- transactions;
- AsyncLocalStorage helpers;
- database adapter contracts and execution.

Runtime does not import database engines, servers, transport products, or concrete permission plugins.

Generated schema classes expose canonical object-input reads. Their commands
resolve the exact active request context at call time through a neutral bridge.
The optional immutable `QueryBuilder` only builds reusable inputs and never
retains an application, request, transaction, authority, or adapter.

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

const articles = await ArticleSchema.findMany({ limit: 20 }, { ultimabase })
```

Outside an active request scope, `{ ultimabase }` creates a fresh anonymous
internal request. Inside a request or transaction, terminals omit that option
and reuse the exact engine and authority. Source `internal` never grants master
access. A terminal may also receive one already-derived `context`, or trusted
backend code may request audited `{ useMasterKey: true }`. These server-only
options never enter the Query or Operation AST. Schema, selection, input, and
result inference remain exact.

`ultimabase.application` exposes typed plugin setup exports.
`ultimabase.engine` exposes explicit anonymous, plugin-derived, master, and
transport request composition after startup. `stop()` rejects new execution,
drains admitted work, and cannot be restarted; `dispose()` or
`Symbol.asyncDispose` permanently releases every owned resource. Initialization claims the sole resource-owning application slot
in its JavaScript realm, including through `createApplication()`. Inert
construction and pure compilation may coexist. Stop retains that slot; disposal
closes new execution, waits for admitted requests and transactions, and releases
it after successful cleanup. Failed cleanup keeps the realm closed to a
replacement. Call teardown outside an active request callback.

For scripts, tests, and other scopes that construct and finish one application
locally, `await using` invokes the existing `Symbol.asyncDispose` boundary even
when the scope throws:

```ts
await using ultimabase = new UltimaBase({
	schemas: [ArticleSchema],
	plugins: [databasePlugin()],
})

await ultimabase.start()
```

The application is disposed when the enclosing async scope exits. Long-lived
servers and exported application singletons should retain explicit graceful
shutdown handling because their lifetime is not one lexical block.

Independent Jest or Vitest workers can each run one application. Within a suite,
return `app.start()` from `beforeAll` and `app.dispose()` from `afterAll`; finish
disposal before starting another application in the same realm.

## Low-level application assembly

`createFrameworkEngine(application)` remains the lower-level bridge from Core
plugin setup to Runtime execution. The ADR-0076 assembly resolves the application-scoped
`databaseAdapterCapability`, installs structural validation, composes optional
behavior and observers, and compiles monotonic enforcement only when a plugin
contributed it:

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

const articles = await runWithRequestEngine(request, () =>
	ArticleSchema.findMany({ limit: 20 }),
)
```

The factory accepts an application in `ready` or `started` state and preserves
its exact schema and plugin tuples. A missing or malformed database adapter,
invalid pipeline contribution, or unusable application state fails
during assembly, before any operation can execute.

Core owns normalization and transaction commit. Plugins contribute logical
`beforeOperation`, `afterOperation` and `preparedOperation` definitions through
`provideRuntimeInterceptor()`; the former `runtimePipelineStage()` factory and
its types are removed by ADR-0264. Hook `beforeCommit`/`afterCommit` and
post-commit delivery retain their existing boundaries. Policies provide
protected definitions through the exact `provideRuntimeConstraint()` facade:

```ts
const tenantPlugin = (tenantId: string) =>
	plugin({
		id: 'example.tenant-access',
		version: '1.0.0',
		core: '^0.0.0',
		permissions: [
			{
				name: 'runtime:constrain',
				reason: 'Applies tenant row and selection restrictions.',
			},
		],
		contributions: [
			provideRuntimeConstraint({
				contributionId: 'example.tenant-constraint',
				create: () => ({
					value: constraint({
						schema: ArticleSchema,
						operations: ['find-many', 'find-one', 'get'],
						handler: () =>
							databaseConstraint('example.tenant', 1, { tenantId }),
					}),
				}),
			}),
			provideRuntimeConstraint({
				contributionId: 'example.tenant-selection',
				create: () => ({
					value: restrictSelection({
						schema: ArticleSchema,
						handler: () => ['id', 'title'],
					}),
				}),
			}),
		],
	})
```

Runtime uses versioned application capabilities. Product behavior and logical
interceptors form ordered pipelines, constraints remain independent monotonic
providers, and Core assembles its canonical executor directly.
`provideRuntimeBehavior()` and `provideRuntimeInterceptor()` require
`runtime:intercept`; `provideRuntimeConstraint()` requires `runtime:constrain`.
Generic providers cannot bypass those exact facades or inspect the composed
protected state. ADR-0259 removed compiler/Runtime replacement, generic
capability replacement/decoration, and the generic Core observer protocol.
Product-owned Hooks/Access events and diagnostics retain `runtime:observe`.
Core retains application ownership, request cancellation, trusted master
construction, and the automatic transaction boundary. Runtime contributions
are materialized before setup; there is no `runtime`, `events`, or `pipeline`
setup registry.

`normalization` and `commit` contributions compose in dependency-first plugin
order. Enforcement factories are `guard`, `constraint`, `restrictInput`,
`restrictSelection`, and `restrictOutput`. Their handlers never receive another
plugin's accumulated state. Runtime appends constraints for adapter-side
logical `AND`, intersects field restrictions, and creates no provider-specific
enforcement stage when no constraint capability is present. An optional `MasterAuthority` may be
supplied to `createFrameworkEngine` without changing the trusted master
boundary.

Low-level enforcement is applied to master by default. A provider may declare
`master: "bypass"` on one definition when its audited master contract requires
Runtime to skip that contribution before invocation, including trusted nested
provider queries that would otherwise re-enter the same policy hook.

## Policy-neutral monotonic enforcement

These factories are the low-level security foundation. The optional official
Access plugin compiles its package-owned schema and field declarations into the
same monotonic machinery. ACL and community policy providers may contribute
Core protected policies directly and do not depend on Access.

Policy plugins register the same five public factories as any community tenant,
ownership, moderation, or soft-delete capability. A definition may omit
`schema` and `operations` to match every terminal, or retain an exact schema and
terminal union for concise callback inference. In this example,
`authenticatedPrincipal` is the nominal value token exported by the installed
authentication plugin:

When Access is installed, its schema `item` policy materializes the object
before invoking developer or provider rules. Create branches receive an
immutable `SchemaPreparedDraft`; update and delete branches receive a persisted
`SchemaResult`. Upsert follows the same distinction after its create or update
mode is known.

```ts
capabilities: [
	provideRuntimeConstraint({
		contributionId: 'articles.guard-create',
		create: () => ({
			value: guard({
				schema: ArticleSchema,
				operations: ['create-one', 'create-many'],
				handler: ({ context }) => {
					if (context.getValue(authenticatedPrincipal) === undefined) {
						throw new FrameworkError(
							'PERMISSION_DENIED',
							'Authentication required',
						)
					}
				},
			}),
		}),
	}),
	provideRuntimeConstraint({
		contributionId: 'articles.visible-fields',
		create: () => ({
			value: restrictSelection({
				schema: ArticleSchema,
				handler: () => ['id', 'title', 'published'],
			}),
		}),
	}),
	provideRuntimeConstraint({
		contributionId: 'articles.safe-output',
		create: () => ({
			value: restrictOutput({
				schema: ArticleSchema,
				handler: () => ['id', 'title'],
			}),
		}),
	}),
]
```

`guard` allows by returning nothing and denies by throwing; it has no
grant-shaped return. `constraint` returns one protected
`databaseConstraint('namespace.kind', version, payload)` node or an array of
nodes. The positive integer version selects the exact adapter compiler payload
contract; an empty array lets that policy deliberately contribute nothing. `restrictInput`,
`restrictSelection`, and `restrictOutput` return allowed top-level schema field
names, and Runtime intersects every matching list instead of letting a later
plugin replace an earlier decision. Restricted mutation input is rejected;
selection and output restrictions project excluded fields away.

Constraint kinds use lowercase dot-separated namespace segments such as
`tenant.rows`. Payloads contain portable scalar, array, and plain-object values;
the factory detaches and deeply freezes them so a retained caller reference
cannot alter the accumulated plan.

Runtime evaluates guards, constraints, input restrictions, and selection
restrictions before effectful plugin behavior and retains the result in private
immutable state. After operation transforms, it reevaluates those contributions
into the same monotonic state before reapplying input and selection limits. An
earlier constraint is never replaced; a transformed value therefore cannot use
a stale guard decision. Output restriction handlers run once against the fully
transformed result immediately before the final projection. Handlers never
receive accumulated state or another plugin's opaque constraint payload. A
master request remains trusted authority, but only the contributing policy
decides whether its own handler treats that authority differently.

## Read pipeline and result shaping

Every read transport shares the same Core Runtime path. Core reads do not
manufacture schema lifecycle callbacks. Developer filters, ordering,
pagination, selection, and includes belong to query options; mandatory row
restrictions come from installed protected-policy providers:

```ts
const ArticleSchema = Schema.define({
	className: 'Article',
	fields: (field) => ({
		title: field.string({ required: true }),
		published: field.boolean({ default: false }),
	}),
})

const articles = await runWithRequestEngine(request, () =>
	ArticleSchema.findMany({
		orderBy: { createdAt: 'desc' },
		select: { id: true, title: true },
	}),
)

// The exact result is readonly { id: string; title: string }[].
```

Opaque adapter constraints remain in the private enforcement envelope and
reach the database separately from Query, so developer code cannot see or
remove them. For object-producing reads, Runtime validates and projects the
adapter result to its effective selection, hydrates eager pointer and relation
targets through their installed target-policy pipeline, then applies monotonic output
restrictions. `count` and `exists` retain exact `number` and `boolean` results.
An installed field policy evaluates the schema's logical `Pointer` value.

Selected virtual fields remain part of the logical selection seen by protected
policy, Hooks, persistence rewriters, and transports. After selection Access,
Runtime derives a separate private adapter projection from visible persisted
fields plus each permitted virtual field's declared dependencies. It snapshots
that superset, removes dependency-only values before public result behaviors,
then resolves and validates virtual outputs. One operation-local scheduler
orders occurrences by result item and schema declaration, runs fixed batches of
at most 16, settles a started batch before reporting its lowest-ordinal failure,
and starts no later batch after failure or cancellation. Eager target virtuals
share this scheduler but retain their own target Access evaluation. Mutation
resolution remains inside the automatic transaction and precedes commit.

## Runtime callback context and safety

Generic Runtime stages and low-level contribution factories receive the
immutable `RequestContext` already owned by the operation. It exposes request
correlation, cancellation, anonymous or audited-master authority, nominal
capabilities, and typed plugin values without adapters or transaction controls.

Core executes low-level callbacks through one product-neutral recursion and
cancellation boundary. Re-entering the same active callback fails with
`RUNTIME_CALLBACK_RECURSION`; cancellation fails with `OPERATION_CANCELLED`.
Concrete engines may wrap the request context in stricter lifecycle-bound
objects. The official Hooks plugin owns `HookContext`, named events, hook
diagnostics, and their revocation rules entirely inside its package.

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
request engine for each anonymous or plugin-derived request context. Direct
construction remains the low-level boundary for Runtime internals and focused
engine tests:

```ts
const framework = new FrameworkEngine({
	application,
	pipeline,
})

const context = RequestContext.anonymous({
	requestId: 'request-01',
	source: 'acme.transport',
}).withValue(authenticatedPrincipal, { id: 'user-1' })

const request = framework.withContext(context)

const publishedArticles = ArticleSchema.findMany({
	where: { status: { eq: 'published' } },
	orderBy: { createdAt: 'desc' },
	limit: 20,
})
```

The schema must be the exact definition registered by this application. A
schema from another application is rejected even if it uses the same
`className`, so parallel applications cannot leak queries or request contexts.
Direct `execute(operation)` remains available as the low-level
normalized-operation API. Queries expose `findOne`, `findMany`, `get`, `count`,
and `exists`. Generated schema classes expose `createOne`/`createMany`,
`updateOne`/`updateMany`, `upsertOne`/`upsertMany`, and
`deleteOne`/`deleteMany`.

Every root mutation automatically uses the same adapter transaction lifecycle
as `request.transaction()`. This includes singular commands and itemized create,
update, upsert, and delete batches. An operation already inside an explicit
transaction reuses that exact scope without attempting a nested transaction.
Root reads do not open a transaction.

Collection mutations are always atomic. Runtime executes their ordered singular
entries inside one outer transaction; any input, missing target, persistence,
or installed behavior failure rolls back the complete batch.
`updateMany` and `deleteMany` require one unique predicate per entry and return
only `id` by default. Installed behavior engines may expose a short business
kind while callbacks that consume the AST retain the exact `*-one` value in
`operation.kind`.

Automatic mutation transactions install their derived request engine in the
active asynchronous scope before the operation pipeline runs. Generic Runtime
callbacks receive only the immutable `RequestContext`; concrete plugins own any
stricter revocable callback facade they create.

`request.transaction(callback)` begins a transaction through the database
adapter retained by the pipeline. The callback receives a distinct engine with
the same application, context, authority, capabilities, typed values, and
metadata:

```ts
import { increment } from '@ultimabase/core'

const article = await request.transaction(async () => {
	const created = await ArticleSchema.createOne({
		data: { title: 'Atomic article' },
	})

	await StatsSchema.updateOne({
		where: { id: { eq: 'global' } },
		data: { articleCount: increment(1) },
	})

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

await runWithRequestEngine(master, () => ArticleSchema.findMany())
```

Ordinary trusted backend code normally uses the concise terminal option. The
first configured key ID identifies this path in the audit event, while no raw
key is retained or verified again:

```ts
const allArticles = await ArticleSchema.findMany(undefined, {
	ultimabase,
	useMasterKey: true,
})

const scopedMaster = await ArticleSchema.findMany(undefined, {
	context: contextCreatedByAPlugin,
	ultimabase,
	useMasterKey: true,
})
```

The raw key is only a verification input: neither the grant, `RequestContext`,
nor the audit event retains it. A grant cannot be constructed publicly, cannot
be shared across framework instances, and must produce a successful audit event
before `useMasterKey` returns. Master retains the request ID, source, metadata,
capabilities, plugin-owned typed values, transaction lifetime, and application
identity.

Runtime never bypasses enforcement merely because the context is `master`.
Each installed protected policy reads the trusted access mode and decides
whether its own decision applies. Official Access and ACL authorization always
choose bypass. Structural validation, generic behavior, adapter constraints,
transactions, commit, and observers remain part of the same pipeline.

## Optional behavior engines and observers

Core installs no Hooks or Access engine. Plugins contribute complete Runtime
behavior stages through `provideRuntimeBehavior()`, monotonic restrictions
through `provideRuntimeConstraint()`, and their own event/diagnostic capabilities.
Post-commit event delivery belongs to those product protocols. An absent
capability contributes no dispatcher, snapshot, callback, placeholder, or neutral
stage.

This is a structural cost guarantee, not a literal zero-CPU claim. The
repository's deterministic Runtime cost fixture requires a no-product graph to
materialize zero optional behavior or enforcement bundles and to invoke zero
optional stages across a representative read and mutation. Mandatory Core
stages and unrelated installed capabilities remain active.

The convenience factories `beforeOperation()`, `afterOperation()`,
and `preparedOperation()` are generic low-level Runtime definitions. Their
inputs use `RequestContext` and they do not create schema or field option
namespaces. The official Hooks package implements its richer
lifecycle, event delivery, diagnostics, and transaction semantics through
`provideRuntimeBehavior()` and package-owned contracts.

## Scoped contextual access

Trusted server code may use an explicit `RequestEngine` or open a Node.js
asynchronous scope to share it across internal service calls. Transport plugins
instead receive the narrow application request execution capability; they do
not receive an engine, application, or authority facade. For example, trusted
server code may open this scope:

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
references are derived from it, preventing server code from combining an
application, framework engine, and request context that do not belong together.
Nested scopes restore their parent, parallel promise chains remain isolated,
and synchronous or asynchronous callback results keep their exact type.

## Request contexts

Public code creates an anonymous Core context. An optional plugin may validate
its own credentials and derive typed values without creating another authority
mode:

```ts
const tenantRead = new RequestCapability('tenant:read')
const authenticatedPrincipal = new RequestContextValue<
	Readonly<{ id: string }>
>('auth.principal', (value: unknown) => validatePrincipal(value))

const anonymous = RequestContext.anonymous({
	requestId: 'request-01',
	source: 'acme.transport',
	capabilities: [tenantRead],
	metadata: { traceId: 'trace-01' },
})
const authenticated = anonymous.withValue(authenticatedPrincipal, {
	id: 'user-1',
})

authenticated.access // { mode: 'anonymous' }
authenticated.getValue(authenticatedPrincipal)?.id // string | undefined
authenticated.hasCapability(tenantRead) // true
```

Custom transport plugins may use their own non-empty source literal, such as
`grpc`. Options, metadata records, access state, capability collections, typed
values, and the context instance are copied or frozen at their owning boundary.
Matching value-token names remain different identities, and adding the same
token twice fails instead of letting plugin order replace trusted state.

Metadata is diagnostic and untyped. Credential-shaped keys such as
`authorization`, `sessionToken`, `accessToken`, `refreshToken`, `password`, and
`apiKey` are rejected; an authentication plugin validates those inputs before
deriving safe typed values.

There is deliberately no public master-context factory. Master contexts can
only be produced by `RequestEngine.useMasterKey` after grant verification or by
a trusted schema command after auditing through the framework-owned authority
described above.

## Database adapter boundary

Database plugins implement `DatabaseAdapter`; application developers normally
receive one from a plugin such as `postgresPlugin`. The contract
receives only a normalized operation and portable opaque constraints. SQL,
Drizzle sessions, and transport state remain private to concrete plugins.

Every call keeps the operation-specific result type:

```ts
const articles = await adapter.execute({
	operation: {
		kind: 'find-many',
		query: new QueryBuilder(articleSchema).limit(20).ast,
	},
	constraints: [
		databaseConstraint('example.tenant', 1, { tenantId: 'tenant-1' }),
	],
})

// readonly Article[]
```

`beginTransaction()` returns a distinguishable
`DatabaseTransactionAdapter`. It can execute operations and then `commit()` or
`rollback()`, but cannot begin another transaction. Runtime enforces the same
no-nesting policy on `RequestEngine`.

## Deterministic operation pipeline

`RuntimePipeline` is the low-level assembly boundary used by
`FrameworkEngine`. Application developers execute a bound query; advanced
engine authors provide the mandatory stages explicitly and may install the
optional behavior or enforcement groups compiled by application assembly:

```ts
const pipeline = new RuntimePipeline({
	normalization,
	structuralValidation,
	finalMutationValidation,
	databaseOperation: adapter,
	commit,
	behaviors,
	enforcement,
})

const articles = await pipeline.execute({ context, operation })
```

The fixed order performs initial Core structural validation, applies initial
enforcement, locks mutation targets, and runs every input transformer. Every
mutation then crosses the mandatory `finalMutationValidation` stage, which
repeats structural snapshots before optional rejection-only mutation guards and
value-dependent enforcement. Prepared adapters receive the final operation and
cumulative `constraints` for the write. A guard may inspect the complete value
projected from a prepared locked target while retaining the original atomic
delta for adapter execution.
Runtime then runs every business result transform, applies final output
restrictions, and finalizes the transaction and post-commit observers. Those
read, adapter-result, materialization, inclusion, and final-result boundaries
repeat structural snapshots without invoking application field validators. The
behavior and enforcement groups are absent when no plugin contributes them;
Runtime does not manufacture optional placeholders.

Stage envelopes and constraint collections are immutable. A
`FrameworkError` thrown by any stage crosses the pipeline unchanged, while
later stages do not run. In particular, a behavior result transform may prevent
a commit and post-commit observers never observe uncommitted work. Inside an explicit
transaction, the pipeline reuses every stage with the transaction adapter,
commits only after the callback succeeds, and buffers post-commit effects until
that outer commit.
