// `graphqlPlugin()` (D-107): a Relay schema generated from the models,
// mounted on the HTTP plugin and run as each request's caller.
import type { GraphQLSchema } from 'graphql'
import { execute, NoSchemaIntrospectionCustomRule, validate } from 'graphql'
import { createHandler } from 'graphql-http/lib/use/fetch'
import type { HttpApi } from '@ultimabase/http'
import { httpPlugin, routes } from '@ultimabase/http'
import type { Caller, PluginOf, PluginTypes, UseOf } from 'ultimabase'
import { definePlugin } from 'ultimabase'
import manifest from '../package.json' with { type: 'json' }
import { depthRule } from './depth.ts'
import { formatter } from './errors.ts'
import { graphiqlPage } from './graphiql.ts'
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
	/** The deepest a document of a caller other than Master nests; 10 by default. */
	readonly maxDepth?: number
	/**
	 * Introspection and "Did you mean" suggestions: closed in production,
	 * open elsewhere, unless set.
	 */
	readonly introspection?: boolean
	/** Replaces the generated schema with one built from it (D-45). */
	readonly extend?: (schema: GraphQLSchema) => GraphQLSchema
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
		const generated = schemaOf(registry)
		const schema = options.extend?.(generated) ?? generated
		const production = process.env['NODE_ENV'] === 'production'
		const hideSuggestions = !(options.introspection ?? !production)
		const closed = hideSuggestions ? [NoSchemaIntrospectionCustomRule] : []
		const depth = depthRule(options.maxDepth ?? 10)
		// The caller the HTTP plugin read, by its request.
		const callers = new WeakMap<Request, Caller>()
		const callerOf = (request: Request): Caller => {
			const caller = callers.get(request)
			if (caller === undefined) throw new Error('No caller was read.')
			return caller
		}
		const handler = createHandler<Context>({
			schema,
			context: (request) => ({ caller: callerOf(request.raw) }),
			validationRules: (request, _, specified) => [
				...specified,
				...closed,
				...(callerOf(request.raw).kind === 'master' ? [] : [depth]),
			],
			validate: (on, document, rules) =>
				validate(on, document, rules, { hideSuggestions }),
			execute: async (args) => execute({ ...args, hideSuggestions }),
			formatError: formatter(logger),
		})
		const path = options.path ?? '/graphql'
		const page = production ? undefined : graphiqlPage(path)
		plugins.http.mount(
			routes().on(['GET', 'POST'], path, async (c) => {
				// A browser opening the URL, not a client sending a document.
				const browsing =
					c.req.method === 'GET' &&
					c.req.header('accept')?.includes('text/html') === true
				if (page !== undefined && browsing) return page()
				callers.set(c.req.raw, c.var.caller)
				return handler(c.req.raw)
			}),
		)
	},
	start: ({ plugins, options, logger }) => {
		if (process.env['NODE_ENV'] === 'production') return
		logger.info(
			`GraphiQL on ${plugins.http.url()}${options.path ?? '/graphql'}.`,
		)
	},
})

/** The application's GraphQL API, served by `httpPlugin` (D-107). */
export const graphqlPlugin: PluginOf<Graphql> = plugin.plugin

/** A model's `.with({ graphql })`, from its `use` (D-107). */
export const graphql: UseOf<Graphql> = plugin.use
