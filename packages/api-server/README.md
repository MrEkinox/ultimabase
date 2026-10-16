# `@ultimabase/api-server`

One package for the API part of an UltimaBase application (ADR-0325).
`apiServer(options)` only returns the list of plugins its options select, each
configured with its own option object; it hides no code, and every plugin
stays installable on its own.

Every code block in this README is copied from the tested
[`examples/http`](../../examples/http/README.md) application by
`yarn docs:regions` (ADR-0330): edit the example, then run the script.

<!-- region ../../examples/http/src/schema.ts#factory,link -->

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

/**
 * Saved links, served by REST under `/api/classes/Link`. Everyone reads
 * them; without a write rule, only Master requests write.
 */
export const Link = App.Schema.define({
	className: 'Link',
	fields: (field) => ({
		url: field.string({ required: true }),
		title: field.string(),
	}),
}).with({ access: { read: true } })
```

<!-- endregion -->

| Option             | Installs                                               | Value                                                               |
| ------------------ | ------------------------------------------------------ | ------------------------------------------------------------------- |
| `http`             | `httpPlugin(http)`, always                             | `httpPlugin` options                                                |
| `rest`             | `restPlugin(rest)`                                     | `true` or `restPlugin` options; omitted or `false`: not installed   |
| `graphql`          | `graphqlPlugin(…)`, `graphqlYogaPlugin(yoga)`          | `true` or `graphqlPlugin` options plus `yoga` (transport options)   |
| `graphql.explorer` | `graphqlExplorerPlugin(…)`, served in development only | `'graphiql'`, `'apollo-sandbox'` or `graphqlExplorerPlugin` options |
| `server`           | `honoServerPlugin(server)`                             | `honoServerPlugin` options; `false` to use another server plugin    |

`graphql: { explorer: 'graphiql' }` adds GraphQL with its in-browser explorer
in development, next to REST on the same HTTP foundation. The returned list is
typed entry by entry, so the configured factory keeps every plugin's
`plugins.rest(...)` and `plugins.graphql(...)` rules and
`ultimabase.plugin(...)` exports.
Installing the same plugins one by one gives the same application; the
example's second application does so, with its own Hono `app`:

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
