# `@ultimabase/graphql-explorer-plugin`

Optional GraphiQL or Apollo Sandbox browser page for one UltimaBase GraphQL
HTTP endpoint (ADR-0325). It does not install GraphQL, Yoga, HTTP, or a server.
The plugin returns no setup value through `ultimabase.plugin()`; its route is
contributed through the HTTP plugin.

```ts
import { graphqlExplorerPlugin } from '@ultimabase/graphql-explorer-plugin'

graphqlExplorerPlugin() // GraphiQL at /graphiql
graphqlExplorerPlugin({ ui: 'apollo-sandbox' }) // Apollo Sandbox at /apollo-sandbox
```

`apiServer({ graphql: { explorer: 'graphiql' } })` from
`@ultimabase/api-server` installs it with GraphQL.

Open `/graphiql` (or `/apollo-sandbox`; `path` changes it). An application
that requires the application header (several applications behind one server)
serves the same page at `/__ultimabase/apps/{appId}/graphiql`: the page then
reads the public application ID from its URL and sends the
`X-UltimaBase-Application-Id` header with every request. It never embeds
credentials or authority and has no endpoint or application switcher.

## Remote scripts

GraphiQL loads pinned esm.sh builds. Its import map carries a sha384
integrity hash for every module the page loads, version ranges included
(remapped to one pinned build), so a changed file blocks the page instead of
running. Two limits remain: the editor's web workers import their modules
outside the page's import map, and a module imported from a computed URL is
not covered. `node tooling/graphiql-integrity/run.mjs` regenerates the map
after a version change.

Apollo publishes Apollo Sandbox only as an unpinned script
(`…/v2/embeddable-sandbox.umd.production.min.js`), so it cannot carry an
integrity hash: whatever Apollo serves runs in the page. This risk is limited
by serving explorers in development only.

## Environment

`environment` is optional (ADR-0312): when omitted, the plugin reads
`NODE_ENV` when it is created, `production` meaning production and any other
value development; an explicit `environment` always wins. The route is served
in development and, in production, only with `allowInProduction: true`.
`logLevel: 'debug'` logs whether the route is served, where and why. A served
explorer requires the `ultimabase.graphql.introspection` capability: with the
GraphQL HTTP provider's introspection off, the application refuses to start
with `PLUGIN_CAPABILITY_MISSING` and a hint naming the option. The remote
scripts require the plugin's reported `environment:network` claim.

The page needs network access to esm.sh or Apollo's CDN; offline assets are
not provided.
