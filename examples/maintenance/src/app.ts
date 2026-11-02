// The application: a GraphQL API over HTTP, which a deployment pipeline puts
// in maintenance.
//#region plugins
import { graphqlPlugin } from '@ultimabase/graphql'
import { httpPlugin } from '@ultimabase/http'
import { maintenancePlugin } from '@ultimabase/maintenance'
import { defineApp, defineModel, memory } from 'ultimabase'

export const Post = defineModel({
	name: 'Post',
	fields: (f) => ({ title: f.string() }),
}).with({ access: { read: () => true } })

export const app = defineApp({
	// Kept in memory, so the example needs no database.
	database: memory(),
	// Sent in x-ultimabase-master-key, outside production only.
	masterKey: 'dev-master-key',
	plugins: [
		httpPlugin(),
		graphqlPlugin(),
		maintenancePlugin({
			// What Retry-After tells a client to wait, in milliseconds;
			// 60 000 by default.
			retryAfter: 120_000,
			// Sent in x-ultimabase-maintenance-key, it switches the maintenance
			// and nothing else: what a deployment pipeline holds.
			key: 'dev-maintenance-key',
			// The state while none is stored: 'locked' starts a new database
			// in maintenance. 'unlocked' by default.
			initial: 'unlocked',
		}),
	],
	models: [Post],
})
//#endregion
