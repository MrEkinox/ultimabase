// The application: a GraphQL API over HTTP, which Master puts in
// maintenance.
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
		}),
	],
	models: [Post],
})
//#endregion
