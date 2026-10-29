// The application: GraphQL and REST over HTTP, and the shop's functions.
import { graphqlPlugin } from '@ultimabase/graphql'
import { httpPlugin } from '@ultimabase/http'
import { restPlugin } from '@ultimabase/rest'
import { defineApp, memory } from 'ultimabase'
import { order, subscribe } from './functions.ts'
import { Product } from './models.ts'

export const app = defineApp({
	// Kept in memory, so the example needs no database.
	database: memory(),
	// Listens on PORT, or 3000.
	plugins: [httpPlugin(), restPlugin(), graphqlPlugin()],
	models: [Product],
	functions: [order, subscribe],
})
