# `@ultimabase/api-server`

One package for the API part of an UltimaBase application (ADR-0325).
`apiServer(options)` only returns the list of plugins its options select, each
configured with its own option object; it hides no code, and every plugin
stays installable on its own.

```ts
import { UltimaBase } from '@ultimabase/core'
import { apiServer } from '@ultimabase/api-server'
import { postgresPlugin } from '@ultimabase/postgres-plugin'

export const App = UltimaBase.use(
	postgresPlugin(),
	...apiServer({
		rest: { openapi: true },
		graphql: { explorer: 'graphiql' },
		http: { browser: { origins: ['https://app.example.com'] } },
		server: { port: 3000 },
	}),
)
```

| Option             | Installs                                               | Value                                                               |
| ------------------ | ------------------------------------------------------ | ------------------------------------------------------------------- |
| `http`             | `httpPlugin(http)`, always                             | `httpPlugin` options                                                |
| `rest`             | `restPlugin(rest)`                                     | `true` or `restPlugin` options; omitted or `false`: not installed   |
| `graphql`          | `graphqlPlugin(…)`, `graphqlYogaPlugin(yoga)`          | `true` or `graphqlPlugin` options plus `yoga` (transport options)   |
| `graphql.explorer` | `graphqlExplorerPlugin(…)`, served in development only | `'graphiql'`, `'apollo-sandbox'` or `graphqlExplorerPlugin` options |
| `server`           | `honoServerPlugin(server)`                             | `honoServerPlugin` options; `false` to use another server plugin    |

The returned list is typed entry by entry, so the configured factory keeps
every plugin's `.with({ rest, graphql })` rules and `ultimabase.plugin(...)`
exports. Installing the same plugins one by one gives the same application:

```ts
UltimaBase.use(
	postgresPlugin(),
	httpPlugin(),
	restPlugin(),
	graphqlPlugin(),
	graphqlYogaPlugin(),
	honoServerPlugin(),
)
```
