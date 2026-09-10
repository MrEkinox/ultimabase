# `@ultimabase/graphql-yoga-plugin`

The official GraphQL-over-HTTP adapter for UltimaBase. It mounts the final
application-local schema from `@ultimabase/graphql-plugin` through the shared
Fetch application from `@ultimabase/http-plugin`.

It also provides `graphqlHttpEndpointCapability` from
`@ultimabase/graphql-http`. Provider-neutral developer tools can discover the
configured path without importing Yoga or choosing among endpoints.

The package does not install GraphQL, HTTP, authentication, or a server. The
application must configure those sibling plugins explicitly:

```ts
import { UltimaBase } from '@ultimabase/core'
import { graphqlPlugin } from '@ultimabase/graphql-plugin'
import { graphqlYogaPlugin } from '@ultimabase/graphql-yoga-plugin'
import { httpPlugin } from '@ultimabase/http-plugin'
import { honoServerPlugin } from '@ultimabase/server-hono-plugin'

const ultimabase = new UltimaBase({
	plugins: [
		httpPlugin({ appId: 'notes' }),
		graphqlPlugin(),
		graphqlYogaPlugin(),
		honoServerPlugin(),
	],
	schemas: [],
})
```

`graphqlYogaPlugin()` mounts `POST /graphql` by default. It accepts only UTF-8
JSON GraphQL requests, rejects batching, uploads, subscriptions, SSE, and the
built-in GraphiQL UI, and limits streamed request bodies to 1 MiB. HTTP
introspection is disabled unless `introspection: true` is configured.

```ts
graphqlYogaPlugin({
	bodyLimit: 512 * 1024,
	introspection: true,
	path: '/api/graphql',
})
```

The HTTP plugin selects the application, resolves its request context and
credentials, and exchanges an enabled Master key before Yoga runs. Yoga sees
only that active context and delegates execution to the same narrow GraphQL
application capability used by networkless execution.

Virtual fields require no Yoga-specific resolver or configuration. Their
selection, request-aware asynchronous resolution, output validation, Access,
Master behavior, cancellation, and mutation rollback stay in Core; Yoga only
delivers the resulting GraphQL response through the selected HTTP application.
