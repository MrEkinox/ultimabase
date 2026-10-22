// `graphqlPlugin()` (D-107): a Relay schema generated from the models,
// mounted on the HTTP plugin and run as each request's caller.
import { createHandler } from 'graphql-http/lib/use/fetch'
import type { HttpApi } from '@ultimabase/http'
import { httpPlugin, routes } from '@ultimabase/http'
import type { Caller, PluginOf, PluginTypes, UseOf } from 'ultimabase'
import { definePlugin } from 'ultimabase'
import manifest from '../package.json' with { type: 'json' }
import { formatter } from './errors.ts'
import { rootNames } from './names.ts'
import type { Context, Entry, GraphqlWith } from './registry.ts'
import { Registry } from './registry.ts'
import { schemaOf } from './schema.ts'

export type { GraphqlWith } from './registry.ts'

/** What `graphqlPlugin` takes (D-107). */
export interface GraphqlOptions {
	/** `/graphql` by default. */
	readonly path?: string
	/** Relay connections, or `take` and `skip` lists. */
	readonly pagination?: 'connection' | 'list'
	/** The rows a list returns when none is asked for; 20 by default. */
	readonly take?: number
	/** The rows a caller other than Master may ask for; 100 by default. */
	readonly maxTake?: number
}

interface Http extends PluginTypes {
	readonly name: 'http'
	readonly api: HttpApi
}

interface Graphql extends PluginTypes {
	readonly name: 'graphql'
	readonly appOptions: GraphqlOptions
	readonly requires: Http
	readonly with: GraphqlWith
}

const plugin = definePlugin<Graphql>({
	name: 'graphql',
	manifest,
	requires: { http: httpPlugin },
	api: ({ plugins, models, options, logger }) => {
		const take = options.take ?? 20
		const entries = new Map<string, Entry>()
		for (const exposed of models) {
			const name = exposed.schema.name
			const own = exposed.with === false ? {} : (exposed.with ?? {})
			entries.set(name, {
				exposed,
				model: exposed.schema,
				visible: exposed.with !== false,
				...rootNames(name, own.plural),
				take,
				maxTake: own.maxTake ?? options.maxTake ?? 100,
			})
		}
		const registry = new Registry(entries, {
			pagination: options.pagination ?? 'connection',
		})
		const schema = schemaOf(registry)
		// The caller the HTTP plugin read, by its request.
		const callers = new WeakMap<Request, Caller>()
		const handler = createHandler<Context>({
			schema,
			context: (request) => {
				const caller = callers.get(request.raw)
				if (caller === undefined) throw new Error('No caller was read.')
				return { caller }
			},
			formatError: formatter(logger),
		})
		plugins.http.mount(
			routes().on(['GET', 'POST'], options.path ?? '/graphql', async (c) => {
				callers.set(c.req.raw, c.var.caller)
				return handler(c.req.raw)
			}),
		)
	},
})

/** The application's GraphQL API, served by `httpPlugin` (D-107). */
export const graphqlPlugin: PluginOf<Graphql> = plugin.plugin

/** A model's `.with({ graphql })`, from its `use` (D-107). */
export const graphql: UseOf<Graphql> = plugin.use
