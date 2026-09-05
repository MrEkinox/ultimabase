# @ultimabase/server-hono-plugin

Node.js Hono server provider for UltimaBase's shared HTTP application
capability. Hono and `@hono/node-server` stay confined to this package; Core,
REST, GraphQL, and the protocol-neutral HTTP package do not depend on them.

## Framework-owned listener

Without an existing app, the plugin creates one Hono application and owns its
Node listener. The default port is `1337`; `host` is forwarded only when the
developer configures it. The listener opens only during `startTransports`,
after the complete application graph has validated, and closes after the last
attached application stops.

```ts
import { UltimaBase } from '@ultimabase/core'
import { httpPlugin } from '@ultimabase/http-plugin'
import { honoServerPlugin } from '@ultimabase/server-hono-plugin'

const server = honoServerPlugin({ host: '127.0.0.1', port: 1337 })

const application = new UltimaBase({
	plugins: [httpPlugin({ appId: 'blog' }), server],
	schemas: [],
})

await application.start()
```

Port `0` is accepted for tests that need an operating-system-selected ephemeral
port. Starting two independently created managed providers on the same fixed
address produces the normal deterministic Node address-conflict failure.

## Explicit server sharing

One exact plugin value identifies one provider. Reuse that value deliberately
to mount several UltimaBase applications behind one listener. Each application
must have a unique HTTP `appId`; selection occurs before its immutable route
graph is dispatched.

```ts
const server = honoServerPlugin({ port: 1337 })

const publicApi = new UltimaBase({
	plugins: [httpPlugin({ appId: 'public-api' }), server],
	schemas: [],
})

const adminApi = new UltimaBase({
	plugins: [httpPlugin({ appId: 'admin-api' }), server],
	schemas: [],
})

await Promise.all([publicApi.start(), adminApi.start()])
```

Stopping one application removes only its exact mount. The listener remains
open while another application is attached. Separate `honoServerPlugin()`
calls always create separate providers and never communicate through a global
registry.

## Existing Hono application

Pass `app` when application routes must join an existing Hono assembly. The
plugin adds one dispatcher after UltimaBase validation but never starts, stops,
or disposes the Hono application or its listener. `host` and `port` are rejected
in this ownership mode.

```ts
import { serve } from '@hono/node-server'
import { Hono } from 'hono'

const app = new Hono()
app.get('/health', (context) => context.text('ok'))

const server = honoServerPlugin({ app })
const application = new UltimaBase({
	plugins: [httpPlugin({ appId: 'blog' }), server],
	schemas: [],
})

await application.start()
const listener = serve({ fetch: app.fetch, port: 1337 })
```

The Node adapter's ordered `rawHeaders` are passed beside the normalized Fetch
request. Duplicate application ID, Master key, authorization, cookie, content
length, or request ID lines therefore fail before application selection. An
external app must be served by a Node integration that supplies the standard
Hono `incoming.rawHeaders` binding; requests without that evidence fail closed.

TLS, proxy trust, CORS, compression, rate limiting, REST, GraphQL, and
authentication are intentionally outside this package.
