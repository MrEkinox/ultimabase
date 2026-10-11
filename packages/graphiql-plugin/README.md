# `@ultimabase/graphiql-plugin`

Optional GraphiQL browser UI for one UltimaBase GraphQL HTTP endpoint. It does
not install GraphQL, Yoga, HTTP, or a server.
The plugin returns no setup value through `ultimabase.plugin()`; its configured route
is contributed through the HTTP plugin.

```ts
import { graphiqlPlugin } from '@ultimabase/graphiql-plugin'

graphiqlPlugin()
```

With `appId: 'notes'`, open `/__ultimabase/apps/notes/graphiql`. The page reads
the public application ID from that URL and attaches the canonical header to
same-origin GraphQL requests. It never embeds credentials or authority and has
no endpoint or application switcher.

`environment` is optional (ADR-0312): when omitted, the plugin reads
`NODE_ENV` when it is created, `production` meaning production and any other
value development; an explicit `environment` always wins. The route is served
in development and, in production, only with `allowInProduction: true`.
`logLevel: 'debug'` logs whether the route is served and why. A served
explorer requires the `ultimabase.graphql.introspection` capability: with the
GraphQL HTTP provider's introspection off, the application refuses to start
with `PLUGIN_CAPABILITY_MISSING` and a hint naming the option. Remote,
version-pinned ESM assets require the plugin's reported `environment:network`
claim.
