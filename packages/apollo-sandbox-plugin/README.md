# `@ultimabase/apollo-sandbox-plugin`

Optional Apollo Sandbox browser UI for one UltimaBase GraphQL HTTP endpoint. It
does not install GraphQL, Yoga, HTTP, or a server.
The plugin returns no setup value through `ultimabase.plugin()`; its configured route
is contributed through the HTTP plugin.

```ts
import { apolloSandboxPlugin } from '@ultimabase/apollo-sandbox-plugin'

apolloSandboxPlugin()
```

With `appId: 'notes'`, open `/__ultimabase/apps/notes/apollo-sandbox`. The page
derives the public application ID from that URL, fixes the endpoint supplied by
the installed GraphQL HTTP provider, and attaches the canonical application
header through Sandbox's request hook. Endpoint editing and cookie controls are
disabled, and no credential or authority is embedded.

`environment` is optional (ADR-0312): when omitted, the plugin reads
`NODE_ENV` when it is created, `production` meaning production and any other
value development; an explicit `environment` always wins. The route is served
in development and, in production, only with `allowInProduction: true`.
`logLevel: 'debug'` logs whether the route is served and why. A served
explorer requires the `ultimabase.graphql.introspection` capability: with the
GraphQL HTTP provider's introspection off, the application refuses to start
with `PLUGIN_CAPABILITY_MISSING` and a hint naming the option. Its
major-versioned Apollo CDN asset requires the plugin's reported
`environment:network` claim.
