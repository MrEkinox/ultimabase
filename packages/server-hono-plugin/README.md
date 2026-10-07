# @ultimabase/server-hono-plugin

Node.js Hono server provider for UltimaBase's shared HTTP application
capability. Hono and `@hono/node-server` stay confined to this package; Core,
REST, GraphQL, and the protocol-neutral HTTP package do not depend on them.

## Framework-owned listener

Without an existing app, the plugin creates one Hono application and owns its
Node listener. The default port is `1337`; `host` is forwarded only when the
developer configures it. The listener opens only during `startTransports`,
after the complete application graph has validated, and closes when its
application stops.

```ts
import { UltimaBase } from '@ultimabase/core'
import { httpPlugin } from '@ultimabase/http-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { honoServerPlugin } from '@ultimabase/server-hono-plugin'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is required')
const server = honoServerPlugin({ host: '127.0.0.1', port: 1337 })

const Application = UltimaBase.use(postgresPlugin({ url: databaseUrl }))
	.use(httpPlugin({ appId: 'blog' }))
	.use(server)
const application = new Application({
	schemas: [],
})

await application.start()
```

`UltimaBase.start()` requires a database provider even with no application
schemas. These examples use PostgreSQL and `DATABASE_URL`; the provider is a
sibling dependency, not installed by Hono. Keep configuration separate from
startup when loading it for Typegen. The [website guide](../../apps/website/content/docs/1.0.0/plugins/official/hono-server.mdx)
shows the managed entry point and awaited shutdown for both ownership modes.

Port `0` is accepted for tests that need an operating-system-selected ephemeral
port. An independently owned listener on the same fixed address produces the normal
deterministic Node address-conflict failure.

## Application ownership

Core permits one initialized application per JavaScript realm. A second
application fails before setup or listener effects. Complete disposal permits
a later application; independent simultaneous applications require separate
workers, processes, or containers. The HTTP `appId` still identifies the exact
expected application and grants no authority. Each provider keeps one owner;
it has no shared-mount table or application selector. The same plugin value may
be reused after complete disposal with a fresh application.

## Existing Hono application

Pass `app` when application routes must join an existing Hono assembly. The
plugin adds one dispatcher after UltimaBase validation but never starts, stops,
or disposes the Hono application or its listener. After UltimaBase stops, its
dispatcher rejects requests through the safe HTTP boundary; ordinary Hono
routes keep working. `host` and `port` are rejected
in this ownership mode.

```ts
import { serve } from '@hono/node-server'
import { Hono } from 'hono'

const app = new Hono()
app.get('/health', (context) => context.text('ok'))

const server = honoServerPlugin({
	app,
	browserPolicyOwner: 'ultimabase',
})
const Application = UltimaBase.use(postgresPlugin({ url: databaseUrl }))
	.use(httpPlugin({ appId: 'blog' }))
	.use(server)
const application = new Application({
	schemas: [],
})

await application.start()
const listener = serve({ fetch: app.fetch, port: 1337 })
```

An existing app must name exactly one CORS owner. With
`browserPolicyOwner: 'ultimabase'`, the provider enforces the `browser` policy
from `httpPlugin()`. If existing middleware already owns CORS, declare external
ownership and leave the HTTP browser policy disabled:

```ts
const server = honoServerPlugin({
	app,
	browserPolicyOwner: 'external',
})

const Application = UltimaBase.use(postgresPlugin({ url: databaseUrl }))
	.use(httpPlugin({ appId: 'blog' }))
	.use(server)
const application = new Application({
	schemas: [],
})
```

In external ownership mode UltimaBase emits no CORS headers. Combining that
mode with an enabled UltimaBase browser policy is rejected. Conversely, when
UltimaBase owns CORS, a downstream response that already contains CORS headers
fails safely instead of producing contradictory policy.

The Node adapter's ordered `rawHeaders` are passed beside the normalized Fetch
request. Duplicate application ID, Master key, authorization, cookie, content
length, or request ID lines therefore fail before application behavior. An
external app must be served by a Node integration that supplies the standard
Hono `incoming.rawHeaders` binding; requests without that evidence fail closed.

Browser preflight is infrastructure-only and never selects an application.
Real requests still require `X-UltimaBase-Application-Id` and follow normal
credential and Runtime handling. CORS is not authentication, authorization,
CSRF protection, or protection from non-browser clients.

TLS, proxy trust, compression, rate limiting, REST, GraphQL, and authentication
are intentionally outside this package.
