# Query and Runtime

Schema reads use canonical typed object inputs. `QueryBuilder<TSchema>` is an
optional immutable utility that never retains an application, request,
transaction, adapter, or authority:

```ts
const activeUsers = new QueryBuilder(UserSchema)
	.where({ isActive: { eq: true } })
	.descending('createdAt')
	.build()
```

Every schema read resolves execution only when called. Inside a request,
transaction, or hook, it uses that exact active Runtime scope:

```ts
const users = await runWithRequestEngine(requestEngine, () =>
	UserSchema.findMany({ ...activeUsers, limit: 25 }),
)
```

Outside an active scope, the read accepts the exact started application and
creates one anonymous internal request. Omitting both sources fails with
`MISSING_EXECUTION_CONTEXT` instead of selecting a process-wide default:

```ts
const users = await UserSchema.findMany(
	{ ...activeUsers, limit: 25 },
	{ ultimabase },
)
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
			.eq(fieldPath('profile', ['contact', 'email']), 'ada@example.com')
			.jsonPathExists('metadata', {
				source: '$.items[*] ? (@.price > $minimum)',
				variables: { minimum: 10 },
			}),
	)
	.build()

const publicPosts = await Post.findMany(publicPostsInput)
```

The AST stores `field: 'profile'` and `path: ['contact', 'email']` separately.
It never parses dotted property names. String `contains` remains substring
matching; a JSON or object target selects structural containment instead.
JSONPath is the explicit advanced exception: its source is intentionally
untyped, while its target and immutable variables remain checked portable data.

Every collection mutation is an ordered batch of singular item operations in
one automatic transaction. `updateMany` accepts `{ where, data }` entries and
`deleteMany` accepts unique target predicates; a missing target or failed item
rolls back the complete batch. Results preserve input order and select only
`id` by default. An explicit flat selection returns the requested persisted or
deleted values for every item.

Every mutation eventually executes inside an automatic adapter transaction.
Database work started by a native hook through an ordinary schema command
shares that boundary and rolls back with the primary write. Runtime
tracks unawaited nested terminals, preserves caught failures as rollback-only,
and rejects asynchronous branches whose hook lease has closed. Reads do not
open a transaction automatically; developers can still use an explicit
transaction for a read-modify-write workflow.

Terminal operations retain distinct internal AST kinds for singular and
collection behavior. Create inputs, update expressions, and upsert target
queries remain separate. Public item-oriented Access and hooks use the short
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
`null` clears optional fields, and explicit `increment()` or `decrement()`
values normalize to immutable atomic-operation nodes before the shared Runtime
validation pipeline.

`new UltimaBase(options)` is the regular application boundary. Its `start()`
method assembles the mandatory pipeline from the application's database service
and plugin contributions. Schema classes expose schema-root object reads;
`new QueryBuilder(Post)` is the equivalent non-executing composition utility. The
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
hook API. Field hooks expose only value-oriented `resolveInput`. Schema hooks
group input transformation, operation observation, and transaction
finalization. Direct and batched items use the same cardinality-free business
kind:

```ts
const UserSchema = Schema.define({
	className: 'User',
	fields: (field) => ({
		email: field.string({
			hooks: {
				resolveInput: ({ value }) => value.trim().toLowerCase(),
			},
		}),
	}),
	hooks: {
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
	},
})
```

Inline field callbacks infer the exact logical value. Cross-field behavior uses
schema hooks. Plugins append to the same dispatcher with deterministic targets;
they cannot replace developer hooks. Policy plugins use a final monotonic hook
boundary: they may deny, append opaque adapter constraints, or narrow fields,
but later hooks cannot reverse those decisions. Runtime never names concrete
ACL, role, authentication, ownership, or community-provider behavior. Every
generated-schema collection entry crosses the same field resolution, item
Access, and operation-hook lifecycle as its singular counterpart.
