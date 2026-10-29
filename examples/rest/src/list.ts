// The same models, with lists instead of Relay connections.
import { graphqlPlugin } from '@ultimabase/graphql'
import { httpPlugin } from '@ultimabase/http'
import { restPlugin } from '@ultimabase/rest'
import { defineApp, memory } from 'ultimabase'
import { Person, Post, Revision } from './models.ts'

export const listApp = defineApp({
	database: memory(),
	//#region list
	plugins: [httpPlugin(), restPlugin({ pagination: 'list' }), graphqlPlugin()],
	//#endregion
	models: [Person, Post, Revision],
})
