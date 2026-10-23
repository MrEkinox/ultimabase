// `httpPlugin()` and `routes()` (D-106): a Node server for the application's
// Hono routes, each of which reads the caller as `c.var.caller`.
import type { Server } from 'node:http'
import { Hono } from 'hono'
import type { Caller, PluginOf, PluginTypes } from 'ultimabase'
import { definePlugin } from 'ultimabase'
import manifest from '../package.json' with { type: 'json' }
import type { HttpEnv, HttpOptions, Routes } from './app.ts'
import { appOf } from './app.ts'
import { hold } from './request.ts'
import { closed, listening, portOf, serverOf } from './server.ts'

export type { HttpEnv, HttpOptions, Routes } from './app.ts'
export type { StandardSchema } from './validate.ts'
export { validate } from './validate.ts'

/** What the HTTP plugin offers other plugins (D-107). */
export interface HttpApi {
	/** Adds routes after the application's; call it from your `api`. */
	mount(routes: Routes): void
	/** Where the server listens, `http://localhost:3000`, once it started. */
	url(): string
}

interface Http extends PluginTypes {
	readonly name: 'http'
	readonly appOptions: HttpOptions
	readonly api: HttpApi
}

// Each running application's server and mounted routes, by the context its
// plugin received.
const servers = new WeakMap<object, Server>()
const mounts = new WeakMap<object, Routes[]>()
const urls = new WeakMap<object, string>()

const http = definePlugin<Http>({
	name: 'http',
	manifest,
	api: (context) => {
		const mounted: Routes[] = []
		mounts.set(context, mounted)
		return {
			mount: (routes) => {
				if (!mounts.has(context)) {
					throw new Error(
						"The HTTP server is running: mount routes from your plugin's api (D-107).",
					)
				}
				mounted.push(routes)
			},
			url: () => {
				const url = urls.get(context)
				if (url === undefined) {
					throw new Error(
						"The HTTP server is not running: read its url from your plugin's start (D-108).",
					)
				}
				return url
			},
		}
	},
	start: async (context) => {
		const { options, identify, logger } = context
		const port = portOf(options.port)
		const app = appOf(options, mounts.get(context) ?? [], identify, logger)
		mounts.delete(context)
		const server = serverOf(app.fetch)
		const bound = await listening(server, port)
		servers.set(context, server)
		const url = `http://localhost:${bound}`
		urls.set(context, url)
		logger.info(`Listening on ${url}.`)
	},
	// Stops accepting connections, then waits for running requests (D-59).
	stop: async (context) => {
		const server = servers.get(context)
		if (server === undefined) return
		servers.delete(context)
		urls.delete(context)
		await closed(server)
	},
})

/** The application's HTTP server (D-66, D-106). */
export const httpPlugin: PluginOf<Http> = http.plugin

const anonymous: Caller = { kind: 'anonymous' }

/**
 * Routes whose context holds the request's caller, `c.var.caller`: the
 * anonymous one when no application read it, as in `routes().request(…)`.
 */
export const routes = (): Routes =>
	new Hono<HttpEnv>().use(async (c, next) => {
		if (!('caller' in c.var)) hold(c, anonymous)
		await next()
	})
