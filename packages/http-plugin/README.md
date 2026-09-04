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
			master: { enabled: true },
			requestTimeoutMs: 15_000,
		}),
	],
	schemas: [],
})
```

`appId` is required, public, and non-empty. It selects one application on a
shared server but grants no authority. Every public application request must
carry exactly one original occurrence of:

```http
X-UltimaBase-Application-Id: blog
```

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

The browser-preflight exception is deliberately added by a later milestone-23
issue.

## Contribute request context

Credential plugins contribute ordered resolvers without introducing a new Core
authority mode. A resolver receives the current anonymous context and a
credential-only request view, then returns an immutable derivative made with
`withValue()`:

```ts
import { RequestContextValue, definePlugin } from '@ultimabase/core'
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

const credentials = definePlugin({
	pluginId: 'example.credentials',
	version: '1.0.0',
	core: '^0.0.0',
	capabilities: {
		provides: [
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
	},
})
```

Resolvers run in plugin graph and registration order under their exact owners.
They may add their own validated values, but cannot replace request identity,
source, signal, metadata, capabilities, application lineage, or anonymous Core
authority. Master verification runs after resolvers so a valid Master context
retains those safe derived values. Master credentials are hidden from resolvers;
all credential headers are hidden from route handlers.

## Contribute routes and mounts

Protocol plugins provide endpoints through the versioned application
capability. Every provider requests `transport:expose`; Core retains its exact
plugin and optional instance identity:

```ts
import { definePlugin } from '@ultimabase/core'
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

const statusPlugin = definePlugin({
	pluginId: 'example.status',
	version: '1.0.0',
	core: '^0.0.0',
	privileges: [
		{
			name: 'transport:expose',
			reason: 'Exposes the selected status routes over HTTP.',
		},
	],
	capabilities: { provides: [routes] },
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

## Implement a server provider

Server plugins require `httpApplicationCapability`. The value contains the
public `appId`, safe Master-enabled and deadline configuration, protocol and
original-header requirements, immutable route graph, and one Fetch-compatible
dispatcher. It never exposes an UltimaBase application, Runtime engine,
adapter, `MasterAuthority`, grant, or lifecycle control.

Providers keep their current table in their own explicit instance and replace
it only after `mount()` succeeds:

```ts
import {
	HttpApplicationMountTable,
	httpApplicationProtocolVersion,
	httpOriginalHeaderMode,
} from '@ultimabase/http-plugin'

let table = new HttpApplicationMountTable({
	applicationProtocolVersion: httpApplicationProtocolVersion,
	originalHeaderMode: httpOriginalHeaderMode,
	ownership: 'framework',
})

table = table.mount(httpApplication)
```

`ownership: 'framework'` means the provider owns its future listener lifecycle;
`'external'` means the developer does. Both modes consume the same exact route
graph. The table is immutable, so a duplicate app ID or incompatible candidate
cannot partially register an application or damage earlier mounts.

Before constructing Fetch `Headers`, the provider supplies ordered original
header pairs:

```ts
const response = await table.fetch({
	request: new Request('http://localhost/status'),
	originalHeaders: [['X-UltimaBase-Application-Id', 'blog']],
})
```

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
HTTP application capability, route graph, mount table, request context,
listener, or transport diagnostic.
