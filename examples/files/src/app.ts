// The application: a GraphQL API over HTTP, whose posts hold files.
//#region plugins
import { filesPlugin } from '@ultimabase/files'
import { graphqlPlugin } from '@ultimabase/graphql'
import { httpPlugin } from '@ultimabase/http'
import { allow, defineApp, memory } from 'ultimabase'
import { Post } from './models.ts'
import { chooseStorage } from './storage.ts'

export const app = defineApp({
	database: memory(),
	plugins: [
		httpPlugin(),
		graphqlPlugin(),
		// A signed-in user uploads by default; here, anyone.
		filesPlugin({ storage: chooseStorage(), access: { upload: allow.public } }),
	],
	models: [Post],
})
//#endregion
