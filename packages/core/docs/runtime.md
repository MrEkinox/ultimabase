# Core Runtime domain

The single business-operation engine used by every transport.

Responsibilities:

- `FrameworkEngine` and request-bound engines;
- anonymous and master authority with plugin-owned typed context values;
- CRUD, bulk operations, and upserts;
- deterministic operation pipeline;
- hooks and post-commit events;
- transactions;
- AsyncLocalStorage helpers;
- database adapter contracts and execution.

Runtime does not import Drizzle, PostgreSQL, Hono, GraphQL, Yoga, or concrete permission plugins.

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

`ultimabase.application` exposes advanced Core service and plugin lookup.
`ultimabase.engine` exposes explicit anonymous, plugin-derived, master, and
transport request composition after startup. `stop()` closes existing queries and cannot
be restarted; `dispose()` or `Symbol.asyncDispose` permanently releases every
owned resource.

## Low-level application assembly

`createFrameworkEngine(application)` remains the lower-level bridge from Core
plugin setup to Runtime execution. The ADR-0076 assembly resolves the application-scoped
`databaseAdapterServiceToken`, installs structural validation, composes hooks
and events, and compiles monotonic enforcement only when a plugin contributed
it:

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
invalid pipeline or hook contribution, or unusable application state fails
during assembly, before any operation can execute.

Plugins use `runtimePipelineStage()` only for the general `normalization` and
`commit` positions. Policies instead register protected enforcement definitions
in the shared hook registry:

```ts
const tenantPlugin = (tenantId: string) =>
	definePlugin({
		name: 'example.tenant-access',
		setup: ({ registries }) => {
			registries.hooks.register(
				'example.tenant-constraint',
				constraint({
					schema: ArticleSchema,
					operations: ['find-many', 'find-one', 'get'],
					handler: () => databaseConstraint('example.tenant', 1, { tenantId }),
				}),
			)
			registries.hooks.register(
				'example.tenant-selection',
				restrictSelection({
					schema: ArticleSchema,
					handler: () => ['id', 'title'],
				}),
			)
		},
	})
```

`normalization` and `commit` contributions compose in dependency-first plugin
order. Enforcement factories are `guard`, `constraint`, `restrictInput`,
`restrictSelection`, and `restrictOutput`. Their handlers never receive another
plugin's accumulated state. Runtime appends constraints for adapter-side
logical `AND`, intersects field restrictions, and creates no enforcement stage
when the hook registry contains none. An optional `MasterAuthority` may be
supplied to `createFrameworkEngine` without changing the trusted master
boundary.

Low-level enforcement is applied to master by default. A provider may declare
`master: "bypass"` on one definition when its audited master contract requires
Runtime to skip that contribution before invocation, including trusted nested
provider queries that would otherwise re-enter the same policy hook.

## Policy-neutral monotonic enforcement

These factories are the low-level security foundation. Native schema and field
Access declarations plus provider contributions compile into the same
monotonic machinery. ACL and community policy providers use the Access registry
instead of registering business hooks directly.

Policy plugins register the same five public factories as any community tenant,
ownership, moderation, or soft-delete capability. A definition may omit
`schema` and `operations` to match every terminal, or retain an exact schema and
terminal union for concise callback inference. In this example,
`authenticatedPrincipal` is the nominal value token exported by the installed
authentication plugin:

Native schema `item` Access materializes its object before invoking developer or
plugin rules. Create branches receive an immutable `SchemaPreparedDraft`;
update and delete branches receive a persisted `SchemaResult`. Upsert follows
the same distinction after its create or update mode is known.

