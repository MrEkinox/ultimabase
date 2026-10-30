// The application: GraphQL and REST over HTTP, and the library's functions.
//#region app
import { graphqlPlugin } from '@ultimabase/graphql'
import { httpPlugin } from '@ultimabase/http'
import { restPlugin } from '@ultimabase/rest'
import { defineApp, memory } from 'ultimabase'
import { borrowBook, returnBooks, searchBooks } from './functions.ts'
import { Book } from './models.ts'

export const app = defineApp({
	// Kept in memory, so the example needs no database.
	database: memory(),
	// Listens on PORT, or 3000.
	plugins: [httpPlugin(), restPlugin(), graphqlPlugin()],
	models: [Book],
	functions: [borrowBook, searchBooks, returnBooks],
})
//#endregion
