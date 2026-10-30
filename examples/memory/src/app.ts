// The application: a GraphQL API over HTTP, on the in-memory database.
//#region app
import { graphqlPlugin } from '@ultimabase/graphql'
import { httpPlugin } from '@ultimabase/http'
import { defineApp, memory } from 'ultimabase'
import { Contact } from './models.ts'

export const app = defineApp({
	// Nothing to install or run: the rows live in the process.
	database: memory(),
	plugins: [httpPlugin(), graphqlPlugin()],
	models: [Contact],
})
//#endregion