```ts
setup: ({ registries }) => {
	registries.hooks.register(
		'articles.guard-create',
		guard({
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
	)
	registries.hooks.register(
		'articles.visible-fields',
		restrictSelection({
			schema: ArticleSchema,
			handler: () => ['id', 'title', 'published'],
		}),
	)
	registries.hooks.register(
		'articles.safe-output',
		restrictOutput({
			schema: ArticleSchema,
			handler: () => ['id', 'title'],
		}),
	)
}
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
restrictions before effectful business hooks and retains the result in private
immutable state. After operation transforms, it reevaluates those contributions
into the same monotonic state before reapplying input and selection limits. An
earlier constraint is never replaced; a transformed value therefore cannot use
a stale guard decision. Output restriction handlers run once against the fully
transformed result immediately before the final projection. Handlers never
receive accumulated state or another plugin's opaque constraint payload. A
master request remains trusted authority, but only the contributing policy
decides whether its own handler treats that authority differently.

## Read pipeline and result shaping

Every read transport shares the same native Runtime path. Reads deliberately do
not expose schema lifecycle hooks. Developer filters, ordering, pagination,
selection, and includes belong to the query options; mandatory row restrictions
belong to schema Access:

```ts
const ArticleSchema = Schema.define({
	className: 'Article',
	fields: {
		title: stringField({ validation: { required: true } }),
		published: booleanField({ default: false }),
	},
	access: {
		filter: {
			read: ({ filter }) => filter.equalTo('published', true),
		},
	},
	},
})

const articles = await runWithRequestEngine(request, () =>
ArticleSchema.findMany({
	orderBy: [{ createdAt: 'desc' }],
	select: { id: true, title: true },
}),
)

