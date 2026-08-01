# Query and Runtime

`Query<TSchema>` is immutable and may be created without an engine:

```ts
const activeUsers = new Query(UserSchema)
	.equalTo('isActive', true)
	.descending('createdAt')
```

The unbound Query itself exposes no executable terminal. Runtime binding
creates a separate executable query:

```ts
await activeUsers.bind(requestEngine).limit(25).find()
```

Reusable `QueryScope<TSchema>` arrow functions compose filters, ordering,
limits, and pagination through `.use(scope)`. They retain the exact schema and
selection type. A bound query gives a scope only its unbound Query and restores
the same engine afterward, so reusable query behavior cannot capture execution
or authority implicitly.

Transports produce the same AST as the class API. Runtime executes one pipeline for every source.

Bulk creates and upserts are atomic by default. Bulk updates and deletes return counts rather than loading all affected objects.

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

Update inputs group `set`, `unset`, `increment`, and `decrement` operations.
They normalize to immutable field-operation nodes, reject cross-operator field
conflicts, and keep partial set values pending the shared Runtime validation
pipeline.

`createFrameworkEngine(application)` assembles the mandatory pipeline from the
application's database service and plugin contributions. It automatically
installs `createRuntimeValidationStage()` as the structural validation phase and
composes the application's hooks and post-commit events. Unclaimed access
positions remain explicit neutral stages instead of disappearing from the
execution order.

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
