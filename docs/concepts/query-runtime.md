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
