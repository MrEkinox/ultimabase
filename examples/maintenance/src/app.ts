// The application: a GraphQL API over HTTP, which a deployment pipeline puts
// in maintenance.
//#region plugins
import { graphqlPlugin } from '@ultimabase/graphql'
import { httpPlugin } from '@ultimabase/http'
import { maintenancePlugin } from '@ultimabase/maintenance'
import { defineApp, memory } from 'ultimabase'
import { Post } from './models.ts'

export const app = defineApp({
	database: memory(),
	masterKey: 'dev-master-key',
	plugins: [
		httpPlugin(),
		graphqlPlugin(),
		maintenancePlugin({
			retryAfter: 120_000,
			key: 'dev-maintenance-key',
			initial: 'unlocked',
		}),
	],
	models: [Post],
})
//#endregion
