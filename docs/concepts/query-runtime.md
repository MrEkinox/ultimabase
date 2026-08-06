# Query and Runtime

`Query<TSchema>` is immutable and never retains an application, request,
transaction, adapter, or authority:

```ts
const activeUsers = new Query(UserSchema)
	.where({ isActive: { eq: true } })
	.descending('createdAt')
```

Every terminal resolves execution only when called. Inside a request,
transaction, or queryable hook, it uses that exact active Runtime scope:

```ts
const users = await runWithRequestEngine(requestEngine, () =>
	activeUsers.limit(25).findMany(),
)
```

Outside an active scope, the terminal accepts the exact started application and
creates one anonymous internal request. Omitting both sources fails with
`MISSING_EXECUTION_CONTEXT` instead of selecting a process-wide default:

```ts
const users = await activeUsers.limit(25).findMany({ ultimabase })
```

Reusable `QueryScope<TSchema>` arrow functions compose filters, ordering,
limits, and pagination through `.use(scope)`. They retain the exact schema and
selection type. Scopes receive only a Query, so reusable query behavior cannot
capture execution or authority implicitly.

Transports produce the same AST as the class API. Runtime executes one pipeline for every source.

Structured fields share one flat filter vocabulary. Dynamic JSON uses safe
`JsonValue` operands, while typed objects preserve exact partial values, keys,
and nested paths:

```ts
import { fieldPath } from '@ultimabase/core'

const publicPosts = Post.query().where((where) =>
	where
		.contains('metadata', { visibility: 'public' })
		.hasKey('metadata', 'visibility')
		.eq(fieldPath('profile', ['contact', 'email']), 'ada@example.com')
		.jsonPathExists('metadata', {
			source: '$.items[*] ? (@.price > $minimum)',
			variables: { minimum: 10 },
		}),
)
```

The AST stores `field: 'profile'` and `path: ['contact', 'email']` separately.
It never parses dotted property names. String `contains` remains substring
matching; a JSON or object target selects structural containment instead.
JSONPath is the explicit advanced exception: its source is intentionally
untyped, while its target and immutable variables remain checked portable data.

Bulk creates and upserts are atomic by default. Bulk updates and deletes remain
set-based and return identifier-only models by default. An explicit flat
selection returns the requested post-update or pre-delete fields from that same
database statement; the result length is the affected-row count.

Every mutation eventually executes inside an automatic adapter transaction.
Database work started by a native hook through an ordinary `Schema.query()`
terminal shares that boundary and rolls back with the primary write. Runtime
tracks unawaited nested terminals, preserves caught failures as rollback-only,
and rejects asynchronous branches whose hook lease has closed. Reads do not
open a transaction automatically; developers can still use an explicit
transaction for a read-modify-write workflow.

Terminal operations use distinct AST kinds for singular and bulk behavior.
Create inputs, update expressions, and upsert target queries remain separate.
Operation options never carry master authority; that authority can only come
from a trusted Runtime request context.

Request contexts distinguish source from authority. A REST, GraphQL, job, or
custom transport may create anonymous or authenticated user state, but its
source never grants master access. Capability tokens are checked by identity,
and raw credentials are not retained as context metadata.

Master keys are verified by a `MasterAuthority` configured on the framework.
Verification returns an opaque grant owned by that framework; passing it to
`request.useMasterKey(grant, reason)` emits an audit-ready event before creating
the master engine. Operation options and transport booleans still cannot select
master authority.

Update inputs group `set`, `increment`, and `decrement` operations. Setting an
optional field to `null` clears it.
They normalize to immutable field-operation nodes, reject cross-operator field
conflicts, and keep partial set values pending the shared Runtime validation
pipeline.

`new UltimaBase(options)` is the regular application boundary. Its `start()`
method assembles the mandatory pipeline from the application's database service
and plugin contributions. Schema classes expose `Post.query()` as the regular
entry point; `new Query(Post)` is the equivalent lower-level primitive. The
lower-level `createFrameworkEngine(application)` factory remains available to
framework packages and explicit transport composition.

Assembly automatically installs `createRuntimeValidationStage()` as the
structural validation phase and composes the application's hooks and
post-commit events. Unclaimed access plugins contribute nothing: issue 337
removes their legacy named neutral stages in favor of policy-neutral monotonic
hook effects.

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

## Native hook lifecycle

Native schema and inline field declarations complement the low-level plugin
hook API. A direct family handler covers singular and bulk variants, while the
exact terminal `kind` remains available when behavior must differ:

```ts
const UserSchema = Schema.define({
	className: 'User',
	fields: {
		email: stringField({
			hooks: {
				resolveInput: ({ value }) => value.trim().toLowerCase(),
			},
		}),
	},
	hooks: {
		beforeCreate: ({ operation }) => operation,
		beforeUpdate: ({ operation }) => operation,
		beforeUpsert: ({ operation }) => operation,
		beforeRead: ({ query }) => query.limit(100),
	},
})
```

Inline field callbacks infer the exact logical value. Cross-field behavior uses
schema hooks. Plugins append to the same dispatcher with deterministic targets;
they cannot replace developer hooks. Policy plugins use a final monotonic hook
boundary: they may deny, append opaque adapter constraints, or narrow fields,
but later hooks cannot reverse those decisions. Runtime never names concrete
ACL, role, authentication, ownership, or community-provider behavior. Set-based
`updateMany` and `deleteMany` stay set-based instead of loading every row for
item callbacks.
