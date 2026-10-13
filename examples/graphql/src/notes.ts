//#region notes
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
//#endregion notes
