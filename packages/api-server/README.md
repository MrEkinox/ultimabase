# @ultimabase/api-server

One package for the API part of an application: `apiServer(options)` returns the
HTTP, REST, GraphQL, Yoga, explorer and Hono plugins its options select, each
configured with its own options. It is a preset, not a plugin.

## Installation

```sh
npm install @ultimabase/api-server @ultimabase/core
```

`@ultimabase/core` is a peer dependency. The application also needs a database
plugin.

## Example

Install it in the configured factory, from the tested
[`examples/http`](../../examples/http/README.md) application:

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
	apiServer({
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

## Documentation

- [GraphQL: configuration](../../apps/website/content/docs/1.0.0/plugins/official/graphql.mdx#configuration)
- [HTTP](../../apps/website/content/docs/1.0.0/plugins/official/http.mdx)
- [REST](../../apps/website/content/docs/1.0.0/plugins/official/rest.mdx)
- [Hono Server](../../apps/website/content/docs/1.0.0/plugins/official/hono-server.mdx)
