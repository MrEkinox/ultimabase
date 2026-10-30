// The application: GraphQL and REST over HTTP, whose tasks are live.
import { graphqlPlugin } from '@ultimabase/graphql'
import { httpPlugin } from '@ultimabase/http'
import { realtimePlugin } from '@ultimabase/realtime'
import { restPlugin } from '@ultimabase/rest'
import { defineApp, memory } from 'ultimabase'
import { Task, tasksLeft } from './models.ts'

export const app = defineApp({
	// Kept in memory, so the example needs no database.
	database: memory(),
	//#region plugins
	// Listens on PORT, or 3000; GraphQL subscriptions on ws://…/graphql.
	plugins: [
		httpPlugin(),
		graphqlPlugin(),
		restPlugin(),
		realtimePlugin({
			// A connection holds 20 live reads at most; 100 by default.
			maxSubscriptions: 20,
			// It follows 2 000 rows at most, in all; 10 000 by default.
			maxConnectionRows: 2000,
			// Each caller is built again every minute; every 5 by default.
			refresh: 60_000,
		}),
	],
	//#endregion
	models: [Task],
	functions: [tasksLeft],
})
