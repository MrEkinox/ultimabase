// The application: a GraphQL API over HTTP, whose deletes keep the posts.
import { graphqlPlugin } from '@ultimabase/graphql'
import { httpPlugin } from '@ultimabase/http'
import { softDeletePlugin } from '@ultimabase/soft-delete'
import { defineApp, memory } from 'ultimabase'
import { restorePost, trash } from './functions.ts'
import { Post } from './models.ts'

export const app = defineApp({
	// Kept in memory, so the example needs no database.
	database: memory(),
	//#region plugins
	// Listens on PORT, or 3000.
	plugins: [httpPlugin(), graphqlPlugin(), softDeletePlugin()],
	//#endregion
	models: [Post],
	functions: [trash, restorePost],
})