// The exact result is readonly { id: string; title: string }[].
```

Opaque adapter constraints remain in the private enforcement envelope and
reach the database separately from Query, so developer code cannot see or
remove them. For object-producing reads, Runtime validates and projects the
adapter result to its effective selection, hydrates eager pointer and relation
targets through their target Access pipeline, then applies monotonic output
restrictions. `count` and `exists` retain exact `number` and `boolean` results.
Pointer field Access remains defined over the schema's logical `Pointer` value.

## HookContext capabilities, safety, and diagnostics

Every business hook input includes one immutable Runtime-owned `HookContext`:

```ts
beforeOperation: {
	create: async ({ context, item, kind }) => {
		await AuditSchema.createOne({ data: { action: kind } })
		context.emit('article.creating', { title: item.title })
		logger.debug({
			requestId: context.requestId,
			transactionId: context.transactionId,
		})
	}
}
```

The create candidate is an immutable `SchemaPreparedDraft` instance. It already
contains normalized defaults and framework system fields and supports `get()`
and `toJSON()`, while persistence commands remain unavailable before insertion.
Any non-null `originalItem` exposed by schema input resolution or mutation
observers is instead a complete persisted `SchemaResult` instance with protected
identity and the regular instance commands.

Root reads have no `transactionId`. Automatic mutations, explicit transactions,
nested operations, and master elevation retain one framework-generated opaque
identifier. Transport cancellation and `AbortSignal.timeout()` use the same
cooperative path. Runtime checks the signal between sequential pre-commit hooks,
waits for an active callback to settle rather than detaching it, then rolls an
active transaction back. Post-commit and confirmed-rollback observers still run
after the final database outcome is known.

A regular schema read reuses the current application's request
engine and transaction without forwarding `HookContext`. Runtime waits for
nested work even when the hook did not await it. The first nested failure keeps
the transaction rollback-only even if hook code catches that rejection. An
asynchronous branch that retains the hook's closed scope fails with
`HOOK_CONTEXT_CLOSED`; a detached input retains no scope and therefore requires
another ambient request or `{ ultimabase }`. Schema identity is checked
against the exact application instance.

The class also exposes immutable `access`, `source`, `hook`, request and
transaction identifiers, the cancellation signal, identity-based
`hasCapability(token)`, and typed `getValue(token)` lookup. It exposes no value
derivation, request metadata, raw credentials, master elevation, adapter,
commit, rollback, hook bypass, or mutable pipeline state.

An immutable asynchronous-local stack detects `A -> A` and `A -> B -> A`
re-entry by exact declaration, owner, target, phase, and handler position.
`HOOK_RECURSION` includes only redacted structural details. A nested operation
that reaches another phase, field, or schema remains supported and shares the
current transaction engine.

Plugins may provide one application-wide `hookDiagnosticsObserverServiceToken`.
Events contain static owner and target identity, phase, operation kind,
request/transaction identifiers, duration, status, and an optional stable
framework error code. Delivery runs outside both hook-stack and active-engine
scope. Runtime deliberately ignores observer throws and rejected promises, so
telemetry cannot affect ordering, results, transactions, or business errors.
Operations, field values, results, request metadata, access credentials, raw
errors, and adapter state never enter these events.

Root reads do not open an automatic transaction. A read inside
`request.transaction()` reuses that explicit transaction and its request
engine; otherwise, hooks must not assume read-started database work can roll
back with the read.

## Transaction finalization hooks

Every automatic mutation and explicit transaction shares one finalization
lifecycle. `beforeCommit` receives the successful mutations accumulated for its
schema and may still abort the transaction. `afterCommit` receives the same
per-schema summary once, only after the adapter confirms the outer commit:

```ts
const ArticleSchema = Schema.define({
	className: 'Article',
	fields: {
		title: stringField({ validation: { required: true } }),
	},
	hooks: {
		transaction: {
			beforeCommit: ({ changes }) => {
				// One immutable summary contains this schema's transaction changes.
				console.log(changes.length)
			},
			afterCommit: ({ changes }) => {
				// External work now observes committed database state.
				publish(changes)
			},
		},
	},
})
```

An explicit transaction may touch several schemas. Each participating schema's
transaction hooks run at most once with only its changes. Collection commands
append their singular item operations to that ordered change summary. Each
change exposes a cardinality-free business `kind`, while `change.operation.kind`
retains the exact normalized singular terminal.

If commit fails, Runtime attempts rollback. A failure from `afterCommit` or a
post-commit event observes already committed state and never attempts rollback.

The transaction-scoped request engine expires before finalization observers
run. `transaction.beforeCommit`, `transaction.afterCommit`, low-level
post-commit observers, and named-event consumers are explicitly non-queryable.
They retain correlation, access, capability checks, and event emission where
the transaction state still permits it. `beforeCommit` and `afterCommit` may
queue named events before post-commit delivery begins; rollback and error
observers cannot queue work for a transaction that will not commit.

The official PostgreSQL adapter verifies this lifecycle through the same public
API. A mutation started from `beforeOperation.create` reuses the primary
transaction, so an `afterOperation.create` or `transaction.beforeCommit`
failure rolls back both writes. Successful `transaction.afterCommit` handlers
and named-event consumers run once only after PostgreSQL
confirms the outer commit:

```ts
const ArticleSchema = Schema.define({
	className: 'Article',
	fields: { title: stringField({ validation: { required: true } }) },
	hooks: {
		beforeOperation: {
			create: async (input) => {
				await AuditSchema.createOne({ data: { action: 'article.create' } })
				input.context.emit('article.created', { title: input.item.title })
			},
		},
	},
})
```

No database handle or explicit transaction is passed through hook code.

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
	source: requestSources.graphql,
}).withValue(authenticatedPrincipal, { id: 'user-1' })

const request = framework.withContext(context)

const publishedArticles = ArticleSchema.findMany({
	where: { status: { eq: 'published' } },
	orderBy: [{ createdAt: 'desc' }],
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
item-hook, or `transaction.beforeCommit` failure rolls back the complete batch.
`updateMany` and `deleteMany` require one unique predicate per entry and return
only `id` by default. Their item-oriented hook and Access callbacks receive the
same short business `kind` as direct singular commands. Callbacks that expose
the AST retain the exact `*-one` value in `operation.kind`.

Automatic mutation transactions install their derived request engine in the
active asynchronous scope before the operation pipeline runs. Runtime captures
that exact engine behind each operation hook's revocable `HookContext`; hook
inputs never expose a raw or temporary request engine property.

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
Each native Access declaration, provider contribution, or advanced low-level
policy reads the trusted access mode and decides whether its own decision
applies. Structural validation, business hooks, adapter constraints,
transactions, commit, and post-commit events remain part of the same pipeline.

## Hooks and post-commit events

Native schema and inline field declarations require no plugin. Plugin setup uses
the same declaration contracts through an owner-bound `hooks` facade:

```ts
const auditPlugin = () =>
	definePlugin({
		name: 'example.audit',
		setup: ({ hooks }) => {
			hooks.global('measure-creates', {
				afterOperation: { create: ({ item }) => void item },
			})
			hooks.schema('audit-articles', ArticleSchema, {
				beforeOperation: { create: ({ item }) => void item },
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
	beforeOperation: {
		create: () => {
			retention.observe(extension.config.policy)
		},
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

### Named post-commit events

Operation hooks may emit one explicit portable event through their current
transaction:

```ts
interface ArticleCreatedEvent extends JsonObject {
	readonly kind: 'create'
	readonly title: string
}

const articleCreatedEvent = defineEvent<ArticleCreatedEvent>()(
	'article.created',
	{ delivery: 'required' },
)

const ArticleSchema = Schema.define({
	className: 'Article',
	fields: { title: stringField({ validation: { required: true } }) },
	hooks: {
		beforeOperation: {
			create: ({ context, item, kind }) => {
				context.emit(articleCreatedEvent, { title: item.title, kind })
			},
		},
	},
})

const searchPlugin = definePlugin({
	name: 'example.search',
	setup: ({ registries }) => {
		registries.events.register(
			'articles.created',
			onEvent({
				name: 'article.created',
				handler: ({ context, event }) => {
					searchIndex.add(event.payload)
					console.log(context.requestId, event.transactionId)
				},
			}),
		)
	},
})
```

The payload root must be a JSON object or array. Runtime copies and deeply
freezes it at emission, buffers it on the exact outer transaction, discards it
on rollback, and delivers it after commit in plugin graph plus registration
order. Required contracts fail when no matching consumer exists. Optional
contracts succeed with zero consumers and queue no post-commit effect; strings
retain required behavior for compatibility. Consumers are non-queryable
committed observers. Every matching consumer still runs if a sibling fails;
failures are reported after commit and never trigger rollback. A root read may
emit only inside an explicit transaction regardless of delivery mode.

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
				'articles.audit-create',
				beforeOperation({
					schema: ArticleSchema,
					operations: ['create-one'],
					handler: ({ operation }) => audit(operation),
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

Before-hooks are observers and return nothing; after-hooks remain result
transformers and return exactly `{ result }`. Inputs are immutable. General
input normalization belongs in field or schema `resolveInput`; the restricted
`preparedOperation()` factory exists for an update value that depends on its
locked target. `createRuntimeHookStages(application)` composes definitions in
dependency-first plugin order into the fixed Runtime pipeline positions.
After-hooks still run before commit and can abort the transaction. Post-commit
events run only after a successful standalone commit; explicit transactions
buffer them until the outer commit and discard them on rollback.

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
	source: requestSources.graphql,
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
receive one from a plugin such as the future `postgresPlugin`. The contract
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
engine authors provide the general stages explicitly and may install the native
or enforcement stage groups compiled by application assembly:

```ts
const pipeline = new RuntimePipeline({
	normalization,
	structuralValidation,
	globalBeforeHooks,
	schemaBeforeHooks,
	databaseOperation: adapter,
	schemaAfterHooks,
	globalAfterHooks,
	commit,
	postCommitEvents,
	nativeHooks,
	enforcement,
})

const articles = await pipeline.execute({ context, operation })
```

The fixed order performs initial validation and enforcement, locks mutation
targets, runs every input transformer, then crosses one final structural
revalidation and value-dependent enforcement pass. Business before-hooks only
observe that final operation. Prepared adapters receive the final operation and
cumulative `constraints` for the write. Runtime then runs every business result
transform, applies final output restrictions, and finalizes the transaction and
post-commit events. The enforcement group is absent when no plugin contributed
one; Runtime does not manufacture permission placeholders.

Stage envelopes and constraint collections are immutable. A
`FrameworkError` thrown by any stage crosses the pipeline unchanged, while
later stages do not run. In particular, business after-hooks may prevent a
commit and post-commit events never observe uncommitted work. Inside an explicit
transaction, the pipeline reuses every stage with the transaction adapter,
commits only after the callback succeeds, and buffers post-commit effects until
that outer commit.
