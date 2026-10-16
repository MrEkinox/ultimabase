# Query and Runtime

Schema reads use canonical typed object inputs. `QueryBuilder<TSchema>` is an
optional immutable utility that never retains an application, request,
transaction, adapter, or authority. Plugin code constructs it from
`@ultimabase/core/plugin`; the main entry exports it as a type only
(ADR-0311):

```ts
import { QueryBuilder } from '@ultimabase/core/plugin'

const activeUsers = new QueryBuilder(UserSchema)
	.where({ isActive: { eq: true } })
	.descending('createdAt')
	.build()
```

Every schema read resolves execution only when called. Inside a request,
transaction, or installed behavior callback, it uses that exact active Runtime scope:

```ts
const users = await runWithRequestEngine(requestEngine, () =>
	UserSchema.findMany({ ...activeUsers, take: 25 }),
)
```

Outside an active scope, the read resolves the sole started application and
creates one anonymous internal request. With no initialized application it
fails with `MISSING_EXECUTION_CONTEXT`:

```ts
const users = await UserSchema.findMany({ ...activeUsers, take: 25 })
```

Reusable `QueryScope<TSchema>` arrow functions compose filters, ordering,
limits, and pagination through `.use(scope)`. They retain the exact schema and
selection type. Scopes receive only a QueryBuilder, so reusable query behavior cannot
capture execution or authority implicitly.

Canonical objects, QueryBuilder, and transports produce the same AST. Runtime
executes one pipeline for every source.

Structured fields share one flat filter vocabulary. Dynamic JSON uses safe
`JsonValue` operands, while typed objects preserve exact partial values, keys,
and nested paths:

```ts
import { fieldPath } from '@ultimabase/core'

const publicPostsInput = new QueryBuilder(Post)
	.where((where) =>
		where
			.contains('metadata', { visibility: 'public' })
			.hasKey('metadata', 'visibility')
			.eq(fieldPath('profile', ['contact', 'email']), 'ada@example.com'),
	)
	.build()

const publicPosts = await Post.findMany(publicPostsInput)
```

The AST stores `field: 'profile'` and `path: ['contact', 'email']` separately.
It never parses dotted property names. String `contains` remains substring
matching; a JSON or object target selects structural containment instead.
Each database adapter declares the operators it executes; Core rejects any
other operator with `VALIDATION_ERROR` before the adapter (ADR-0301).

Every collection mutation is an ordered batch of singular item operations in
one automatic transaction. `updateMany` accepts `{ where, data }` entries and
`deleteMany` accepts unique target predicates; a missing target or failed item
rolls back the complete batch. Results preserve input order and select only
`id` by default. An explicit flat selection returns the requested persisted or
deleted values for every item.

Every mutation eventually executes inside an automatic adapter transaction.
Database work started by an installed official Hook through an ordinary schema
command shares that boundary and rolls back with the primary write. Runtime
tracks unawaited nested terminals, preserves caught failures as rollback-only,
and rejects asynchronous branches whose hook lease has closed. Reads do not
open a transaction automatically; developers can still use an explicit
transaction for a read-modify-write workflow.

Terminal operations retain distinct internal AST kinds for singular and
collection behavior. Create inputs, update expressions, and upsert target
queries remain separate. Official item-oriented Access and Hooks use the short
business kind without cardinality. Trusted backend code may request audited
master execution through operation options; transports cannot forge that
authority.

Request contexts distinguish source from authority. A REST, GraphQL, job, or
custom transport may create anonymous or authenticated user state, but its
source never grants master access. Capability tokens are checked by identity,
and raw credentials are not retained as context metadata.

Master keys are verified by a `MasterAuthority` configured on the framework.
Verification returns an opaque grant owned by that framework; passing it to
`request.useMasterKey(grant, reason)` emits an audit-ready event before creating
the master engine. Trusted schema commands may instead use the server-only
`useMasterKey: true` option, which crosses the same framework-owned audit
boundary. Transports must never derive either form from client input.

