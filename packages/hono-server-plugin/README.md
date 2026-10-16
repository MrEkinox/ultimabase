# @ultimabase/hono-server-plugin

Node.js Hono server provider for UltimaBase's shared HTTP application
capability. Hono and `@hono/node-server` stay confined to this package; Core,
REST, GraphQL, and the protocol-neutral HTTP package do not depend on them.

Every code block in this README is copied from the tested
[`examples/http`](../../examples/http/README.md) application by
`yarn docs:regions` (ADR-0330): edit the example, then run the script.

## Framework-owned listener

Without an existing app, the plugin creates one Hono application and owns its
Node listener. `apiServer({ server })` from `@ultimabase/api-server` passes
its `server` options to `honoServerPlugin(server)`:

<!-- region ../../examples/http/src/app.ts#factory -->

```ts
import { accessPlugin } from '@ultimabase/access-plugin'
import { apiServer } from '@ultimabase/api-server'
import { UltimaBase } from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'

import { apiInfoPlugin } from './api-info-plugin.ts'
import { readSecret } from './env.ts'
import { http } from './http.ts'
import { partnerCredentials } from './partners.ts'

/**
 * `apiServer()` installs the HTTP foundation, REST and the Hono server, each
 * with its own options. Access decides who may write through REST.
 * `postgresPlugin()` reads `DATABASE_URL` when the application starts.
 */
export const App = UltimaBase.use(
	accessPlugin(),
	partnerCredentials({ acme: readSecret('ACME_PARTNER_TOKEN') }),
	apiInfoPlugin(),
	...apiServer({
		http,
		rest: true,
		// The managed listener: `PORT`, else 1337; `HOST`, else 127.0.0.1
		// outside production.
		server: { compression: true, shutdownTimeoutMs: 5_000 },
	}),
	postgresPlugin(),
)
```

<!-- endregion -->

The port is the configured `port`, else the `PORT` environment variable used
by most hosting platforms, else `1337`. Without `host`, the managed listener
uses the `HOST` environment variable, then `127.0.0.1` in development and
every interface when `NODE_ENV` is `production` (ADR-0312). The plugin reads
them when it is created, an explicit option always wins, and
`logLevel: 'debug'` logs the derived address and its source. The plugin also
provides the `ultimabase.http.server` capability, which tells `httpPlugin()`
that its routes have a server (ADR-0313).

The listener opens only during `startTransports`, after the complete
application graph has validated, and closes when its application stops. Keep
configuration separate from startup so tooling can load it without starting a
server; the entry point starts the application and awaits its disposal:

<!-- region ../../examples/http/src/main.ts#main -->

```ts
import { once } from 'node:events'
import process from 'node:process'

import { ultimabase } from './ultimabase.ts'

// Listen before starting, so a stop signal during startup is observed too.
const stopSignal = Promise.race([
	once(process, 'SIGINT'),
	once(process, 'SIGTERM'),
])
try {
	await ultimabase.start()
	const address = ultimabase.plugin('@ultimabase/hono-server-plugin').address()
	console.info(`Listening on port ${String(address?.port)}`)
	await stopSignal
} finally {
	// Refuses new requests, lets in-flight ones finish, then closes the
	// listener and the database.
	await ultimabase.dispose()
}
```

<!-- endregion -->

`UltimaBase.start()` requires a database provider even with no application
schemas. The example uses PostgreSQL and `DATABASE_URL`; the provider is a
sibling dependency, not installed by Hono.

Port `0` is accepted for tests that need an operating-system-selected ephemeral
port. `ultimabase.plugin('@ultimabase/hono-server-plugin').address()` returns
the bound Node `AddressInfo` while the managed listener is open, and
`undefined` before start, after stop, or for an existing `app`
([ADR-0295](../../docs/adr/0295-hono-listener-address-export.md)). An
independently owned listener on the same fixed address produces the normal
deterministic Node address-conflict failure.

## Shutdown and compression

