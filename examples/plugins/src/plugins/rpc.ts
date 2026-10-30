// A transport: `POST /rpc/<name>` runs the function `<name>` as the request's
// caller, and answers `{ output }`. It mounts its routes on the HTTP plugin.
//#region types
import type { Http } from '@ultimabase/http'
import { clientOf, httpPlugin, routes, validate } from '@ultimabase/http'
import type { PluginOf, PluginTypes, UseOf } from 'ultimabase'
import { definePlugin, isLocalHost, Refused } from 'ultimabase'
import { z } from 'zod'

export interface Rpc extends PluginTypes {
	readonly name: 'rpc'
	/** `rpcPlugin({ path })`, `/rpc` by default. */
	readonly appOptions: { readonly path?: string }
	readonly requires: Http
	/** What it offers other plugins: a function's address. */
	readonly api: { readonly url: (name: string) => string }
	/** `.with({ rpc: false })`, on a function whose `use` lists `rpc()`. */
	readonly functionWith: false
}
//#endregion

//#region definition
const definition = definePlugin<Rpc>({
	name: 'rpc',
	manifest: {
		name: 'example-rpc',
		version: '1.0.0',
		peerDependencies: { ultimabase: '*', '@ultimabase/http': '*' },
	},
	requires: { http: httpPlugin },
	//#endregion
	//#region api
	api: ({ plugins, functions, options }) => {
		const base = options.path ?? '/rpc'
		const app = routes()
		const names: string[] = []
		for (const fn of functions) {
			if (fn.with === false) continue
			// A plugin's function is named after its plugin.
			const name = fn.plugin === undefined ? fn.name : `${fn.plugin}.${fn.name}`
			if (fn.output !== undefined && fn.output.kind !== 'schema') {
				throw new Refused(
					`rpc answers JSON, and ${name} returns a model: give it a schema output, or .with({ rpc: false }).`,
				)
			}
			names.push(name)
			app.post(`${base}/${name}`, validate('json', z.unknown()), async (c) => {
				// The request's cookies and address, for the function's `client`.
				const { client, sent } = clientOf(c)
				const input: unknown = c.req.valid('json')
				const output = await fn.run(input, { as: c.var.caller }, client)
				return sent(c.json({ output: output ?? null }))
			})
		}
		// The list of functions, for a developer on this machine only.
		app.get(base, (c) =>
			isLocalHost(new URL(c.req.url).hostname) ? c.json(names) : c.notFound(),
		)
		plugins.http.mount(app)
		// The server's address is known once it listens: read it when called.
		return { url: (name) => `${plugins.http.url()}${base}/${name}` }
	},
	//#endregion
	//#region start
	start: ({ plugins, options, logger }) => {
		if (process.env['NODE_ENV'] === 'production') return
		logger.info(`RPC on ${plugins.http.url()}${options.path ?? '/rpc'}.`)
	},
	//#endregion
})

//#region exports
/** The entry of a function's `use`, for its `.with({ rpc })`. */
export const rpc: UseOf<Rpc> = definition.use
export const rpcPlugin: PluginOf<Rpc> = definition.plugin
//#endregion
