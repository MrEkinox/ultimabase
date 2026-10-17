# @ultimabase/graphql-yoga-plugin

Serves the GraphQL plugin's schema over HTTP with GraphQL Yoga, as a route of
the HTTP plugin.

## Installation

```sh
npm install @ultimabase/graphql-plugin @ultimabase/graphql-yoga-plugin @ultimabase/core
```

`@ultimabase/core` is a peer dependency. `@ultimabase/graphql-plugin`,
`@ultimabase/http-plugin` and a server provider are required beside it;
`@ultimabase/api-server` installs them together.

## Example

A GraphQL application installing each plugin, from the tested
[`examples/graphql`](../../examples/graphql/README.md) application:

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

## Documentation

- [GraphQL](../../apps/website/content/docs/1.0.0/plugins/official/graphql.mdx)
- [HTTP](../../apps/website/content/docs/1.0.0/plugins/official/http.mdx)