`stop()` refuses new requests, waits for in-flight ones at most
`shutdownTimeoutMs` (10 seconds by default; 5 in the example above), then
closes the remaining connections (ADR-0323). `compression: true` compresses
UltimaBase responses with gzip or deflate; it is off by default because
proxies and CDNs usually compress. On an existing app only the UltimaBase
routes are compressed.

TLS and HTTP/2 come from the proxy or platform in front of the server. Proxy
trust, rate limits, security headers and the health route belong to
`httpPlugin()`; REST, GraphQL and authentication are separate plugins.

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
or disposes the Hono application or its listener. `host`, `port` and
`shutdownTimeoutMs` are rejected in this ownership mode. The example's second
application installs the plugins one by one:

<!-- region ../../examples/http/src/existing-app.ts#existing-app -->

```ts
import { UltimaBase } from '@ultimabase/core'
import { honoServerPlugin } from '@ultimabase/hono-server-plugin'
import { httpPlugin } from '@ultimabase/http-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { restPlugin } from '@ultimabase/rest-plugin'
import { Hono } from 'hono'

/** An existing Hono application keeps its own routes and its listener. */
export const app = new Hono()
app.get('/ping', (context) => context.text('pong'))

/**
 * The plugins `apiServer()` installs, one by one. With `app`, the Hono
 * server plugin adds UltimaBase's routes to it but never starts or stops it.
 */
export const AdminApp = UltimaBase.use(
	httpPlugin({ appId: 'links-admin' }),
	// Reports are produced server-side: REST only reads them.
	restPlugin({
		default: { createOne: false, updateOne: false, deleteOne: false },
	}),
	honoServerPlugin({ app }),
	postgresPlugin(),
)

export const Report = AdminApp.Schema.define({
	className: 'Report',
	fields: (field) => ({ title: field.string({ required: true }) }),
})

export const admin = new AdminApp({ schemas: [Report] })
```

<!-- endregion -->

<!-- region ../../examples/http/src/existing-main.ts#serve,close -->

```ts
import { once } from 'node:events'
import process from 'node:process'

import { serve } from '@hono/node-server'

import { admin, app } from './existing-app.ts'

await admin.start()
// This listener is yours: UltimaBase never opens or closes it.
const listener = serve({ fetch: app.fetch, port: 3000 })

await Promise.race([once(process, 'SIGINT'), once(process, 'SIGTERM')])
try {
	// UltimaBase stops first; `/ping` keeps answering until the listener closes.
	await admin.dispose()
} finally {
	await new Promise<void>((resolve, reject) => {
		listener.close((error) => {
			if (error === undefined) resolve()
			else reject(error)
		})
	})
}
```

<!-- endregion -->

After UltimaBase stops, its dispatcher rejects requests through the safe HTTP
boundary with `HTTP_APPLICATION_REJECTED`; ordinary Hono routes keep working
until you close the listener.

When `httpPlugin({ browser })` enables CORS, an existing app must name exactly
one CORS owner with `browserPolicyOwner`; without CORS the option may be
omitted (ADR-0323), and a browser preflight is refused with
`HTTP_CORS_DISABLED`. With `browserPolicyOwner: 'ultimabase'`, the provider
enforces the `browser` policy from `httpPlugin()`. If existing middleware
already owns CORS, declare `honoServerPlugin({ app, browserPolicyOwner: 'external' })`
and leave the HTTP browser policy disabled.

In external ownership mode UltimaBase emits no CORS headers. Combining that
mode with an enabled UltimaBase browser policy is rejected. Conversely, when
UltimaBase owns CORS, a downstream response that already contains CORS headers
fails safely instead of producing contradictory policy.

The Node adapter's ordered `rawHeaders` are passed beside the normalized Fetch
request, with the socket peer address used for rate limiting. Duplicate
application ID, Master key, authorization, cookie, content length, or request
ID lines therefore fail before application behavior. An external app must be
served by a Node integration that supplies the standard Hono
`incoming.rawHeaders` binding; requests without that evidence, such as
`app.request()` calls, fail closed with a message saying so.

Browser preflight is infrastructure-only and never selects an application.
Real requests follow normal identity, credential and Runtime handling. CORS is
not authentication, authorization, CSRF protection, or protection from
non-browser clients.
