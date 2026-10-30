// The application: the REST API under /api, and GraphQL under /graphql to
// compare, over HTTP.
import { graphqlPlugin } from '@ultimabase/graphql'
import { httpPlugin } from '@ultimabase/http'
import { restPlugin } from '@ultimabase/rest'
import { defineApp, memory } from 'ultimabase'
import { like, reindex, topPosts } from './functions.ts'
import { Person, Post, Revision } from './models.ts'

export const app = defineApp({
	// Kept in memory, so the example needs no database.
	database: memory(),
	// Sent in x-ultimabase-master-key, outside production only.
	masterKey: 'dev-master-key',
	//#region plugins
	plugins: [
		httpPlugin(),
		restPlugin({
			// A request nests 4 levels at most; 10 by default.
			maxDepth: 4,
			// It returns 2 000 rows at most, each list times the lists above
			// it; 20 000 by default.
			maxRows: 2000,
		}),
		graphqlPlugin(),
	],
	//#endregion
	models: [Person, Post, Revision],
	functions: [topPosts, like, reindex],
})
