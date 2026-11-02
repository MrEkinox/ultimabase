// `httpPlugin()` and `routes()` (D-106): a Node server for the application's
// Hono routes, each of which reads the caller as `c.var.caller`.
import type { Server } from 'node:http'
import type { Duplex } from 'node:stream'
import { Hono } from 'hono'
import type { Caller, PluginOf, PluginTypes } from 'ultimabase'
import { definePlugin } from 'ultimabase'
import manifest from '../package.json' with { type: 'json' }
import type { HttpEnv, HttpOptions, Mounted, Routes } from './app.ts'
import { addresses, proxiesOf } from './address.ts'
import { allowing, appOf } from './app.ts'
import type { Probes, ReadyCheck } from './probes.ts'
import { hold } from './request.ts'
import { closed, listening, portOf, serverOf } from './server.ts'
import type { Accept, Close, Closing, Gate, Taker } from './upgrade.ts'
import { closeUpgrades, upgrading } from './upgrade.ts'

export type { HttpEnv, HttpOptions, Routes } from './app.ts'
export type { ReadyCheck } from './probes.ts'
export type { Accept, Close, Closing, Gate, Upgrade } from './upgrade.ts'
export { clientOf } from './client.ts'
export type { StandardSchema } from './validate.ts'
export { validate } from './validate.ts'

/** What the HTTP plugin offers other plugins (D-107). */
export interface HttpApi {
	/**
	 * Adds routes after the application's; call it from your `api`. With
	 * `bodyLimit: false`, they read their own body (D-153).
	 */
	mount(routes: Routes, options?: { readonly bodyLimit?: false }): void
	/**
	 * Takes the WebSocket upgrades of `path`, once their origin is one CORS
	 * allows and the `upgrade` gate let them through; call it from your
	 * `api` (D-154). `close` closes its sockets with a code (D-166).
	 */
	upgrade(
		path: string,
		accept: Accept,
		options?: { readonly close?: Close },
	): void
	/**
	 * Closes the WebSockets open on every path, or on `path`, with `code`:
	 * those of a plugin that gave no `close` are cut (D-166).
	 */
	closeUpgrades(closing: Closing): void
	/**
	 * Adds a check `GET /ready` runs on each request: it answers 503 while
	 * one fails; call it from your `api` (D-204).
	 */
	ready(check: ReadyCheck): void
	/**
	 * Answers each request, past CORS, before the caller and the routes, and
	 * each WebSocket upgrade, past the application's `upgrade`: a response
	 * refuses it; call it from your `api` (D-205).
	 */
	gate(gate: Gate): void
	/** Where the server listens, `http://localhost:3000`, once it started. */
	url(): string
}

/** The HTTP plugin's types (D-57). */
export interface Http extends PluginTypes {
	readonly name: 'http'
	readonly appOptions: HttpOptions
	readonly api: HttpApi
	readonly errors:
		| 'BAD_REQUEST'
		| 'BAD_USER_INPUT'
		| 'PAYLOAD_TOO_LARGE'
		| 'UNAVAILABLE'
		| 'UNSUPPORTED_MEDIA_TYPE'
}

// Each running application's server and mounted routes, by the context its
// plugin received.
const servers = new WeakMap<object, Server>()
const mounts = new WeakMap<object, Mounted[]>()
const upgrades = new WeakMap<object, Map<string, Taker>>()
const taken = new WeakMap<object, ReadonlyMap<Duplex, string>>()
const urls = new WeakMap<object, string>()
const probing = new WeakMap<object, Probes & { drain: number }>()
const gated = new WeakMap<object, Gate[]>()

const http = definePlugin<Http>({
	name: 'http',
	manifest,
	api: (context) => {
		const mounted: Mounted[] = []
		const takers = new Map<string, Taker>()
		const gates: Gate[] = []
		const probes = {
			started: false,
			stopping: false,
			checks: new Array<ReadyCheck>(),
			drain: 0,
		}
		mounts.set(context, mounted)
		upgrades.set(context, takers)
		probing.set(context, probes)
		gated.set(context, gates)
		const building = (what: string) => {
			if (mounts.has(context)) return
			throw new Error(
				`The HTTP server is running: ${what} from your plugin's api.`,
			)
		}
		return {
			mount: (routes, mountOptions) => {
				building('mount routes')
				mounted.push({ routes, bodyLimit: mountOptions?.bodyLimit ?? true })
			},
			upgrade: (path, accept, upgradeOptions) => {
				building('take upgrades')
				if (takers.has(path)) {
					throw new Error(`Two plugins take the upgrades of ${path}.`)
				}
				takers.set(path, { accept, close: upgradeOptions?.close })
			},
			ready: (check) => {
				building('add readiness checks')
				probes.checks.push(check)
			},
			gate: (gate) => {
				building('add gates')
				gates.push(gate)
			},
			closeUpgrades: (closing) => {
				closeUpgrades(takers, taken.get(context), closing)
			},
			url: () => {
				const url = urls.get(context)
				if (url === undefined) {
					throw new Error(
						"The HTTP server is not running: read its url from your plugin's start.",
					)
				}
				return url
			},
		}
	},
	start: async (context) => {
		const { options, identify, logger } = context
		const port = portOf(options.port)
		const probes = probesOf(context)
		probes.drain =
			options.drain ?? (process.env['NODE_ENV'] === 'production' ? 5000 : 0)
		const mounted = mounts.get(context) ?? []
		const gates = gated.get(context) ?? []
		const app = appOf(options, mounted, { probes, gates }, identify, logger)
		mounts.delete(context)
		const server = serverOf(app.fetch)
		const takers = upgrades.get(context) ?? new Map<string, Taker>()
		const addressOf = addresses(proxiesOf(options.proxies), logger)
		taken.set(
			context,
			upgrading(server, {
				takers,
				gates: [
					...(options.upgrade === undefined ? [] : [options.upgrade]),
					...gates,
				],
				allows: allowing(options),
				addressOf,
				logger,
			}),
		)
		const bound = await listening(server, port)
		servers.set(context, server)
		const url = `http://localhost:${bound}`
		urls.set(context, url)
		logger.info(`Listening on ${url}.`)
	},
	started: (context) => {
		probesOf(context).started = true
	},
	// `/ready` answers 503, and the load balancer has `drain` to leave (D-204).
	stopping: async (context) => {
		const probes = probesOf(context)
		probes.stopping = true
		if (probes.drain > 0) {
			await new Promise((resolve) => setTimeout(resolve, probes.drain))
		}
	},
	// Stops accepting connections, then waits for running requests (D-59, D-106).
	stop: async (context) => {
		const { logger } = context
		const server = servers.get(context)
		if (server === undefined) return
		servers.delete(context)
		urls.delete(context)
		probing.delete(context)
		gated.delete(context)
		const open = taken.get(context) ?? new Map<Duplex, string>()
		taken.delete(context)
		await closed(server, logger, open)
	},
})

/** The probes' state of the context `api` received. */
function probesOf(context: object): Probes & { drain: number } {
	const probes = probing.get(context)
	if (probes === undefined) throw new Error('The HTTP plugin has no api.')
	return probes
}

/** The application's HTTP server (D-66, D-106). */
export const httpPlugin: PluginOf<Http> = http.plugin

const anonymous: Caller = { kind: 'anonymous' }

/**
 * Routes whose context holds the request's caller, `c.var.caller`: the
 * anonymous one when no application read it, as in `routes().request(…)`.
 */
export const routes = (): Routes =>
	new Hono<HttpEnv>().use(async (c, next) => {
		if (!('caller' in c.var)) hold(c, anonymous, '')
		await next()
	})
