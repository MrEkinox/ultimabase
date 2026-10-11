# @ultimabase/http-plugin

Optional Fetch-compatible HTTP application boundary for UltimaBase.

The package owns public application IDs, immutable route and mount composition,
original-header evidence, and the application graph consumed by server
providers. It does not open a socket or depend on Hono, REST, GraphQL,
authentication, or a database.

## Install the HTTP foundation

```ts
import { UltimaBase } from '@ultimabase/core'
import { httpPlugin } from '@ultimabase/http-plugin'

const Application = UltimaBase.use(
	httpPlugin({
		browser: { origins: ['https://console.example'], credentials: true },
		master: true,
		routes: {
			'GET /status': (request, { context }) =>
				Response.json({ mode: context.access.mode }),
		},
	}),
)
const ultimabase = new Application({
	schemas: [],
})
```

`httpPlugin()` needs no option (ADR-0323). Its defaults:

| Option                 | Default                                                    |
| ---------------------- | ---------------------------------------------------------- |
| `appId`                | `'main'`                                                   |
| `requireApplicationId` | `false`                                                    |
| `health`               | `{ path: '/health' }`                                      |
| `requestTimeoutMs`     | `30_000`                                                   |
| `bodyLimit`            | `1_048_576` bytes for every route                          |
| `securityHeaders`      | `nosniff`, `X-Frame-Options: DENY`, HSTS on HTTPS          |
| `browser`              | CORS disabled                                              |
| `master`               | Master header refused                                      |
| `rateLimit`            | none; `trustProxy` unset, so the socket peer is the client |
| `accessLog`            | `false`                                                    |

## Application identity

`appId` is public and grants no authority. A request without
`X-UltimaBase-Application-Id` reaches the only application of the process, so
existing Parse-style clients and plain `curl` work. A request whose header
names a different application is refused with `HTTP_APPLICATION_UNKNOWN`
(404). Several applications behind one proxy set `requireApplicationId: true`:
a missing header is then refused with `HTTP_APPLICATION_REJECTED` (401).

A browser page that cannot send headers may still open an exact `GET` route
created with `httpBrowserBootstrapRoute()` at
`/__ultimabase/apps/{encodeURIComponent(appId)}{routePath}`. The application
fetch boundary accepts the path-carried ID only after confirming that exact
application owns that exact bootstrap route, then resumes the complete normal
context, credential, timeout, attribution, and response boundary. The reserved
`/__ultimabase/apps` namespace cannot be used by ordinary routes or mounts.

Browser-tool plugins can validate their configurable suffix once with
`normalizeHttpBrowserBootstrapPath(value, label)` before creating the route.
It applies the same absolute, non-root, non-reserved, decoded-segment rules used
by the official GraphiQL and Apollo Sandbox plugins and returns the normalized
string without registering behavior.

## Application routes

`routes` takes the same record as the plugin helper `httpRoutes` (one
vocabulary): keys are `"<METHOD> /<path>"`, values are handlers or
`{ handle, bodyLimit?, rateLimit? }`. A handler receives the Fetch request and
the resolved request context, already active, so queries in the handler run
with it:

```ts
httpPlugin({
	routes: {
		'GET /me': (request, { context }) =>
			Response.json({ mode: context.access.mode }),
		'POST /upload': {
			bodyLimit: 10_485_760,
			rateLimit: { perMinute: 10 },
			handle: async (request) => new Response(await request.text()),
		},
	},
})
```

A malformed key or handler fails when the plugin is created. Application
routes run under the HTTP plugin's identity, after the same identity,
credential and Master checks as every route.

## Health route

`GET /health` answers 200 `{ "status": "OK" }` or 503
`{ "status": "DEGRADED" }` from `ultimabase.health()` (ADR-0303), with no
application header or credential, whichever transports are installed. The
cause of a failure is only logged server-side. `health: { path: '/healthz' }`
moves it and `health: false` removes it; a mount at `/` owns that path, so it
must move or remove the route.

## Deadline, body size and security headers

Every accepted route begins with a new anonymous, application-bound Core
context. `requestTimeoutMs` (30 seconds by default) composes one deadline with
the Fetch signal; the resulting signal is shared by resolvers, handlers,
Runtime work, transactions, and response completion. It must be an integer from
1 through 2147483647 milliseconds, the largest delay a JavaScript timer honors.

