# @ultimabase/http-plugin

Optional Fetch-compatible HTTP application boundary for UltimaBase.

The package owns public application IDs, immutable route and mount composition,
original-header evidence, and the application graph consumed by server
providers. It does not open a socket or depend on Hono, REST, GraphQL,
authentication, or a database.

Every code block in this README, except the server provider sketch, is copied
from the tested [`examples/http`](../../examples/http/README.md) application by
`yarn docs:regions` (ADR-0330): edit the example, then run the script.

## Install the HTTP foundation

`httpPlugin()` needs no option (ADR-0323). The example's API sets most of them:

<!-- region ../../examples/http/src/http.ts#http-options -->

```ts
/** Every option of the HTTP foundation is optional; these are this API's. */
export const http = {
	appId: 'links',
	browser,
	// One reverse proxy in front: it appends the client to `X-Forwarded-For`
	// and tells the protocol in `X-Forwarded-Proto`.
	trustProxy: 1,
	rateLimit,
	bodyLimit: 262_144, // 256 KiB for every route without its own limit.
	requestTimeoutMs: 10_000,
	securityHeaders,
	// Operators send the Master key header; MasterAuthority verifies it.
	master: true,
	routes,
	accessLog: true,
} satisfies HttpPluginOptions
```

<!-- endregion -->

`apiServer({ http })` from `@ultimabase/api-server` installs
`httpPlugin(http)` with REST and the Hono server;
`UltimaBase.use(httpPlugin(http))` installs it alone. The defaults:

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
| `routes`               | none                                                       |
| `rateLimit`            | none; `trustProxy` unset, so the socket peer is the client |
| `accessLog`            | `false`                                                    |

## Application identity

`appId` is public and grants no authority. A request without
`X-UltimaBase-Application-Id` reaches the only application of the process, so
existing Parse-style clients and plain `curl` work. A request whose header
names a different application is refused:

<!-- region ../../examples/http/tests/identity.test.ts#unknown-application -->

```ts
const response = await t.fetch('/status', {
	headers: { 'X-UltimaBase-Application-Id': 'billing' },
})
```

<!-- endregion -->

The answer is `HTTP_APPLICATION_UNKNOWN` (404). Several applications behind one
proxy set `requireApplicationId: true`: a missing header is then refused with
`HTTP_APPLICATION_REJECTED` (401).

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

<!-- region ../../examples/http/src/routes.ts#routes -->

```ts
/**
 * Application routes need no plugin. Each handler receives the Fetch request
 * and the request context, already active.
 */
export const routes = {
	'GET /status': (_request, { context }) =>
		Response.json({
			mode: context.access.mode,
			partner: context.getValue(partner)?.name ?? null,
		}),
	// A public form: small bodies, and five messages a minute per client.
	'POST /contact': {
		bodyLimit: 8_192,
		rateLimit: { perMinute: 5 },
		handle: async (request) => {
			// A PublicError answers 400 with its code, message and details.
			const contact = readContactMessage(await request.json())
			inbox.push(contact)
			return Response.json({ received: true }, { status: 202 })
		},
	},
} satisfies HttpRouteRecord
```

<!-- endregion -->

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

<!-- region ../../examples/http/src/http.ts#security-headers -->

```ts
/** The web application frames its own pages; HSTS keeps its defaults. */
export const securityHeaders = {
	frameOptions: 'SAMEORIGIN',
} satisfies HttpSecurityHeadersOptions
```

<!-- endregion -->

`hsts: { maxAgeSeconds, includeSubDomains }` tunes Strict-Transport-Security,
and `false` removes one header. TLS and HTTP/2 come from the proxy or platform
in front of the server; HTTPS is recognized from the request URL or, behind
`trustProxy`, from `X-Forwarded-Proto`.

## Master

`master: true` enables only the canonical `X-UltimaBase-Master-Key` header.
The plugin then requests `authority:elevate`, passes that raw value directly to
the selected application's configured `MasterAuthority`, and continues only
after its audit succeeds:

<!-- region ../../examples/http/src/ultimabase.ts#application -->

```ts
import { MasterAuthority } from '@ultimabase/core'

import { readSecret } from './env.ts'
import { App, Link } from './schema.ts'

export const ultimabase = new App({
	// `httpPlugin({ master: true })` hands the header to this authority.
	masterAuthority: new MasterAuthority({
		keys: [{ id: 'operations', value: readSecret('ULTIMABASE_MASTER_KEY') }],
		onUse: (event) => {
			// Replace this console record with a durable audit sink in production.
			console.info('Master authority used', event.reason)
		},
	}),
	schemas: [Link],
})

// One declaration per application gives name-keyed editor types (ADR-0297).
declare module '@ultimabase/core' {
	interface Register {
		readonly app: typeof ultimabase
	}
}
```

