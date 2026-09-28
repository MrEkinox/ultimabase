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
import { Schema, UltimaBase } from '@ultimabase/core'
import { graphqlPlugin } from '@ultimabase/graphql-plugin'
import { graphqlYogaPlugin } from '@ultimabase/graphql-yoga-plugin'
import { httpPlugin } from '@ultimabase/http-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { honoServerPlugin } from '@ultimabase/server-hono-plugin'

const Post = Schema.define({
	className: 'Post',
	fields: (field) => ({ title: field.string({ required: true }) }),
	graphql: { operations: { get: true, findMany: true } },
})

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is required')

const ultimabase = new UltimaBase({
	plugins: [
		postgresPlugin({ schemaPolicy: 'override', url: databaseUrl }),
		httpPlugin({ appId: 'notes' }),
		graphqlPlugin({ acknowledgeUnverifiedProtection: true, default: false }),
		graphqlYogaPlugin(),
		honoServerPlugin({ host: '127.0.0.1', port: 1337 }),
	],
	schemas: [Post],
})

await ultimabase.start()
```

This local example exposes two reads and needs a disposable PostgreSQL database;
`override` may create or alter tables. The acknowledgement does not grant access.
Configure and review authorization before public deployment. The
[website GraphQL guide](../../apps/website/content/docs/1.0.0/plugins/official/graphql.mdx)
includes the complete installation and matching HTTP request.

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

Contextual relation filters follow the same rule. Yoga contributes no filter
argument or resolver: it forwards the HTTP-selected anonymous, authenticated,
or Master context, and Core applies the source relation's synchronous `where`
before GraphQL connection ordering and pagination. Networkless execution and
Yoga therefore return the same visible nodes for the same application context.
