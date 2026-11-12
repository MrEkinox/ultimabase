// The application: an HTTP API on the in-memory database. It sells what
// `src/catalog.ts` declares; its deploy script writes that to Stripe.
import { httpPlugin } from '@ultimabase/http'
import { defineApp, memory } from 'ultimabase'

export const app = defineApp({
	database: memory(),
	plugins: [httpPlugin()],
	models: [],
})
