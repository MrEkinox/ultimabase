# @ultimabase/hono-server-plugin

Node.js Hono server provider for UltimaBase's shared HTTP application
capability. Hono and `@hono/node-server` stay confined to this package; Core,
REST, GraphQL, and the protocol-neutral HTTP package do not depend on them.

## Framework-owned listener

Without an existing app, the plugin creates one Hono application and owns its
Node listener. The port is the configured `port`, else the `PORT` environment
variable used by most hosting platforms, else `1337`; `host` is forwarded only when the
developer configures it. The listener opens only during `startTransports`,
after the complete application graph has validated, and closes when its
application stops.

```ts
import { UltimaBase } from '@ultimabase/core'
import { httpPlugin } from '@ultimabase/http-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { honoServerPlugin } from '@ultimabase/hono-server-plugin'

const server = honoServerPlugin()

// postgresPlugin() reads DATABASE_URL at start (ADR-0312).
const Application = UltimaBase.use(postgresPlugin())
	.use(httpPlugin())
	.use(server)
export const application = new Application({
	schemas: [],
})

await using app = await application.start()
```

Without `host`, the managed listener uses the `HOST` environment variable,
then `127.0.0.1` in development and every interface when `NODE_ENV` is
`production`; without `port`, it uses `PORT`, then `1337` (ADR-0312). The
plugin reads them when it is created, an explicit option always wins, and
`logLevel: 'debug'` logs the derived address and its source. The plugin also
provides the `ultimabase.http.server` capability, which tells `httpPlugin()`
that its routes have a server (ADR-0313).

`UltimaBase.start()` requires a database provider even with no application
schemas. These examples use PostgreSQL and `DATABASE_URL`; the provider is a
sibling dependency, not installed by Hono. Keep configuration separate from
startup when loading it for Typegen. The [website guide](../../apps/website/content/docs/1.0.0/plugins/official/hono-server.mdx)
shows the managed entry point and awaited shutdown for both ownership modes.

Port `0` is accepted for tests that need an operating-system-selected ephemeral
port. `ultimabase.plugin(server).address()` returns the bound Node
`AddressInfo` while the managed listener is open, and `undefined` before start,
after stop, or for an existing `app`
([ADR-0295](../../docs/adr/0295-hono-listener-address-export.md)). An independently owned listener on the same fixed address produces the normal
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
app.get('/ping', (context) => context.text('pong'))

const server = honoServerPlugin({ app })
const Application = UltimaBase.use(postgresPlugin())
	.use(httpPlugin())
	.use(server)
const application = new Application({
	schemas: [],
})

await application.start()
const listener = serve({ fetch: app.fetch, port: 1337 })
```

When `httpPlugin({ browser })` enables CORS, an existing app must name exactly
one CORS owner with `browserPolicyOwner`; without CORS the option may be
omitted (ADR-0323). With `browserPolicyOwner: 'ultimabase'`, the provider
enforces the `browser` policy from `httpPlugin()`. If existing middleware
already owns CORS, declare external ownership and leave the HTTP browser policy
disabled:

```ts
const server = honoServerPlugin({
	app,
	browserPolicyOwner: 'external',
})

const Application = UltimaBase.use(postgresPlugin({ url: databaseUrl }))
	.use(httpPlugin())
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
request, with the socket peer address used for rate limiting. Duplicate
application ID, Master key, authorization, cookie, content length, or request
ID lines therefore fail before application behavior. An external app must be
served by a Node integration that supplies the standard Hono
`incoming.rawHeaders` binding; requests without that evidence fail closed with
a message saying so.

Browser preflight is infrastructure-only and never selects an application.
Real requests follow normal identity, credential and Runtime handling. CORS is
not authentication, authorization, CSRF protection, or protection from
non-browser clients.

## Shutdown and compression

`stop()` refuses new requests, waits for in-flight ones at most
`shutdownTimeoutMs` (10 seconds by default), then closes the remaining
connections (ADR-0323). `compression: true` compresses UltimaBase responses
with gzip or deflate; it is off by default because proxies and CDNs usually
compress. On an existing app only the UltimaBase routes are compressed.

```ts
honoServerPlugin({ compression: true, shutdownTimeoutMs: 5_000 })
```

TLS and HTTP/2 come from the proxy or platform in front of the server. Proxy
trust, rate limits, security headers and the health route belong to
`httpPlugin()`; REST, GraphQL and authentication are separate plugins.
