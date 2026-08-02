# ADR-0094: UltimaBase public facade

- Status: accepted
- Date: 2026-08-02
- Refines: ADR-0005, ADR-0050, ADR-0065, ADR-0066, ADR-0076
- Refined by: ADR-0108

## Context

Core already owns isolated `FrameworkApplication` instances and Runtime already
assembles them into `FrameworkEngine` and request-bound engines. Requiring
developers to coordinate the factory, application lifecycle, engine assembly,
request context, and query binding obscures the regular path even though those
lower-level boundaries remain valuable to transports and framework packages.

The public API now consistently uses classes for `Schema` and `Query`. The
application entry point should follow the same model without moving Runtime or
concrete infrastructure dependencies into Core.

## Decision

`@ultimabase/runtime` exports the primary `UltimaBase` facade. Runtime owns the
class because it may depend on Core and Query; placing it in Core would reverse
the package graph. Its constructor accepts one flat configuration containing
`schemas`, `plugins`, optional structural `validation`, and an optional audited
`masterAuthority`:

```ts
const ultimabase = new UltimaBase({
	schemas: [PostSchema],
	plugins: [postgresPlugin()],
	validation: { timezone: 'Europe/Paris' },
})
```

Construction validates and snapshots configuration synchronously but performs
no plugin setup, connection, migration, transport, or other infrastructure
work. `start()` completes declaration setup, assembles the mandatory Runtime
engine before infrastructure starts, runs the plugin lifecycle, and publishes
the engine only after successful startup. Any setup, assembly, or startup
failure disposes completed resources before the original error is reported.

`ultimabase.query(schema)` is the concise direct TypeScript boundary. Inside an
active same-application scope it reuses that exact `RequestEngine`, including
its user or master authority and transaction. Outside a scope it creates a
fresh anonymous request with source `internal` and a native random UUID request
identifier. It never interprets an internal source as elevated authority.

The query return is deliberately presented as `UltimaBaseQuery<TSchema>` so
editor hovers do not expose application-wide engine generics. Exact schema,
field, selection, input, and result inference remain unchanged.

`application` and the started `engine` remain available for advanced plugin,
service, transport, and explicit request composition. `FrameworkApplication`,
`createApplication`, and `createFrameworkEngine` stay public low-level APIs but
are no longer the documented regular bootstrap path.

Starting teardown closes the execution boundary. Framework and request engines
reject new operations while their application is stopping, stopped, disposing,
or disposed, including operations attempted through a previously created bound
query. A stopped facade cannot restart. `dispose()` and
`Symbol.asyncDispose` permanently release its resources.

## Consequences

The common developer path becomes one class with one lifecycle:

```ts
const ultimabase = new UltimaBase({
	schemas: [PostSchema],
	plugins: [postgresPlugin()],
})

await ultimabase.start()
const posts = await ultimabase.query(PostSchema).find()
await ultimabase.dispose()
```

Several facades may still run concurrently without shared registries, schemas,
services, requests, or engines. Core remains infrastructure-neutral, direct
queries remain anonymous unless an existing trusted context is active, and no
Active Record persistence or global application singleton is introduced.
