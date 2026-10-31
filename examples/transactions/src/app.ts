// The application: a GraphQL API over HTTP, with the `transfer` and `like`
// functions.
import { graphqlPlugin } from '@ultimabase/graphql'
import { httpPlugin } from '@ultimabase/http'
import { defineApp, memory } from 'ultimabase'
import { like, transfer } from './functions.ts'
import { Account, Like } from './models.ts'

export const app = defineApp({
	// Kept in memory, so the example needs no database.
	database: memory(),
	// Listens on PORT, or 3000.
	plugins: [httpPlugin(), graphqlPlugin()],
	models: [Account, Like],
	functions: [transfer, like],
})
