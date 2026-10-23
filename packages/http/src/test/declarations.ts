// An application that emits declarations without isolatedDeclarations
// (D-70): what it exports names the plugin's types, which must be exported.
import { httpPlugin, routes } from '@ultimabase/http'
import { defineApp, memory } from 'ultimabase'

export const api = routes().get('/ping', (c) => c.text('pong'))

export const app = defineApp({
	database: memory(),
	plugins: [httpPlugin({ routes: [api] })],
	models: [],
})
