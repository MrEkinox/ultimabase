# @ultimabase/core

The complete foundational UltimaBase framework for Node.js.

Responsibilities:

- immutable schemas, built-in and plugin-defined fields, and type inference;
- immutable Query and Operation AST builders;
- anonymous, user, and trusted master request authority;
- isolated `FrameworkApplication` instances;
- plugin definitions and global plugin graph;
- nested plugin normalization;
- typed service tokens and registries;
- lifecycle phases;
- request engines, validation, transactions, hooks, and database contracts;
- the public `UltimaBase` application facade.

Core must never import a concrete database, server, transport, migration,
permission, authentication, cache, or jobs package. Those optional capabilities
remain plugins above this package.

## Internal domains

One package does not mean one monolithic source folder. The implementation keeps
explicit `schema`, `query`, `access`, and `runtime` domains alongside application
orchestration, plugins, services, and errors. Internal folders are not exported
as package subpaths; every supported API comes from `@ultimabase/core`.

Detailed guides remain focused by domain:

- [Schema and fields](docs/schema.md), with practical [schema examples](examples/schema/README.md);
- [Query and Operation AST](docs/query.md);
- [request authority](docs/access.md);
- [Runtime, engines, transactions, and hooks](docs/runtime.md).

```ts
import { Schema, UltimaBase, booleanField, stringField } from '@ultimabase/core'

const PostSchema = new Schema({
	className: 'Post',
	fields: {
		title: stringField({ validation: { required: true } }),
		published: booleanField({ default: false }),
	},
})

const ultimabase = new UltimaBase({
	schemas: [PostSchema],
	plugins: [databasePlugin()],
})
```

## Framework application

The regular developer entry point is `new UltimaBase(options)` from
`@ultimabase/core`. `createApplication(options)` remains the lower-level
composition boundary used by advanced integrations. It
validates the schema registry and complete plugin graph, runs declaration-only
plugin setup, and returns before infrastructure or transports start:

```ts
const application = await createApplication({
	schemas: [UserSchema],
	plugins: [databasePlugin(), serverPlugin()],
})

await application.start()
```

Every application owns its schema registry, services, contribution registries,
plugin exports, and lifecycle state. No singleton or global mutable registry is
created. `application.getPlugin('fixture.database')` resolves the setup export
using the configured literal plugin name; nested plugin definitions participate
in the same typed lookup.

Framework packages consume plugin-provided services through the application's
read-only lookup boundary:

```ts
const database = application.getService(DatabaseServiceToken)
const optionalCache = application.getOptionalService(CacheServiceToken)
```

The token determines the exact return type. Required lookup reports a
`SERVICE_NOT_FOUND` framework error when no plugin provided the token, while
optional lookup returns `undefined`. Both methods become available after plugin
setup and remain usable while the application is stopped, but fail before setup
or after disposal. They do not expose registration, replacement, enumeration,
ownership, or service disposal.

Runtime also uses `application.ownsSchema(schema)` to verify exact object
identity. A separately declared schema with the same `className` is not owned by
the application, which prevents request engines from crossing application
boundaries accidentally.

`new FrameworkApplication(options)` remains available for advanced composition.
It validates static schema and graph configuration synchronously but leaves setup
lazy until `initialize()` or `start()` is called. A stopped application cannot be
restarted; disposal permanently releases its plugin and service resources.

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

Direct registry access is intended for application internals and plugin setup.
Plugin authors register through the owner-scoped `services` value supplied to
their setup callback. Application consumers use `application.getService(...)`
or `application.getOptionalService(...)` instead, so they cannot mutate or
dispose the application-owned registry.

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
		slot: 'database-adapter',
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
The optional `slot` reserves one exclusive architectural role. Required
dependencies, optional dependencies, conflicts, hooks, and nested definitions
are copied and frozen. Nested plugins remain global graph entries; their
placement under `plugins` is composition syntax.

`normalizePlugins(definitions)` resolves that syntax into immutable flat
metadata without running plugin code. Children receive implicit parent
dependencies, source order is retained, and the exact same definition can be
reused safely. Separate definitions with the same name or two plugins sharing
one exclusive slot fail with `PLUGIN_CONFLICT`.

