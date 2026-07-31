# Architecture

## System shape

```text
static schemas
      ↓
SchemaRegistry
      ↓
typed extensions + plugin graph
      ↓
Query / Operation AST
      ↓
Runtime pipeline
      ↓
database adapter
      ↓
transport serialization and post-commit events
```

UltimaBase separates contracts, orchestration, and implementations:

- `schema`, `query`, and `access` define data and policy contracts.
- `core` owns application, plugins, services, lifecycle, and errors.
- `runtime` executes CRUD, transactions, hooks, and access checks.
- official plugins provide database, transport, HTTP server, migrations, and permission implementations.

## Package dependency graph

An arrow means “imports or depends on” and always points toward a foundation.

```text
schema ───────────────→ shared
pg-vector-plugin ─────→ schema, shared
query ────────────────→ schema, shared
access ───────────────→ schema, shared
core ─────────────────→ access, schema, shared
runtime ──────────────→ core, access, query, schema, shared

roles ────────────────→ runtime, core, access, schema
clp-permissions ──────→ runtime, core, access, schema
acl-permissions ──────→ runtime, core, access, query, schema
field-permissions ────→ runtime, core, access, query, schema
postgres ─────────────→ runtime, core, access, query, schema
postgres-migrations ──→ postgres, core, schema
server-hono ──────────→ runtime, core
rest ─────────────────→ runtime, core, query, schema
graphql ──────────────→ runtime, core, query, schema
graphql-yoga ─────────→ graphql, runtime, core
testing ──────────────→ runtime, core, schema
```

Concrete plugins may depend on Runtime and foundational contracts. Core and Runtime never depend back on concrete plugins.

## Schema extensions

`@ultimabase/schema` only knows the generic `SchemaExtension` and `FieldExtension` contracts. Plugins contribute typed extension objects:

```ts
defineSchema({
	className: 'Post',
	fields: {},
	extensions: [clpPermissions({}), aclPermissions({})],
})
```

Each extension records its expected plugin without exposing that plugin's
configuration contract to Schema. During application initialization, Core
matches `schema:name` and `field:name` handler identities against the setup
owner. Missing or wrongly owned handlers fail before any infrastructure phase;
duplicate handlers follow the regular contribution conflict policy.

Plugins may also contribute new logical field kinds. Structural validation
plans retain the original immutable field definition by identity; the owning
plugin claims its namespaced kind and contributes validation and adapter
behavior without a second plugin-only plan representation.

## Plugins

Plugins form one deterministic graph. Nesting is configuration sugar:

```ts
graphqlYogaPlugin({
	plugins: [apolloSandboxPlugin()],
})
```

The child is still registered globally. Dependencies determine setup order, then configuration position breaks ties. Teardown uses the reverse order.

Plugins occupying mutually exclusive architectural roles declare the same
`slot`. Normalization rejects multiple definitions for slots such as
`database-adapter` before any plugin is initialized.

`PluginGraph` validates the combined normalized configuration again, resolves
required and present optional dependencies, rejects explicit conflicts and
cycles, and exposes one stable dependency-first order without initializing
plugins.

Each application owns its setup registries. Plugin-scoped views attach the
current plugin name to services, extension handlers, operators, hooks,
generators, transports, pipelines, events, and commands without trusting
plugin code to declare its own owner.

The lifecycle manager first completes every setup callback, leaving a validation
boundary before infrastructure changes. It then runs connect, schema
preparation, runtime start, and transport start in graph order. Stop and dispose
run in reverse order, and a partial failure cleans every completed stage before
the original failure is reported.

`FrameworkApplication` owns those objects per instance. Its asynchronous factory
validates schemas and the plugin graph, completes declaration-only setup, and
returns before transports start. Configured literal plugin names retain their
setup export types, including definitions introduced through nested composition.

## Engines

- `FrameworkEngine` belongs to one isolated application.
- `RequestEngine` carries one immutable request context and delegates every
  normalized operation to that application's pipeline.
- `RequestEngine.transaction()` creates a callback-scoped engine backed by one
  adapter transaction. It commits once, rolls back on failure, cannot escape
  its callback, and rejects nested transactions until savepoints are explicit.
- Exact schema identity prevents a request engine from accepting definitions
  owned by another application, even when class names match.
- Optional `AsyncLocalStorage` scopes derive every current-context reference
  from one explicitly injected `RequestEngine`; nested and concurrent requests
  never share mutable global state.
- `Query<TSchema>` is an immutable unbound definition.
- `BoundQuery<TSchema>` is the Query-owned neutral facade attached to a Runtime
  engine; its singular terminals create Operation AST nodes and execute them
  through Runtime's neutral engine contract.

The Query AST retains the exact static schema definition and represents
selection, filtering, ordering, and pagination as immutable discriminated
nodes. It contains no request, GraphQL, SQL, adapter, or execution state;
transports normalize into it and adapters compile it behind Runtime contracts.

Access modes are `anonymous`, `user`, and `master`. Request sources such as `rest`, `graphql`, `job`, or `internal` are metadata, not access modes.
`RequestContext` correlates the mode with immutable request identity, source,
safe metadata, and identity-based capability tokens. Public construction cannot
select master mode; Runtime authority adds that audited path separately.

## Access control

```text
CLP for the operation
AND object ACL
AND field access
```

- CLP grants or rejects operations on an entire schema.
- ACL filters or protects individual objects.
- field access removes unreadable columns from selection and rejects forbidden writes.
- roles provide reusable principals for CLP and ACL.
- master bypass is explicit, audited, and never forgeable from request input.

## Database and migrations

Drizzle and PostgreSQL imports exist only inside PostgreSQL packages.

Without a migration plugin, `postgresPlugin` follows a configurable schema policy: `override`, `fail`, or `ignore`.

With `postgresMigrationPlugin`, startup schema preparation is claimed by the migration plugin. It owns `_ultimabase_schema`, migration history, snapshots, SQL generation, destructive policies, and drift detection.

## HTTP and GraphQL

- HTTP servers are plugins. The first implementation is Hono on Node.js.
- REST converts requests to Operation AST and never queries PostgreSQL directly.
- `graphqlCorePlugin` generates and executes a `GraphQLSchema` without a network server.
- `graphqlYogaPlugin` mounts GraphQL over HTTP and installs GraphQL Core automatically if needed.
- Custom Nexus, Pothos, or other schemas are accepted as `GraphQLSchema` instances and merged with the generated schema.

## Further reading

See [`docs/adr/`](docs/adr/README.md) for decision records and [`docs/concepts/`](docs/concepts/README.md) for detailed contracts.