<!-- endregion -->

<!-- region ../../examples/http/tests/identity.test.ts#master-request -->

```ts
const response = await t.fetch('/api/classes/Link', {
	method: 'POST',
	headers: {
		'content-type': 'application/json',
		'X-UltimaBase-Master-Key': masterKey,
	},
	body: JSON.stringify({
		url: 'https://ultimabase.dev',
		title: 'UltimaBase',
	}),
})
```

<!-- endregion -->

A missing header remains anonymous. Invalid, disabled, foreign, unaudited, or
authority-less Master attempts fail with `HTTP_APPLICATION_REJECTED`, and a
duplicated header with `HTTP_BAD_REQUEST`, before route behavior. Query parameters, body
fields, alternative headers, grants, contexts, privileges, and `useMasterKey`
never select Master. Never send the Master key from browser code.

## Configure browser origins (CORS)

<!-- region ../../examples/http/src/http.ts#browser -->

```ts
/**
 * Pages of the web application call the API from this origin, with
 * cookies (CORS). Allowed methods and headers come from the installed
 * routes and plugins.
 */
export const browser = {
	origins: ['https://links.example.com'],
	credentials: true,
} satisfies HttpBrowserPolicyOptions
```

<!-- endregion -->

CORS is off unless `browser.origins` lists exact serialized origins, or `'*'`
without credentials. Allowed methods come from the mounted routes (every
method when a mount exists) and allowed headers from the installed plugins:
`Content-Type`, `X-UltimaBase-Application-Id` and `X-UltimaBase-Request-Id`
always, `Authorization` when a credential plugin is installed (never with
`'*'`), and `X-UltimaBase-Master-Key` only with `master: true`.
`maxAgeSeconds` (600 by default) sets the browser preflight cache. The plugin
exports the effective policy:

<!-- region ../../examples/http/tests/browser.test.ts#effective-policy -->

```ts
const policy = ultimabase.plugin(httpPlugin).browser
```

<!-- endregion -->

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
CSRF protection, or a defense against non-browser clients: a request from
another origin is still answered, only without the CORS headers its browser
needs.

## Rate limiting and proxies

<!-- region ../../examples/http/src/http.ts#rate-limit -->

```ts
/**
 * 300 requests a minute per client address, counted in a shared store;
 * the health route is never limited.
 */
export const rateLimit = {
	default: { perMinute: 300 },
	store,
} satisfies HttpRateLimitOptions
```

<!-- endregion -->

Limits count requests per client address and minute; a refused request gets
`HTTP_RATE_LIMITED` (429) with `Retry-After`. Without `trustProxy` the client
is the socket peer. Behind proxies, `trustProxy` is the number of proxy hops,
or their exact addresses: the client is then the nearest untrusted
`X-Forwarded-For` entry, and `X-Forwarded-Proto` is believed only from a
trusted peer. Entries a client writes before the ones your proxies append
never change the address that is counted. Behind a fetch handler without a
socket peer, as on edge and serverless platforms, the platform in front counts
as one hop; exact addresses are checked against the socket peer, so they need
one. When neither names the client, as with the in-memory `fetch`, its address
is unknown: every such request shares one bucket per limit (failing closed is
safer than skipping the limit), and the first one of a process logs one
warning pointing to `trustProxy` and the server provider's `remoteAddress`
([ADR-0334](../../docs/adr/0334-unknown-client-address.md)). Routes add stricter limits with `rateLimit: { perMinute }`, which count
in addition to the default. The built-in health route is never limited: load
balancers and Kubernetes probes often share one address, and a 429 would make
the service look down.

Counts live in memory per process; share them with a store, such as Redis
`INCR` and `PEXPIREAT`:

<!-- region ../../examples/http/src/counters.ts#store -->

```ts
/** Counts requests in Redis: every process shares the same limits. */
export const store: HttpRateLimitStore = {
	increment: async (key, expiresAt) => {
		const count = await redis.incr(key)
		await redis.pexpireat(key, expiresAt)
		return count
	},
}
```

<!-- endregion -->

A failing store answers `HTTP_INTERNAL_ERROR`: limits never fail open.

## Access log

`accessLog: true` writes one `info` line per request through the application
logger: method, path, status, duration and request ID. Bodies, query strings,
headers and credentials are never logged.

## Test without a server

