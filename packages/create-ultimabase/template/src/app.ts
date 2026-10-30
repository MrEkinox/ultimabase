// The application: its database, its plugins and its models.
import { graphqlPlugin } from '@ultimabase/graphql'
import { httpPlugin } from '@ultimabase/http'
import { defineApp, memory } from 'ultimabase'
import { Post } from './models.ts'

export const app = defineApp({
	// For PostgreSQL: postgres({ url: process.env['DATABASE_URL'] }) from @ultimabase/postgres.
	database: memory(),
	plugins: [
		httpPlugin(),
		graphqlPlugin(),
		// For REST too: restPlugin() from @ultimabase/rest.
	],
	models: [Post],
})