`bodyLimit` bounds request bodies to 1 MiB for every route. HTTP counts bytes
as the handler reads them; the read that crosses the limit fails and the
request is answered `HTTP_PAYLOAD_TOO_LARGE` (413), unless the handler already
answered 413 in its own format. A route or mount sets its own `bodyLimit`, and
a transport option such as `restPlugin({ bodyLimit })` replaces it for that
transport's routes; without one, REST and GraphQL inherit this limit.

Responses carry `X-Content-Type-Options: nosniff` and `X-Frame-Options: DENY`,
and `Strict-Transport-Security: max-age=31536000; includeSubDomains` on HTTPS
requests. A handler's own value wins. Configure them one by one, or remove
them all with `securityHeaders: false`:

```ts
httpPlugin({
	securityHeaders: {
		frameOptions: 'SAMEORIGIN',
		hsts: { maxAgeSeconds: 15_552_000, includeSubDomains: false },
	},
})
```

TLS and HTTP/2 come from the proxy or platform in front of the server; HTTPS is
recognized from the request URL or, behind `trustProxy`, from
`X-Forwarded-Proto`.

## Master

`master: true` enables only the canonical `X-UltimaBase-Master-Key` header.
The plugin then requests `authority:elevate`, passes that raw value directly to
the selected application's configured `MasterAuthority`, and continues only
after its audit succeeds. A missing header remains anonymous. Invalid,
duplicate, disabled, foreign, unaudited, or authority-less Master attempts fail
before route behavior. Query parameters, body fields, alternative headers,
grants, contexts, privileges, and `useMasterKey` never select Master.

## Configure browser origins (CORS)

```ts
httpPlugin({
	browser: { origins: ['https://app.example.com'], credentials: true },
})
```

CORS is off unless `browser.origins` lists exact serialized origins, or `'*'`
without credentials. Allowed methods come from the mounted routes (every
method when a mount exists) and allowed headers from the installed plugins:
`Content-Type`, `X-UltimaBase-Application-Id` and `X-UltimaBase-Request-Id`
always, `Authorization` when a credential plugin is installed (never with
`'*'`), and `X-UltimaBase-Master-Key` only with `master: true`.
`maxAgeSeconds` (600 by default) sets the browser preflight cache.
`ultimabase.plugin(httpPlugin).browser` exposes the effective policy.

An accepted browser preflight is answered without application identity
validation, context resolution, credential verification, Master audit, route
dispatch, Runtime, hooks, policy, or persistence. Without a policy a preflight
is refused with `HTTP_CORS_DISABLED` (403) and the message
`CORS is not enabled: configure browser.origins`.

`origins: '*'` is permitted only without credentials or Master transport.
Exact origins are reflected only after matching, preflight and
origin-dependent responses emit the appropriate `Vary` fields, and one layer
must own all CORS headers. A route response that also emits CORS while
UltimaBase owns the browser policy fails safely.

CORS is a browser response policy. It is not authentication, authorization,
CSRF protection, or a defense against non-browser clients.

## Rate limiting and proxies

```ts
httpPlugin({
	trustProxy: 1,
	rateLimit: { default: { perMinute: 300 } },
})
```

Limits count requests per client address and minute; a refused request gets
`HTTP_RATE_LIMITED` (429) with `Retry-After`. Without `trustProxy` the client
is the socket peer. Behind proxies, `trustProxy` is the number of proxy hops,
or their exact addresses: the client is then the nearest untrusted
`X-Forwarded-For` entry, and `X-Forwarded-Proto` is believed only from a
trusted peer. Routes add stricter limits with `rateLimit: { perMinute }`, which
count in addition to the default. Counts live in memory per process; share
them with a store:

```ts
const store: HttpRateLimitStore = {
	increment: async (key, expiresAt) => {
		const count = await redis.incr(key)
		await redis.pexpireat(key, expiresAt)
		return count
	},
}
httpPlugin({ rateLimit: { default: { perMinute: 300 }, store } })
```

A failing store answers `HTTP_INTERNAL_ERROR`: limits never fail open.

## Access log

`accessLog: true` writes one `info` line per request through the application
logger: method, path, status, duration and request ID. Bodies, query strings,
headers and credentials are never logged.

## Test without a server

`ultimabase.plugin(httpPlugin).fetch(request)` runs a request through the same
path as a network request, CORS included, without a server or a port:

```ts
await ultimabase.start()
const response = await ultimabase
	.plugin(httpPlugin)
	.fetch(new Request('http://localhost/health'))
```

