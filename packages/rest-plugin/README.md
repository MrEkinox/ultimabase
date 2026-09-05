# `@ultimabase/rest-plugin`

`@ultimabase/rest-plugin` owns the experimental REST v1 route graph. It reads
the complete compiled application schema registry and generates immutable,
application-local metadata under `/api/v1` by default. It does not parse
requests, execute Runtime, import Hono, or start listeners.

## Installation

```ts
import { Schema, UltimaBase } from '@ultimabase/core'
import { httpPlugin } from '@ultimabase/http-plugin'
import { restPlugin } from '@ultimabase/rest-plugin'

const Post = Schema.define({
	className: 'Post',
	rest: { count: true, upsert: true },
	fields: (field) => ({ title: field.string() }),
})

const ultimabase = new UltimaBase({
	plugins: [
		httpPlugin({ appId: 'blog' }),
		restPlugin({
			acknowledgeUnverifiedProtection: true,
			basePath: '/api',
		}),
	],
	schemas: [Post],
})
```

The `rest` schema option is available only when the plugin contributes it to
the compiled application graph. Omitted operation properties inherit the
plugin default and then the provenance-aware built-in default. Application
schemas enable find, get, first, exists, create, update, and delete by default;
count, upsert, and all bulk routes remain disabled.

Plugin-owned schemas are always private from generated REST CRUD routes. A
plugin-owned schema that declares `rest` is rejected because storage ownership
cannot be converted into public exposure.

## Route metadata

The setup export exposes one `RestRouteGraph` shared by every explicit REST
instance in the application. Each route retains its schema contribution,
plugin instance, application compilation, method, path, logical operation, and
protocol version. Item paths contain inert `{id}` metadata; request matching
and UUID-v7 validation belong to the later REST execution boundary.

Two explicit instances use `instanceId`. Distinct base paths compose into one
graph, while matching methods and paths fail with a deterministic collision
diagnostic.

Generated routes are public exposure, not authorization. Access, ACL,
authentication, and Master authority are configured independently. Unless the
developer passes `acknowledgeUnverifiedProtection: true`, starting an
application with generated routes uses Core's shared
`UNVERIFIED_PUBLIC_TRANSPORT_PROTECTION` diagnostic.
