# @ultimabase/http-plugin

Optional Fetch-compatible HTTP application boundary for UltimaBase.

The package owns public application IDs, immutable route and mount composition,
original-header evidence, and the application graph consumed by server
providers. It does not open a socket or depend on Hono, REST, GraphQL,
authentication, or a database.

## Install the application boundary

```ts
import { UltimaBase } from '@ultimabase/core'
import { httpPlugin } from '@ultimabase/http-plugin'

const ultimabase = new UltimaBase({
	plugins: [
		httpPlugin({
			appId: 'blog',
			browser: {
				allowedOrigins: ['https://console.example'],
				allowedMethods: ['GET', 'POST'],
				allowedHeaders: [
					'X-UltimaBase-Application-Id',
					'Authorization',
					'Content-Type',
					'X-UltimaBase-Request-Id',
				],
				credentials: true,
				maxAgeSeconds: 600,
			},
			master: { enabled: true },
			requestTimeoutMs: 15_000,
		}),
	],
	schemas: [],
})
```

`appId` is required, public, and non-empty. It identifies the expected sole
active application and grants no authority. Every public application request must
carry exactly one original occurrence of:

```http
X-UltimaBase-Application-Id: blog
```

The only application-behavior exception is an exact `GET` route created with
`httpBrowserBootstrapRoute()`. A browser may open it at
`/__ultimabase/apps/{encodeURIComponent(appId)}{routePath}`. The application fetch boundary
accepts the path-carried ID only after confirming that exact application owns
that exact bootstrap route, then resumes the complete normal context,
credential, timeout, attribution, and response boundary. The reserved
`/__ultimabase/apps` namespace cannot be used by ordinary routes or mounts.

Every accepted route begins with a new anonymous, application-bound Core
context. `requestTimeoutMs` optionally composes one deadline with the Fetch
signal; the resulting signal is shared by resolvers, handlers, Runtime work,
transactions, and response completion.

`master: { enabled: true }` enables only the canonical
`X-UltimaBase-Master-Key` header. The plugin then requests
`authority:elevate`, passes that raw value directly to the selected
application's configured `MasterAuthority`, and continues only after its audit
succeeds. A missing header remains anonymous. Invalid, duplicate, disabled,
foreign, unaudited, or authority-less Master attempts fail before route
behavior. Query parameters, body fields, alternative headers, grants, contexts,
privileges, and `useMasterKey` never select Master.

## Configure browser origins

Browser-origin behavior is disabled unless `browser` supplies all five policy
fields. Origins are exact serialized origins, methods use the supported
uppercase HTTP methods, header names are compared case-insensitively, and
`maxAgeSeconds` controls the browser preflight cache. Because every real public
request still identifies the application, `allowedHeaders` must include
`X-UltimaBase-Application-Id`. Add `Authorization`, `Content-Type`,
`X-UltimaBase-Request-Id`, or `X-UltimaBase-Master-Key` only when browser
clients actually send those headers.

An accepted browser preflight carries no application ID. The server evaluates
only the configured origin, requested method, requested header names, and cache
lifetime, then returns without application identity validation, context resolution,
credential verification, Master audit, route dispatch, Runtime, hooks, policy,
or persistence. The following real request must still include its exact
application ID and pass the normal credential and Runtime boundaries.

`allowedOrigins: '*'` is permitted only without credentials, cookies,
Authorization, or enabled Master transport. Exact origins are reflected only
after matching, preflight and origin-dependent responses emit the appropriate
`Vary` fields, and one layer must own all CORS headers. A route response that
also emits CORS while UltimaBase owns the browser policy fails safely.

CORS is a browser response policy. It is not authentication, authorization,
CSRF protection, or a defense against non-browser clients.

## Contribute request context

Credential plugins contribute ordered resolvers without introducing a new Core
authority mode. A resolver receives the current anonymous context and a
credential-only request view, then returns an immutable derivative made with
`withValue()`:

```ts
import { RequestContextValue, plugin } from '@ultimabase/core'
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

The resolver input also carries the exact immutable effective `browserPolicy`.
A resolver with browser-specific safety requirements can validate that policy
once, before the HTTP application is materialized, and use the same value for
request proofs:

```ts
httpContextResolver({
	validateBrowserPolicy: (policy) => {
		if (!policy.enabled || policy.allowedOrigins === '*') {
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
import { plugin } from '@ultimabase/core'
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
	permissions: {
		'transport:expose': 'Exposes the selected status routes over HTTP.',
	},
	contributions: [routes],
})
```

Routes use one exact uppercase method and absolute path. Mounts own a complete
path subtree. A route identity collision, overlapping mounts, or a route under
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

## Implement a server provider

Server plugins require `httpApplicationCapability` and
`httpBrowserPolicyCapability`. The application value contains the
public `appId`, safe Master-enabled and deadline configuration, protocol and
original-header requirements, immutable route graph, and one Fetch-compatible
dispatcher. It never exposes an UltimaBase application, Runtime engine,
adapter, `MasterAuthority`, grant, or lifecycle control.

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
header pairs. With an owner, dispatch enters its `fetch()` boundary. Without
one, requests still validate those pairs and request IDs before receiving the
same safe rejection envelope. Providers retain their exact listener ownership:
framework-owned listeners drain and close, while external listeners remain
under the developer's control. `HttpServerOwnership` names those two modes.

A normalized `Headers` object alone cannot prove that a sensitive header did
not occur twice. Duplicate application ID, Master, Authorization, Cookie,
Content-Length, or request-ID evidence therefore returns `HTTP_BAD_REQUEST`
before application behavior. Missing or unknown application identity returns
`HTTP_APPLICATION_REJECTED`; unknown routes return `HTTP_NOT_FOUND`; deadlines
return `HTTP_REQUEST_TIMEOUT`; and other pre-dispatch failures return
`HTTP_INTERNAL_ERROR`. Every early response uses the stable JSON envelope,
`Cache-Control: private, no-store`, and a validated or generated
`X-UltimaBase-Request-Id`.

## Lifecycle and isolation

The HTTP application capability is materialized once per UltimaBase
application and disposed with it. Endpoint factories receive only declared
capabilities and the compiled schema registry. Callback ownership and Core's
narrow application request executor remain private inside the application
resource.

Importing this package has no effect. Without `httpPlugin()`, Core creates no
HTTP application capability, route graph, request context,
listener, or transport diagnostic.