`ultimabase.plugin(httpPlugin).fetch(request)` runs a request through the same
path as a network request, CORS included, without a server or a port:

<!-- region ../../examples/http/tests/routes.test.ts#fetch -->

```ts
const response = await ultimabase
	.plugin(httpPlugin)
	.fetch(new Request('http://localhost/health'))
```

<!-- endregion -->

The application must be started first; `testApplication()` from
`@ultimabase/testing` starts it, and its `t.fetch(path, init)` sends the same
requests.

On the network path, servers pass the ordered original headers next to the
Fetch request so duplicated sensitive headers are refused. A request that
reaches it with headers but no originals, such as an existing Hono app served
without Node's `rawHeaders`, is refused with `HTTP_BAD_REQUEST` and a message
naming both fixes.

## Contribute request context

Credential plugins contribute ordered resolvers without introducing a new Core
authority mode. A resolver receives the current anonymous context, the client
address (`undefined` when unknown), the effective browser policy and a credential-only request view, then
returns an immutable derivative made with `withValue()`; a resolver that
throws refuses the request with `HTTP_APPLICATION_REJECTED`:

<!-- region ../../examples/http/src/partners.ts#partner-credentials -->

```ts
import { createHash, timingSafeEqual } from 'node:crypto'

import { RequestContextValue, plugin } from '@ultimabase/core/plugin'
import {
	httpContextResolver,
	provideHttpContextResolvers,
} from '@ultimabase/http-plugin'

/** The partner a request authenticated as, read by route handlers. */
export const partner = new RequestContextValue<Readonly<{ name: string }>>(
	'example.partner',
	(value) => {
		const name: unknown =
			typeof value === 'object' && value !== null
				? Reflect.get(value, 'name')
				: undefined
		if (typeof name !== 'string') throw new TypeError('Partner needs a name')
		return Object.freeze({ name })
	},
)

const digest = (token: string): Buffer =>
	createHash('sha256').update(token).digest()

/**
 * Signs partner integrations in with `Authorization: Bearer <token>`. A
 * request without the header stays anonymous; an unknown token is refused
 * with `HTTP_APPLICATION_REJECTED` before any route runs.
 */
export const partnerCredentials = (
	tokens: Readonly<Record<string, string>>,
) => {
	const partners = Object.entries(tokens).map(([name, token]) => ({
		name,
		digest: digest(token),
	}))
	return plugin({
		id: 'example.partner-credentials',
		version: '1.0.0',
		core: '^0.0.0',
		contributions: [
			provideHttpContextResolvers({
				contributionId: 'partner-bearer',
				create: () =>
					httpContextResolver({
						// Checked once, before the application serves a request.
						validateBrowserPolicy: (policy) => {
							if (policy.enabled && policy.origins === '*') {
								throw new TypeError('Partner tokens need exact browser origins')
							}
						},
						resolve: ({ context, request }) => {
							const header = request.headers.get('Authorization')
							if (header === null) return context
							const presented = digest(header.replace(/^Bearer /u, ''))
							const match = partners.find((candidate) =>
								timingSafeEqual(candidate.digest, presented),
							)
							if (match === undefined) throw new TypeError('Unknown partner')
							return context.withValue(partner, { name: match.name })
						},
					}),
			}),
		],
	})
}
```

<!-- endregion -->

Resolvers run in plugin graph and registration order under their exact owners.
They may add their own validated values, but cannot replace request identity,
source, signal, metadata, capabilities, application lineage, or anonymous Core
authority. Master verification runs after resolvers so a valid Master context
retains those safe derived values. Master credentials are hidden from resolvers;
all credential headers are hidden from route handlers, which read the values
the resolvers derived instead:

<!-- region ../../examples/http/tests/identity.test.ts#partner-request -->

```ts
const response = await t.fetch('/status', {
	headers: { Authorization: `Bearer ${partnerToken}` },
})
```

<!-- endregion -->

`/status` answers `{ "mode": "anonymous", "partner": "acme" }`.

`browserPolicy` is the exact immutable effective policy, derived methods and
headers included. `validateBrowserPolicy` checks it once, before the HTTP
application is materialized, and `resolve` can use the same value for request
proofs. This keeps the effective HTTP policy as the only source of truth. A
credential plugin does not require the browser-policy capability back from
HTTP and cannot create a capability cycle.

## Contribute routes and mounts

Protocol plugins provide endpoints through the versioned application
capability. Every provider requests `transport:expose`; Core retains its exact
plugin and optional instance identity. `httpRoutes` takes the record of
`httpPlugin({ routes })`, each route's protocol identity being its key, and
`provideHttpEndpoints` contributes `httpRoute()` and `httpMount()` definitions;
both fit `definePlugin`'s `contributions` as well as a raw `plugin()` list
(ADR-0316):

