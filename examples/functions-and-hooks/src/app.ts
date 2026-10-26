// The application: a GraphQL API over HTTP, with the `placeOrder` function.
import { graphqlPlugin } from '@ultimabase/graphql'
import { httpPlugin } from '@ultimabase/http'
import { defineApp, memory } from 'ultimabase'
import { placeOrder } from './functions.ts'
import { Order, Product } from './models.ts'

export const app = defineApp({
	// Kept in memory, so the example needs no database.
	database: memory(),
	// Listens on PORT, or 3000.
	plugins: [httpPlugin(), graphqlPlugin()],
	models: [Product, Order],
	functions: [placeOrder],
})
