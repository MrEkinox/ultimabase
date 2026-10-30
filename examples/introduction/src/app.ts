// The application: GraphQL and REST APIs over HTTP.
import { graphqlPlugin } from '@ultimabase/graphql'
import { httpPlugin } from '@ultimabase/http'
import { restPlugin } from '@ultimabase/rest'
import { defineApp, memory } from 'ultimabase'
import { Post } from './models.ts'

//#region app
export const app = defineApp({
	// Kept in memory, so the example needs no database.
	database: memory(),
	// Listens on PORT, or 3000; serves /graphql and /api.
	plugins: [httpPlugin(), graphqlPlugin(), restPlugin()],
	models: [Post],
})
//#endregion
