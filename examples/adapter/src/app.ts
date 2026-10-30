// The application: a REST API over HTTP, on memory() run by `timed`.
import { httpPlugin } from '@ultimabase/http'
import { restPlugin } from '@ultimabase/rest'
import { defineApp, memory } from 'ultimabase'
import { Author, Post } from './models.ts'
import { timed } from './timed.ts'

//#region app
export const database = timed(memory(), { slow: 100 })

export const app = defineApp({
	database,
	plugins: [httpPlugin(), restPlugin()],
	models: [Author, Post],
})
//#endregion
