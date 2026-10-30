// The application: a GraphQL API over HTTP, on PostgreSQL.
//#region app
import { graphqlPlugin } from '@ultimabase/graphql'
import { httpPlugin } from '@ultimabase/http'
import { postgres } from '@ultimabase/postgres'
import { defineApp } from 'ultimabase'
import { Project, Task } from './models.ts'

export const app = defineApp({
	// Outside production, a start syncs the tables to the models; in
	// production it checks that the migrations deployed match them.
	database: postgres({ url: process.env['DATABASE_URL'] }),
	// Listens on PORT, or 3000.
	plugins: [httpPlugin(), graphqlPlugin()],
	models: [Project, Task],
	// Accepted in production, where it needs 32 characters at least.
	masterKey: { key: process.env['MASTER_KEY'], production: true },
})
//#endregion