`new PluginGraph(normalizedPlugins)` validates required and optional
dependencies, explicit conflicts, duplicate entries, exclusive slots, and
cycles. It exposes the deterministic dependency-first order through
`graph.plugins` and iteration:

```ts
const graph = new PluginGraph(normalizePlugins(configuredPlugins))

for (const plugin of graph) {
	console.log(plugin.definition.name)
}
```

Configuration position breaks ties between plugins that are ready together.
Missing optional dependencies are ignored. Graph construction remains static
and never executes setup or lifecycle hooks.

## Plugin setup registries

`PluginSetupRegistries` groups every application-owned setup boundary. A
plugin receives a stable context whose writes automatically record its name:

```ts
const setupRegistries = new PluginSetupRegistries(schemaRegistry)
const context = setupRegistries.forPlugin('fixture.database')

context.services.provide(DatabaseServiceToken, database)
context.registries.commands.register('fixture.reindex', reindexCommand)
```

Extensions, operators, hooks, generators, transports, pipelines, events, and
commands use isolated `ContributionRegistry` instances. Duplicate names within
one category fail instead of replacing the first owner. Setup contexts only
collect declarations; infrastructure work begins in later lifecycle phases.

After setup completes, framework packages can read immutable contribution
snapshots through `application.getContributions('hooks')` and the other
categories. Their insertion order is the resolved plugin graph order: required
dependencies first, then configuration position. Reading during setup or after
disposal fails, and the returned values do not expose a writable registry.
Core's Runtime domain uses this boundary to compose hook and event declarations
without application orchestration depending on their concrete contracts.

The active [native-hook plan](../../CURRENT_PLAN.md) gives Core's Schema domain
identity-owned declaration storage and gives its Runtime domain interpretation
and execution. Native developer hooks require no plugin, while plugin hooks use
typed global, schema, field-path, extension, or field-kind targets. Policy
plugins use those targets too; application orchestration stores their opaque
monotonic effects without naming CLP, ACL, roles, or field permissions.

[ADR-0096](../../docs/adr/0096-native-hook-declaration-capabilities.md)
keeps callbacks outside `SchemaDefinition`, `FieldDefinition`, field options,
validation plans, and migration metadata. Private Schema capabilities retain
immutable declarations by exact identity; Runtime reads them internally and
creates no neutral handler when a phase is absent.

Extension handlers use a scope-qualified identity so schema and field names stay
independent:

```ts
const permissionsPlugin = definePlugin({
	name: '@example/permissions',
	setup: ({ registries }) => {
		registries.extensions.register(
			extensionHandlerKey('schema', 'class-permissions'),
			classPermissionHandler,
		)
		registries.extensions.register(
			extensionHandlerKey('field', 'field-permissions'),
			fieldPermissionHandler,
		)
	},
})
```

Application initialization checks every schema and nested field extension after
all setup callbacks and before `connect`. The setup context supplies the handler
owner, so a plugin cannot claim another plugin's identity. Missing or wrongly
owned handlers fail with `PLUGIN_EXTENSION_HANDLER_MISSING`; duplicate handler
keys retain the shared `PLUGIN_CONFLICT` contribution policy.

## Plugin lifecycle

`PluginLifecycleManager` executes the resolved graph without merging declaration
and infrastructure work:

```ts
const lifecycle = new PluginLifecycleManager(graph, setupRegistries)

await lifecycle.setup()
// Application validation can run here before any connection is opened.
await lifecycle.start()
await lifecycle.stop()
await lifecycle.dispose()
```

Setup and forward phases use dependency order. The forward sequence is
`connect`, `prepareSchema`, `startRuntime`, then `startTransports`. Stop and
dispose use reverse dependency order. Setup, start, stop, and dispose retain one
promise while active and do not repeat completed work. A lifecycle cannot start
again after stop or disposal; calling stop before start is a no-op.

When setup or startup fails, completed plugins are stopped when active, disposed
in reverse order, and application services are released. Cleanup continues after
individual teardown failures. An `AggregateError` preserves the original failure
alongside any additional cleanup errors.