Update inputs use one field-oriented `data` map. Direct values replace fields,
`null` clears optional fields, and `{ increment: n }` or `{ decrement: n }`
objects on numeric fields (ADR-0307) normalize to immutable atomic-operation
nodes before the shared Runtime validation pipeline. Pointer fields link
through `{ connect: target }` or `null` (ADR-0308), and Runtime checks each
linked target's visibility before the write.

`UltimaBase.use(plugin)` configures the regular application factory, and
`new Application(options)` creates its application boundary. Its `start()` method
assembles the mandatory pipeline from the application's database capability and
plugin contributions. Schema classes expose schema-root object reads;
`new QueryBuilder(Post)` from `@ultimabase/core/plugin` is the equivalent
non-executing composition utility. The
lower-level `createFrameworkEngine(application)` factory remains available to
framework packages and explicit transport composition.

Assembly automatically installs `createRuntimeValidationStage()` as the
structural validation phase and composes generic Runtime behaviors, protected
policies, and post-commit events contributed by configured plugins. With no
behavior or policy provider, Core installs no neutral product stage.

The validation stage applies create or update plans, including both branches of
an upsert, without changing caller input:

```ts
const structuralValidation = createRuntimeValidationStage({
	timezone: 'Europe/Paris',
})
```

Static and runtime defaults, nested object/list rules, scalar constraints,
`autoNow`, and system timestamps all pass through this shared boundary. One
clock instant is reused across an entire bulk operation. Validation failures
use `VALIDATION_ERROR` and expose immutable issue paths such as
`["inputs", 2, "profile", "name"]`; master authority does not skip them.

Every create branch also receives its reserved UUID v7 `id` before database
execution. Distinct millisecond timestamps preserve UUID v7 lexical ordering;
IDs from one millisecond remain collision-resistant but do not promise a strict
creation order. Tests may inject a deterministic `uuidV7Generator` through the
same validation-stage options.

## Optional official Hooks lifecycle

Installing `@ultimabase/hooks-plugin` enables official schema and inline field
declarations. Field Hooks expose only value-oriented `resolveInput`. Schema
Hooks group input transformation, operation observation, and transaction
finalization. Direct and batched items use the same cardinality-free business
kind. Core structurally validates input before these callbacks, then always
runs final structural and Standard Schema validation after their combined
transformations:

```ts
import { UltimaBase } from '@ultimabase/core'
import { hooksPlugin } from '@ultimabase/hooks-plugin'

const Application = UltimaBase.use(hooksPlugin())
const UserSchema = Application.Schema.define({
	className: 'User',
	fields: (field) => ({
		email: field.string({
			hooks: {
				resolveInput: ({ value }) => value.trim().toLowerCase(),
			},
		}),
	}),
}).with((plugins) =>
	plugins.hooks({
		resolveInput: {
			update: ({ operation }) => operation,
		},
		beforeOperation: {
			update: ({ originalItem, item }) => {
				auditChange(originalItem, item)
			},
		},
		afterOperation: {
			create: ({ item }) => auditCreation(item),
		},
	}),
)

const ultimabase = new Application({
	schemas: [UserSchema],
})
```

Inline field callbacks infer the exact logical value. Cross-field behavior uses
schema hooks. Plugins append to the same dispatcher with deterministic targets;
they cannot replace developer Hooks. Policy plugins use Core's protected
monotonic boundary: they may deny, AND private row filters, or narrow
fields, but later behavior cannot reverse those decisions. Runtime never names
concrete ACL, role, authentication, ownership, or community-provider behavior.
Every generated-schema collection entry crosses the same field resolution,
item-policy, and operation-behavior lifecycle as its singular counterpart.

After mandatory final validation, an authorized Runtime behavior may contribute
`guardMutationInput`. This generic stage receives the final immutable mutation
operation and any stable prepared singular or bulk targets. It returns `void`,
so it can only continue or reject; it runs before value-dependent enforcement
reevaluation and before every observer or persistence effect. With no provider,
Runtime composes no guard callback.
