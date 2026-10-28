// `restPlugin()` (D-129): GraphQL's arguments and responses over resource
// routes, mounted on the HTTP plugin and run as each request's caller.
import type { Http } from '@ultimabase/http'
import { httpPlugin, routes } from '@ultimabase/http'
import type { PluginOf, PluginTypes, UseOf } from 'ultimabase'
import { definePlugin } from 'ultimabase'
import manifest from '../package.json' with { type: 'json' }
import type { RestWith } from './entries.ts'
import { entriesOf } from './entries.ts'
import type { RestFunctionWith } from './functions.ts'
import { functionRoutes } from './functions.ts'
import { modelRoutes } from './models.ts'
import { openapiOf } from './openapi.ts'

export type { RestWith } from './entries.ts'
export type { RestFunctionWith } from './functions.ts'

/** What `restPlugin` takes: `graphqlPlugin`'s options, by name (D-129). */
export interface RestOptions {
	/** `/api` by default. */
	readonly path?: string
	/** Relay connections, or `take` and `skip` lists. */
	readonly pagination?: 'connection' | 'list'
	/** The rows a list returns when none is asked for; 100 by default (D-55). */
	readonly take?: number
	/** The rows a caller other than Master may ask for; 100 by default. */
	readonly maxTake?: number
	/** The deepest a request of a caller other than Master nests; 10 by default. */
	readonly maxDepth?: number
	/**
	 * The most rows a request of a caller other than Master may return, each
	 * list times the lists above it; 20 000 by default.
	 */
	readonly maxRows?: number
}

/** The REST plugin's types (D-57). */
export interface Rest extends PluginTypes {
	readonly name: 'rest'
	readonly appOptions: RestOptions
	readonly requires: Http
	readonly with: RestWith
	readonly functionWith: RestFunctionWith
}

const baseOf = (options: RestOptions): string =>
	(options.path ?? '/api').replace(/\/+$/, '')

const plugin = definePlugin<Rest>({
	name: 'rest',
	manifest,
	requires: { http: httpPlugin },
	api: ({ plugins, models, functions, options }) => {
		const api = {
			entries: entriesOf(models, options),
			pagination: options.pagination ?? 'connection',
			take: options.take ?? 100,
			maxDepth: options.maxDepth ?? 10,
			maxRows: options.maxRows ?? 20_000,
		}
		const base = baseOf(options)
		const app = routes()
		const routed = functionRoutes(app, api, functions, base)
		for (const entry of api.entries.values()) {
			if (entry.visible) modelRoutes(app, api, entry, base)
		}
		// Built at startup, so a name clash refuses to start (D-144).
		const document = openapiOf(api, routed, base, manifest.version)
		app.get(`${base}/openapi.json`, (c) => c.json(document))
		plugins.http.mount(app)
	},
	start: ({ plugins, options, logger }) => {
		if (process.env['NODE_ENV'] === 'production') return
		logger.info(`REST on ${plugins.http.url()}${baseOf(options)}.`)
	},
})

/** The application's REST API, served by `httpPlugin` (D-129). */
export const restPlugin: PluginOf<Rest> = plugin.plugin

/** A model's `.with({ rest })`, from its `use` (D-129). */
export const rest: UseOf<Rest> = plugin.use
