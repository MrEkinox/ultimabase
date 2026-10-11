# `@ultimabase/graphql-yoga-plugin`

The official GraphQL-over-HTTP adapter for UltimaBase. It mounts the final
application-local schema from `@ultimabase/graphql-plugin` through the shared
Fetch application from `@ultimabase/http-plugin`.

It also provides `graphqlHttpEndpointCapability` from
`@ultimabase/graphql-http`. Provider-neutral developer tools can discover the
configured path without importing Yoga or choosing among endpoints.
The Yoga plugin itself returns no setup value through `ultimabase.plugin()`.

The package does not install GraphQL, HTTP, authentication, or a server. The
application must configure those sibling plugins explicitly:

```ts
import { UltimaBase } from '@ultimabase/core'
import { graphqlPlugin } from '@ultimabase/graphql-plugin'
import { graphqlYogaPlugin } from '@ultimabase/graphql-yoga-plugin'
import { httpPlugin } from '@ultimabase/http-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { honoServerPlugin } from '@ultimabase/hono-server-plugin'

const SchemaApplication = UltimaBase.use(
	graphqlPlugin({ acknowledgeUnverifiedProtection: true, default: false }),
)
const Post = SchemaApplication.Schema.define({
	className: 'Post',
	fields: (field) => ({ title: field.string({ required: true }) }),
	graphql: { operations: { get: true, findMany: true } },
})

// postgresPlugin() reads DATABASE_URL at start (ADR-0312).
const Application = SchemaApplication.use(
	postgresPlugin({ schemaPolicy: 'override' }),
)
	.use(httpPlugin({ appId: 'notes' }))
	.use(graphqlYogaPlugin())
	.use(honoServerPlugin())
export const ultimabase = new Application({
	schemas: [Post],
})

await using app = await ultimabase.start()
```

This local example exposes two reads and needs a disposable PostgreSQL database;
`override` may create or alter tables. The acknowledgement does not grant access.
Configure and review authorization before public deployment. The
[website GraphQL guide](../../apps/website/content/docs/1.0.0/plugins/official/graphql.mdx)
includes the complete installation and matching HTTP request.

`graphqlYogaPlugin()` mounts `POST /graphql` by default. It accepts only UTF-8
JSON GraphQL requests, rejects batching, uploads, subscriptions, SSE, and the
built-in GraphiQL UI, and limits streamed request bodies to 1 MiB. HTTP
introspection follows `NODE_ENV` (ADR-0312): the plugin reads it when created,
enabling introspection in development and disabling it when `NODE_ENV` is
`production`; an explicit `introspection` always wins, and `logLevel: 'debug'`
logs the value and its source. While introspection is enabled, the plugin
publishes the `ultimabase.graphql.introspection` capability that served
explorers require.

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

Contextual relation filters follow the same rule. Yoga contributes no filter
argument or resolver: it forwards the HTTP-selected anonymous, authenticated,
or Master context, and Core applies the source relation's synchronous `where`
before GraphQL connection ordering and pagination. Networkless execution and
Yoga therefore return the same visible nodes for the same application context.
