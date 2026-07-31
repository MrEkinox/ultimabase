# Query and Runtime

`Query<TSchema>` is immutable and may be created without an engine:

```ts
const activeUsers = new Query(UserSchema)
	.equalTo('isActive', true)
	.descending('createdAt')
```

The Query package itself exposes no executable terminal. Runtime binding will
create a separate executable query:

```ts
await activeUsers.bind(requestEngine).limit(25).find()
```

Transports produce the same AST as the class API. Runtime executes one pipeline for every source.

Bulk creates and upserts are atomic by default. Bulk updates and deletes return counts rather than loading all affected objects.

Terminal operations use distinct AST kinds for singular and bulk behavior.
Create inputs, update expressions, and upsert target queries remain separate.
Operation options never carry master authority; that authority can only come
from a trusted Runtime request context.

Update inputs group `set`, `unset`, `increment`, and `decrement` operations.
They normalize to immutable field-operation nodes, reject cross-operator field
conflicts, and keep partial set values pending the shared Runtime validation
pipeline.
