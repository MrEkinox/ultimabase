# `@ultimabase/graphiql-plugin`

Optional GraphiQL browser UI for one UltimaBase GraphQL HTTP endpoint. It does
not install GraphQL, Yoga, HTTP, or a server.
The plugin returns no setup value through `ultimabase.plugin()`; its configured route
is contributed through the HTTP plugin.

```ts
import { graphiqlPlugin } from '@ultimabase/graphiql-plugin'

graphiqlPlugin({ environment: 'development' })
```

With `appId: 'notes'`, open `/__ultimabase/apps/notes/graphiql`. The page reads
the public application ID from that URL and attaches the canonical header to
same-origin GraphQL requests. It never embeds credentials or authority and has
no endpoint or application switcher.

No route is contributed for `environment: 'production'` unless
`allowInProduction: true` is explicit. GraphiQL schema discovery also requires
the selected GraphQL HTTP provider to enable introspection explicitly. Remote,
version-pinned ESM assets require the plugin's reported `environment:network`
claim.
