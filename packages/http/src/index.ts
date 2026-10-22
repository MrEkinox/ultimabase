// `httpPlugin()` and `routes()` (D-106): a Node server for the application's
// Hono routes, each of which reads the caller as `c.var.caller`.
import type { Server } from 'node:http'
import { Hono } from 'hono'
import type { PluginOf, PluginTypes } from 'ultimabase'
import { definePlugin } from 'ultimabase'
import manifest from '../package.json' with { type: 'json' }
import type { HttpOptions, Routes } from './app.ts'
import { appOf } from './app.ts'
import { closed, listening, portOf, serverOf } from './server.ts'

export type { HttpEnv, HttpOptions, Routes } from './app.ts'

interface Http extends PluginTypes {
	readonly name: 'http'
	readonly appOptions: HttpOptions
}

// Each running application's server, by the context its plugin received.
const servers = new WeakMap<object, Server>()

const http = definePlugin<Http>({
	name: 'http',
	manifest,
	start: async (context) => {
		const { options, identify, logger } = context
		const port = portOf(options.port)
		const app = appOf(options, identify, logger)
		const server = serverOf(app.fetch)
		const bound = await listening(server, port)
		servers.set(context, server)
		logger.info(`Listening on http://localhost:${bound}.`)
	},
	// Stops accepting connections, then waits for running requests (D-59).
	stop: async (context) => {
		const server = servers.get(context)
		if (server === undefined) return
		servers.delete(context)
		await closed(server)
	},
})

/** The application's HTTP server (D-66, D-106). */
export const httpPlugin: PluginOf<Http> = http.plugin

/** Routes whose context holds the request's caller, `c.var.caller`. */
export const routes = (): Routes => new Hono()
