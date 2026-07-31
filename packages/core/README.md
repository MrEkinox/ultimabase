# @ultimabase/core

Infrastructure-neutral application contracts.

Responsibilities:

- isolated `FrameworkApplication` instances;
- plugin definitions and global plugin graph;
- nested plugin normalization;
- typed service tokens and registries;
- lifecycle phases;
- shared contexts and framework errors;
- registries used during plugin setup.

Core contains no CRUD implementation and must never import concrete database, server, transport, migration, permission, auth, cache, or jobs packages.

## Framework errors

`FrameworkError` carries one stable framework code while separating trusted
diagnostics from transport-safe metadata:

```ts
const error = new FrameworkError('NOT_FOUND', 'User row was absent', {
	cause: databaseError,
	publicMessage: 'The requested user was not found.',
	publicDetails: { resource: 'User', id: userId },
	internalDetails: { table: 'users' },
})
```

The regular error message, stack, cause, and `internalDetails` remain diagnostic
state. `JSON.stringify(error)` uses the error's immutable public payload and
includes only its code, retryability, `publicMessage`, and `publicDetails`.
Transports map that payload to HTTP, GraphQL, or other protocol-specific error
formats without adding transport metadata to Core.

## Service tokens

`createServiceToken<TService>(debugName)` replaces untyped service names with
one immutable identity carrying the exact service contract:

```ts
export interface DatabaseService {
	query(sql: string): Promise<readonly unknown[]>
}

export const DatabaseServiceToken = createServiceToken<DatabaseService>(
	'ultimabase.database',
)
```

The debug name exists only for logs and errors. Creating another token with the
same name produces a different identity; consumers must import and share the
exported token value. Every token accepts one provider per application, and the
service registry rejects duplicate provision rather than replacing an existing
service through plugin order.

`ServiceRegistry` stores those values per application and distinguishes required
from optional lookup:

```ts
const services = new ServiceRegistry()

services.provide(DatabaseServiceToken, database)

const requiredDatabase = services.get(DatabaseServiceToken)
const optionalCache = services.getOptional(CacheServiceToken)
```

Providing the same token twice is an error and never replaces the original
value. Each registry is isolated and has no global state. Calling `dispose()`
clears its references and releases services implementing `Symbol.dispose` or
`Symbol.asyncDispose` once, in reverse registration order.

## Plugin definitions

`definePlugin(options)` creates immutable metadata without executing setup or
lifecycle work:

```ts
export const databasePlugin = () =>
	definePlugin({
		name: 'fixture.database',
		dependencies: ['fixture.config'],
		setup: ({ services }) => {
			const database = createDatabase()

			services.provide(DatabaseServiceToken, database)

			return { database }
		},
		hooks: {
			connect: ({ pluginExports }) => pluginExports.database.connect(),
		},
	})
```

Names and setup exports retain their exact types for future plugin lookup.
Required dependencies, optional dependencies, conflicts, hooks, and nested
definitions are copied and frozen. Nested plugins remain global graph entries;
their placement under `plugins` is composition syntax resolved by later Core
stages.