On the network path, servers pass the ordered original headers next to the
Fetch request so duplicated sensitive headers are refused. A request that
reaches it with headers but no originals, such as an existing Hono app served
without Node's `rawHeaders`, is refused with `HTTP_BAD_REQUEST` and a message
naming both fixes.

## Contribute request context

Credential plugins contribute ordered resolvers without introducing a new Core
authority mode. A resolver receives the current anonymous context and a
credential-only request view, then returns an immutable derivative made with
`withValue()`:

```ts
import { RequestContextValue } from '@ultimabase/core'
import { plugin } from '@ultimabase/core/plugin'
import {
	httpContextResolver,
	provideHttpContextResolvers,
} from '@ultimabase/http-plugin'

const principal = new RequestContextValue('example.principal', (value) => {
	if (typeof value !== 'object' || value === null) {
		throw new TypeError('Principal must be an object')
	}
	return Object.freeze(value)
})

const credentials = plugin({
	id: 'example.credentials',
	version: '1.0.0',
	core: '^0.0.0',
	contributions: [
		provideHttpContextResolvers({
			contributionId: 'bearer',
			create: () =>
				httpContextResolver({
					resolve: async ({ context, request }) => {
						const value = await verifyBearer(
							request.headers.get('Authorization'),
						)
						return context.withValue(principal, value)
					},
				}),
		}),
	],
})
```

Resolvers run in plugin graph and registration order under their exact owners.
They may add their own validated values, but cannot replace request identity,
source, signal, metadata, capabilities, application lineage, or anonymous Core
authority. Master verification runs after resolvers so a valid Master context
retains those safe derived values. Master credentials are hidden from resolvers;
all credential headers are hidden from route handlers.

The resolver input also carries the exact immutable effective `browserPolicy`,
derived methods and headers included.
A resolver with browser-specific safety requirements can validate that policy
once, before the HTTP application is materialized, and use the same value for
request proofs:

```ts
httpContextResolver({
	validateBrowserPolicy: (policy) => {
		if (!policy.enabled || policy.origins === '*') {
			throw new TypeError('Exact browser origins are required')
		}
	},
	resolve: ({ browserPolicy, context, request }) => {
		// Check concrete credential proofs against browserPolicy, then derive context.
		return context
	},
})
```

This keeps the effective HTTP policy as the only source of truth. A credential
plugin does not require the browser-policy capability back from HTTP and cannot
create a capability cycle.

## Contribute routes and mounts

Protocol plugins provide endpoints through the versioned application
capability. Every provider requests `transport:expose`; Core retains its exact
plugin and optional instance identity:

```ts
import { plugin } from '@ultimabase/core/plugin'
import {
	httpMount,
	httpRoute,
	provideHttpEndpoints,
} from '@ultimabase/http-plugin'

const routes = provideHttpEndpoints({
	contributionId: 'status-routes',
	create: () => [
		httpRoute({
			method: 'GET',
			path: '/status',
			protocol: { name: 'example.status', version: '1' },
			handle: () => Response.json({ ready: true }),
		}),
		httpMount({
			path: '/custom',
			protocol: { name: 'example.custom', version: '1' },
			handle: (request) => new Response(request.url),
		}),
	],
})

const statusPlugin = plugin({
	id: 'example.status',
	version: '1.0.0',
	core: '^0.0.0',
	contributions: [routes],
})
```

Routes use one exact uppercase method and absolute path. Mounts own a complete
path subtree. Both accept `bodyLimit` and `rateLimit` (ADR-0323), and every
handler receives `(request, { context })`. A route identity collision, overlapping mounts, or a route under
a mount fails while the application capability is materialized, before a
server can mutate listener state. Contributions remain ordered by plugin graph
and registration order.

Handlers receive a standard `Request` and return a standard `Response`. The
HTTP application re-enters every handler under the contribution's exact owner;
one protocol cannot borrow the HTTP plugin's privileges.

After a handler begins, that protocol owns its success and error body. HTTP
only applies the final correlation and privacy metadata: it replaces
`X-UltimaBase-Request-Id` with the validated request ID and enforces
`Cache-Control: private, no-store`. A configured deadline that expires before
completion still replaces the handler outcome with the protocol-neutral
`HTTP_REQUEST_TIMEOUT` response.

### Routes for `definePlugin`

`httpRoutes` contributes the routes of the calling plugin from one object,
keyed by `"<METHOD> /<path>"`; each route's protocol identity is its key. It
returns an ordinary provider, so it fits `definePlugin`'s `contributions` as
well as a raw `plugin()` list (ADR-0316):