<!-- region ../../examples/http/src/api-info-plugin.ts#api-info-plugin -->

```ts
import {
	httpMount,
	httpRoutes,
	provideHttpEndpoints,
} from '@ultimabase/http-plugin'
import { definePlugin } from '@ultimabase/plugin-kit'

/**
 * A plugin contributes routes like an application does, and mounts that own
 * a whole path subtree. Both run under this plugin's identity.
 */
export const apiInfoPlugin = () =>
	definePlugin({
		name: '@example/api-info',
		contributions: [
			// The same record as `httpPlugin({ routes })`.
			httpRoutes({ 'GET /version': () => Response.json({ api: '2' }) }),
			// Every path below `/v1` answers that the first API is retired.
			provideHttpEndpoints({
				contributionId: 'retired-v1',
				create: () => [
					httpMount({
						path: '/v1',
						protocol: { name: 'example.retired-v1', version: '1' },
						handle: () =>
							Response.json(
								{ error: { code: 'API_RETIRED', message: 'Use /api.' } },
								{ status: 410 },
							),
					}),
				],
			}),
		],
	})
```

<!-- endregion -->

Routes use one exact uppercase method and absolute path. Mounts own a complete
path subtree. Both accept `bodyLimit` and `rateLimit` (ADR-0323), and every
handler receives `(request, { context })`. A malformed key or a missing handler
fails when the plugin is defined. A route identity collision, overlapping
mounts, or a route under a mount fails while the application capability is
materialized, before a server can mutate listener state. Contributions remain
ordered by plugin graph and registration order.

Handlers receive a standard `Request` and return a standard `Response`. The
HTTP application re-enters every handler under the contribution's exact owner;
one protocol cannot borrow the HTTP plugin's privileges.

After a handler begins, that protocol owns its success and error body. HTTP
only applies the final correlation and privacy metadata: it replaces
`X-UltimaBase-Request-Id` with the validated request ID and enforces
`Cache-Control: private, no-store`. A configured deadline that expires before
completion still replaces the handler outcome with the protocol-neutral
`HTTP_REQUEST_TIMEOUT` response.

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

Use the shared safe dispatcher, including when no application is available.
This sketch is not run: `httpApplication` comes from the provider's
capability and `socket` from its listener; the official
[Hono server plugin](../hono-server-plugin/README.md) is a complete provider:

```ts unverified
import {
	dispatchHttpApplicationRequest,
	type HttpApplication,
} from '@ultimabase/http-plugin'

let activeApplication: HttpApplication | undefined = httpApplication
const response = await dispatchHttpApplicationRequest(activeApplication, {
	request: new Request('http://localhost/status'),
	originalHeaders: [['X-UltimaBase-Application-Id', 'blog']],
	remoteAddress: socket.remoteAddress,
})

// Close admission before teardown; an external listener may stay open.
activeApplication = undefined
```

Before constructing Fetch `Headers`, the provider captures ordered original
header pairs, and passes the socket peer as `remoteAddress` for rate limiting;
without it, and without `trustProxy`, the client address is unknown.
With an owner, dispatch enters its `fetch()` boundary. Without one, requests
still validate those pairs and request IDs before receiving the same safe
rejection envelope (`HTTP_APPLICATION_REJECTED`). Providers retain their exact
listener ownership: framework-owned listeners drain and close, while external
listeners remain under the developer's control. `HttpServerOwnership` names
those two modes.

A normalized `Headers` object alone cannot prove that a sensitive header did
not occur twice. Duplicate application ID, Master, Authorization, Cookie,
Content-Length, or request-ID evidence therefore returns `HTTP_BAD_REQUEST`
before application behavior. A different application ID returns
`HTTP_APPLICATION_UNKNOWN`; a missing one under `requireApplicationId`, or
rejected credentials, return `HTTP_APPLICATION_REJECTED`; unknown routes return
`HTTP_NOT_FOUND`; oversized bodies `HTTP_PAYLOAD_TOO_LARGE`; rate limits
`HTTP_RATE_LIMITED`; deadlines `HTTP_REQUEST_TIMEOUT`; a preflight without
CORS `HTTP_CORS_DISABLED`; and other pre-dispatch failures
`HTTP_INTERNAL_ERROR`. Every early response uses the stable JSON envelope
`{ "error": { "code", "message", "requestId", "retryable": false } }`,
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
