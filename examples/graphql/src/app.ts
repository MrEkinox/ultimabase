// The application: the GraphQL API over HTTP, with the fields extend adds.
import { graphqlPlugin } from '@ultimabase/graphql'
import { httpPlugin } from '@ultimabase/http'
import { defineApp, memory } from 'ultimabase'
import { reindex, topPosts } from './functions.ts'
import { Person, Post, Revision } from './models.ts'
import { extend } from './schema.ts'

export const app = defineApp({
	// Kept in memory, so the example needs no database.
	database: memory(),
	// Sent in x-ultimabase-master-key, outside production only.
	masterKey: 'dev-master-key',
	//#region plugins
	plugins: [
		httpPlugin(),
		graphqlPlugin({
			// A document nests 6 levels at most; 10 by default.
			maxDepth: 6,
			// It returns 2 000 rows at most, each list times the lists above
			// it; 20 000 by default.
			maxRows: 2000,
			// Kept in production too, as the schema is public; off there by
			// default.
			introspection: true,
			extend,
		}),
	],
	//#endregion
	models: [Person, Post, Revision],
	functions: [topPosts, reindex],
})
