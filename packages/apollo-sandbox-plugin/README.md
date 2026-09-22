# `@ultimabase/apollo-sandbox-plugin`

Optional Apollo Sandbox browser UI for one UltimaBase GraphQL HTTP endpoint. It
does not install GraphQL, Yoga, HTTP, or a server.
The plugin returns no setup value through `getPlugin()`; its configured route
is contributed through the HTTP plugin.

```ts
import { apolloSandboxPlugin } from '@ultimabase/apollo-sandbox-plugin'

apolloSandboxPlugin({ environment: 'development' })
```

With `appId: 'notes'`, open `/__ultimabase/apps/notes/apollo-sandbox`. The page
derives the public application ID from that URL, fixes the endpoint supplied by
the installed GraphQL HTTP provider, and attaches the canonical application
header through Sandbox's request hook. Endpoint editing and cookie controls are
disabled, and no credential or authority is embedded.

No route is contributed for `environment: 'production'` unless
`allowInProduction: true` is explicit. Sandbox schema discovery also requires
the selected GraphQL HTTP provider to enable introspection explicitly. Its
major-versioned Apollo CDN asset requires the plugin's reported
`environment:network` claim.
