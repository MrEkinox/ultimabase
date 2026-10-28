// `graphqlPlugin()` (D-107, D-109): a Relay schema generated from the models
// and the functions, mounted on the HTTP plugin and run as each request's
// caller.
import type { GraphQLSchema } from 'graphql'
import {
	executeRootSelectionSet,
	MaxIntrospectionDepthRule,
	NoSchemaIntrospectionCustomRule,
	parse,
	validate,
	validateExecutionArgs,
} from 'graphql'
import { createHandler } from 'graphql-http/lib/use/fetch'
import type { Http } from '@ultimabase/http'
import { clientOf, httpPlugin, routes } from '@ultimabase/http'
import type { Caller, Client, PluginOf, PluginTypes, UseOf } from 'ultimabase'
import { definePlugin } from 'ultimabase'
import manifest from '../package.json' with { type: 'json' }
import { depthRule, introspectionDepthRule } from './depth.ts'
import { formatter } from './errors.ts'
import type { GraphqlFunctionWith } from './functions.ts'
import { functionFields } from './functions.ts'
import { graphiqlPage } from './graphiql.ts'
import { overlapRefusal } from './overlap.ts'
import { rootNames } from './names.ts'
import type { Context, Entry, GraphqlWith } from './registry.ts'
import { Registry } from './registry.ts'
import { rowBudget } from './rows.ts'
import { schemaOf } from './schema.ts'
import { selectFor } from './select.ts'

export type { GraphqlFunctionWith } from './functions.ts'
export type { Context as GraphqlContext, GraphqlWith } from './registry.ts'

/** What `graphqlPlugin` takes (D-107). */
export interface GraphqlOptions {
	/** `/graphql` by default. */
	readonly path?: string
	/** Relay connections, or `take` and `skip` lists. */
	readonly pagination?: 'connection' | 'list'
	/** The rows a list returns when none is asked for; 100 by default (D-55). */
	readonly take?: number
	/** The rows a caller other than Master may ask for; 100 by default. */
	readonly maxTake?: number
	/** The deepest a document of a caller other than Master nests; 10 by default. */
	readonly maxDepth?: number
	/**
	 * The most rows a document of a caller other than Master may return, each
	 * list times the lists above it; 20 000 by default.
	 */
	readonly maxRows?: number
	/**
	 * Introspection and "Did you mean" suggestions: closed in production,
	 * open elsewhere, unless set.
	 */
	readonly introspection?: boolean
	/** Replaces the generated schema with one built from it (D-45). */
	readonly extend?: (schema: GraphQLSchema) => GraphQLSchema
}

/** The GraphQL plugin's types (D-57). */
export interface Graphql extends PluginTypes {
	readonly name: 'graphql'
	readonly appOptions: GraphqlOptions
	readonly requires: Http
	readonly with: GraphqlWith
	readonly functionWith: GraphqlFunctionWith
}

/** About ten times the standard introspection query. */
const maxTokens = 2000

const plugin = definePlugin<Graphql>({
	name: 'graphql',
	manifest,
	requires: { http: httpPlugin },
	api: ({ plugins, models, functions, options, logger }) => {
		const take = options.take ?? 100
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
		const called = functionFields(registry, functions, take)
		const generated = schemaOf(registry, called)
		const schema = options.extend?.(generated) ?? generated
		const production = process.env['NODE_ENV'] === 'production'
		const hideSuggestions = !(options.introspection ?? !production)
		const closed = hideSuggestions ? [NoSchemaIntrospectionCustomRule] : []
		const maxDepth = options.maxDepth ?? 10
		const depth = depthRule(maxDepth)
		const maxRows = options.maxRows ?? 20_000
		const budget = rowBudget(registry, { maxRows, maxDepth }, called.reads)
		// The contexts of Master's requests, which no budget limits.
		const exempt = new WeakSet<object>()
		// The caller the HTTP plugin read and the client, by its request.
		const requests = new WeakMap<
			Request,
			{ readonly caller: Caller; readonly client: Client }
		>()
		const heldOf = (request: Request) => {
			const held = requests.get(request)
			if (held === undefined) throw new Error('No caller was read.')
			return held
		}
		const handler = createHandler<Context>({
			schema,
			// Validation is quadratic in a field repeated under one key, so a
			// document is bounded before it is validated.
			parse: (source) => parse(source, { maxTokens }),
			context: (request) => {
				const { caller, client } = heldOf(request.raw)
				const master = caller.kind === 'master'
				const select = selectFor(registry, master)
				const context = { caller, client, select }
				if (master) exempt.add(context)
				return context
			},
			validationRules: (request, _, specified) => [
				...specified.filter((rule) => rule !== MaxIntrospectionDepthRule),
				introspectionDepthRule,
				...closed,
				...(heldOf(request.raw).caller.kind === 'master' ? [] : [depth]),
			],
			validate: (on, document, rules) => {
				const refused = overlapRefusal(document)
				if (refused !== undefined) return [refused]
				return validate(on, document, rules, { hideSuggestions })
			},
			execute: async (args) => {
				const validated = validateExecutionArgs({ ...args, hideSuggestions })
				if (!('schema' in validated)) return { errors: validated }
				const { contextValue } = validated
				const master =
					typeof contextValue === 'object' &&
					contextValue !== null &&
					exempt.has(contextValue)
				const refused = master ? undefined : budget(validated)
				if (refused !== undefined) return { errors: [refused] }
				return executeRootSelectionSet(validated)
			},
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
				// A middleware may have read the body: Hono kept it, not the request.
				const request =
					c.req.method === 'POST' && c.req.raw.bodyUsed
						? new Request(c.req.raw, {
								method: 'POST',
								body: await c.req.text(),
							})
						: c.req.raw
				const { client, sent } = clientOf(c)
				requests.set(request, { caller: c.var.caller, client })
				return sent(await handler(request))
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
