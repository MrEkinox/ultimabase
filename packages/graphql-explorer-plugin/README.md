# `@ultimabase/graphql-explorer-plugin`

Optional GraphiQL or Apollo Sandbox browser page for one UltimaBase GraphQL
HTTP endpoint (ADR-0325). It does not install GraphQL, Yoga, HTTP, or a server.
The plugin returns no setup value through `ultimabase.plugin()`; its route is
contributed through the HTTP plugin.

`graphqlExplorerPlugin()` serves GraphiQL at `/graphiql`;
`graphqlExplorerPlugin({ ui: 'apollo-sandbox' })` serves Apollo Sandbox at
`/apollo-sandbox`. `apiServer({ graphql: { explorer: 'graphiql' } })` from
`@ultimabase/api-server` installs it with GraphQL. This application from the
tested [`examples/graphql`](../../examples/graphql/README.md) installs each
plugin and serves Apollo Sandbox (the code blocks of this README are copied
from the example by `yarn docs:regions`, ADR-0330):

<!-- region ../../examples/graphql/src/notes.ts#notes -->

```ts
import { UltimaBase } from '@ultimabase/core'
import { graphqlExplorerPlugin } from '@ultimabase/graphql-explorer-plugin'
import { graphqlPlugin } from '@ultimabase/graphql-plugin'
import { graphqlYogaPlugin } from '@ultimabase/graphql-yoga-plugin'
import { honoServerPlugin } from '@ultimabase/hono-server-plugin'
import { httpPlugin } from '@ultimabase/http-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'

/**
 * A second application installing each plugin `apiServer()` would. With
 * `default: false`, GraphQL exposes only the reads Note's rule enables, so it
 * starts without a policy plugin. `requireApplicationId` is for several
 * applications behind one server: every request names its application.
 */
const Notes = UltimaBase.use(
	postgresPlugin(),
	httpPlugin({ appId: 'notes', requireApplicationId: true }),
	graphqlPlugin({ default: false }),
	graphqlYogaPlugin({
		bodyLimit: 512 * 1024,
		introspection: true,
		path: '/api/graphql',
	}),
	graphqlExplorerPlugin({ ui: 'apollo-sandbox' }),
	honoServerPlugin(),
)

export const Note = Notes.Schema.define({
	className: 'Note',
	fields: (field) => ({ text: field.string({ required: true }) }),
}).with({ graphql: { findOne: true, findMany: true } })

export const notes = new Notes({ schemas: [Note] })
```

<!-- endregion -->

Open `/graphiql` (or `/apollo-sandbox`; `path` changes it). An application
that requires the application header (several applications behind one server)
serves the same page at `/__ultimabase/apps/{appId}/graphiql`: the page then
reads the public application ID from its URL and sends the
`X-UltimaBase-Application-Id` header with every request. It never embeds
credentials or authority and has no endpoint or application switcher:

<!-- region ../../examples/graphql/tests/notes.test.ts#notes-sandbox -->

```ts
const page = await t.fetch('/__ultimabase/apps/notes/apollo-sandbox')
```

<!-- endregion -->

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
GraphQL HTTP provider's introspection off, creating the application fails
with `PLUGIN_CAPABILITY_MISSING` and a hint naming the option. The remote
scripts require the plugin's reported `environment:network` claim.

The page needs network access to esm.sh or Apollo's CDN; offline assets are
not provided.
