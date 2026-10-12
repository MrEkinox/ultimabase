# `@ultimabase/graphql-yoga-plugin`

The official GraphQL-over-HTTP adapter for UltimaBase. It mounts the final
application-local schema from `@ultimabase/graphql-plugin` through the shared
Fetch application from `@ultimabase/http-plugin`.

It also provides `graphqlHttpEndpointCapability` from
`@ultimabase/graphql-http`. Provider-neutral developer tools can discover the
configured path without importing Yoga or choosing among endpoints.
The Yoga plugin itself returns no setup value through `ultimabase.plugin()`.

The package does not install GraphQL, HTTP, authentication, or a server. The
application configures those sibling plugins explicitly, or installs them all
with `apiServer({ graphql: true })` from `@ultimabase/api-server` (ADR-0325):

```ts
import { UltimaBase } from '@ultimabase/core'
import { graphqlPlugin } from '@ultimabase/graphql-plugin'
import { graphqlYogaPlugin } from '@ultimabase/graphql-yoga-plugin'
import { httpPlugin } from '@ultimabase/http-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { honoServerPlugin } from '@ultimabase/hono-server-plugin'

// postgresPlugin() reads DATABASE_URL at start (ADR-0312).
const Application = UltimaBase.use(
	graphqlPlugin({ default: false }),
	postgresPlugin({ schemaPolicy: 'override' }),
	httpPlugin(),
	graphqlYogaPlugin(),
	honoServerPlugin(),
)
const Post = Application.Schema.define({
	className: 'Post',
	fields: (field) => ({ title: field.string({ required: true }) }),
}).with({ graphql: { findOne: true, findMany: true } })

export const ultimabase = new Application({
	schemas: [Post],
})

await using app = await ultimabase.start()
```

This local example exposes reads only and needs a disposable PostgreSQL
database; `override` may create or alter tables.
Configure and review authorization before public deployment. The
[website GraphQL guide](../../apps/website/content/docs/1.0.0/plugins/official/graphql.mdx)
includes the complete installation and matching HTTP request.

`graphqlYogaPlugin()` mounts `POST /graphql` by default. It accepts only UTF-8
JSON GraphQL requests, rejects batching, uploads, subscriptions, SSE, and the
built-in GraphiQL UI (`@ultimabase/graphql-explorer-plugin` serves one), and limits streamed request bodies to 1 MiB. HTTP
introspection follows `NODE_ENV` (ADR-0312): the plugin reads it when created,
enabling introspection in development and disabling it when `NODE_ENV` is
`production`; an explicit `introspection` always wins, and `logLevel: 'debug'`
logs the value and its source. While introspection is enabled, the plugin
publishes the `ultimabase.graphql.introspection` capability that served
explorers require.

Without `bodyLimit`, GraphQL inherits `httpPlugin({ bodyLimit })` (1 MiB by
default), enforced while the body streams; `bodyLimit` replaces it for the
GraphQL endpoint (ADR-0323).

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
application capability used by networkless execution. It validates documents
with the application's `validationRules`, so a field a disabled feature leaves
out answers `400` with the same `hint: enable graphql: { … } on …` as
networkless execution (ADR-0325).

Virtual fields require no Yoga-specific resolver or configuration. Their
selection, request-aware asynchronous resolution, output validation, Access,
Master behavior, cancellation, and mutation rollback stay in Core; Yoga only
delivers the resulting GraphQL response through the selected HTTP application.

Contextual relation filters follow the same rule. Yoga contributes no filter
argument or resolver: it forwards the HTTP-selected anonymous, authenticated,
or Master context, and Core applies the source relation's synchronous `where`
before GraphQL connection ordering and pagination. Networkless execution and
Yoga therefore return the same visible nodes for the same application context.