```ts
import { httpRoutes } from '@ultimabase/http-plugin'
import { definePlugin } from '@ultimabase/plugin-kit'

export const statusPlugin = () =>
	definePlugin({
		name: '@community/status',
		contributions: [
			httpRoutes({ 'GET /status': () => Response.json({ status: 'ok' }) }),
		],
	})
```

A malformed key or a missing handler fails when the plugin is defined.
Applications pass the same record to `httpPlugin({ routes })`.

## Implement a server provider

Server plugins require `httpApplicationCapability` and
`httpBrowserPolicyCapability`. The application value contains the
public `appId`, safe Master-enabled and deadline configuration, protocol and
original-header requirements, immutable route graph, and one Fetch-compatible
dispatcher. It never exposes an UltimaBase application, Runtime engine,
adapter, `MasterAuthority`, grant, or lifecycle control.

Server plugins also provide `httpServerCapability` with their package name
(`{ name: '@acme/server-plugin' }`). `httpPlugin()` reads these announcements
at setup and logs one `warn` line when routes other than the built-in health
route exist but no server plugin is installed (ADR-0313). Both HTTP capabilities carry the hint
`Install @ultimabase/http-plugin and add httpPlugin() to UltimaBase.use(...).`,
appended to `PLUGIN_CAPABILITY_MISSING` when a server plugin is installed
without HTTP.

Providers keep one optional `HttpApplication` owner. Capability composition
validates its protocol version and ordered original-header contract before
server setup. A competing application is rejected before listener effects;
complete disposal allows a later application to reuse the provider.

Use the shared safe dispatcher, including when no application is available:

```ts
import {
	dispatchHttpApplicationRequest,
	type HttpApplication,
} from '@ultimabase/http-plugin'

let activeApplication: HttpApplication | undefined = httpApplication
const response = await dispatchHttpApplicationRequest(activeApplication, {
	request: new Request('http://localhost/status'),
	originalHeaders: [['X-UltimaBase-Application-Id', 'blog']],
})

// Close admission before teardown; an external listener may stay open.
activeApplication = undefined
```

Before constructing Fetch `Headers`, the provider captures ordered original
header pairs, and passes the socket peer as `remoteAddress` for rate limiting. With an owner, dispatch enters its `fetch()` boundary. Without
one, requests still validate those pairs and request IDs before receiving the
same safe rejection envelope. Providers retain their exact listener ownership:
framework-owned listeners drain and close, while external listeners remain
under the developer's control. `HttpServerOwnership` names those two modes.

A normalized `Headers` object alone cannot prove that a sensitive header did
not occur twice. Duplicate application ID, Master, Authorization, Cookie,
Content-Length, or request-ID evidence therefore returns `HTTP_BAD_REQUEST`
before application behavior. A different application ID returns
`HTTP_APPLICATION_UNKNOWN`; a missing one under `requireApplicationId`, or
rejected credentials, return `HTTP_APPLICATION_REJECTED`; unknown routes return
`HTTP_NOT_FOUND`; oversized bodies `HTTP_PAYLOAD_TOO_LARGE`; rate limits
`HTTP_RATE_LIMITED`; deadlines `HTTP_REQUEST_TIMEOUT`; a preflight without
CORS `HTTP_CORS_DISABLED`; and other pre-dispatch failures
`HTTP_INTERNAL_ERROR`. Every early response uses the stable JSON envelope,
`Cache-Control: private, no-store`, and a validated or generated
`X-UltimaBase-Request-Id`.

A route handler that throws a Core `PublicError` receives a `400` response
with the same envelope carrying its `code`, `message` and `details`
(ADR-0305); its cause is never serialized. Any other handler failure keeps
propagating to the server provider.

## Lifecycle and isolation

The HTTP application capability is materialized once per UltimaBase
application and disposed with it. Endpoint factories receive only declared
capabilities and the compiled schema registry. Callback ownership and Core's
narrow application request executor remain private inside the application
resource.

Importing this package has no effect. Without `httpPlugin()`, Core creates no
HTTP application capability, route graph, request context,
listener, or transport diagnostic.

## Not yet provided

ETag and conditional requests, OpenTelemetry tracing, servers for Bun, Deno and
Workers, a plugin taking over a connection (Realtime: WebSocket, SSE) and
`multipart` bodies (Files) come later; the HTTP foundation keeps room for them.
