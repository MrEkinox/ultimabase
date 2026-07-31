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

The application fails during setup when a schema extension has no runtime plugin capable of handling it.

Plugins may also contribute new logical field kinds. Schema preserves their
immutable definitions in opaque validation plans; the owning plugin claims the
kind and contributes its validation and adapter behavior. Logical kinds use
namespaced identifiers so community packages do not collide with built-ins.

## Plugins

Plugins form one deterministic graph. Nesting is configuration sugar:

```ts
graphqlYogaPlugin({
	plugins: [apolloSandboxPlugin()],
})
```

The child is still registered globally. Dependencies determine setup order, then configuration position breaks ties. Teardown uses the reverse order.

## Engines

- `FrameworkEngine` belongs to one isolated application.
- `RequestEngine` carries request context, access mode, capabilities, and an optional transaction.
- `Query<TSchema>` is an immutable unbound definition.
- `BoundQuery<TSchema>` is attached to a `RequestEngine` and can execute terminal operations.

Access modes are `anonymous`, `user`, and `master`. Request sources such as `rest`, `graphql`, `job`, or `internal` are metadata, not access modes.

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
