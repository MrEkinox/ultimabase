import {
	graphqlExplorerPlugin,
	type GraphqlExplorerPlugin,
	type GraphqlExplorerPluginOptions,
	type GraphqlExplorerUi,
} from '@ultimabase/graphql-explorer-plugin'
import {
	graphqlPlugin,
	type GraphqlPlugin,
	type GraphqlPluginOptions,
} from '@ultimabase/graphql-plugin'
import {
	graphqlYogaPlugin,
	type GraphqlYogaPlugin,
	type GraphqlYogaPluginOptions,
} from '@ultimabase/graphql-yoga-plugin'
import {
	honoServerPlugin,
	type HonoServerPlugin,
	type HonoServerPluginOptions,
} from '@ultimabase/hono-server-plugin'
import {
	httpPlugin,
	type HttpPlugin,
	type HttpPluginOptions,
} from '@ultimabase/http-plugin'
import {
	restPlugin,
	type RestPlugin,
	type RestPluginOptions,
} from '@ultimabase/rest-plugin'

/** GraphQL options of the preset: the plugin's own, plus its transport. */
export interface ApiServerGraphqlOptions extends GraphqlPluginOptions {
	/**
	 * Serves a GraphQL explorer, in development only unless its options say
	 * otherwise: `'graphiql'`, `'apollo-sandbox'` or explorer options.
	 * @example `explorer: 'graphiql'`
	 */
	readonly explorer?: GraphqlExplorerUi | GraphqlExplorerPluginOptions
	/** Options of the GraphQL-over-HTTP transport (`graphqlYogaPlugin`). */
	readonly yoga?: GraphqlYogaPluginOptions
}

/** Selects and configures the plugins of one REST and GraphQL API server. */
export interface ApiServerOptions {
	/**
	 * Installs REST (`restPlugin`): `true`, or its options.
	 * @example `rest: { openapi: true }`
	 */
	readonly rest?: boolean | RestPluginOptions
	/**
	 * Installs GraphQL and its HTTP transport (`graphqlPlugin`,
	 * `graphqlYogaPlugin`): `true`, or their options.
	 * @example `graphql: { explorer: 'graphiql' }`
	 */
	readonly graphql?: boolean | ApiServerGraphqlOptions
	/**
	 * Options of the HTTP foundation (`httpPlugin`), always installed.
	 * @example `http: { browser: { origins: ['https://app.example.com'] } }`
	 */
	readonly http?: HttpPluginOptions
	/**
	 * Options of the Hono server (`honoServerPlugin`), or `false` to serve the
	 * HTTP foundation with another server plugin.
	 * @example `server: { port: 3000 }`
	 */
	readonly server?: false | HonoServerPluginOptions
}

/** The value one option key holds, `undefined` when the call omits it. */
type OptionOf<TOptions, TKey extends keyof ApiServerOptions> =
	TOptions extends Readonly<Record<TKey, infer TValue>> ? TValue : undefined

type Installed<TOption> = [TOption] extends [false | undefined] ? false : true

type RestPlugins<TOption> =
	Installed<TOption> extends true ? readonly [RestPlugin] : readonly []

type GraphqlPlugins<TOption> =
	Installed<TOption> extends true
		? [TOption] extends [
				Readonly<{
					explorer: GraphqlExplorerUi | GraphqlExplorerPluginOptions
				}>,
			]
			? readonly [GraphqlPlugin, GraphqlYogaPlugin, GraphqlExplorerPlugin]
			: readonly [GraphqlPlugin, GraphqlYogaPlugin]
		: readonly []

type ServerPlugins<TOption> = [TOption] extends [false]
	? readonly []
	: readonly [HonoServerPlugin]

/** The exact plugin list `apiServer(options)` returns, in installation order. */
export type ApiServerPlugins<TOptions extends ApiServerOptions> = readonly [
	HttpPlugin,
	...RestPlugins<OptionOf<TOptions, 'rest'>>,
	...GraphqlPlugins<OptionOf<TOptions, 'graphql'>>,
	...ServerPlugins<OptionOf<TOptions, 'server'>>,
]

const asOptions = <TOptions extends object>(
	value: boolean | TOptions,
): TOptions | undefined => (typeof value === 'object' ? value : undefined)

/**
 * Returns the plugins of a REST and GraphQL API server, each configured with
 * its own options (ADR-0325): `httpPlugin`, `restPlugin`, `graphqlPlugin`,
 * `graphqlYogaPlugin`, `graphqlExplorerPlugin` and `honoServerPlugin`. It
 * hides no code: every plugin stays installable alone.
 *
 * @example
 * ```ts
 * export const App = UltimaBase.use(
 * 	postgresPlugin(),
 * 	...apiServer({ rest: true, graphql: { explorer: 'graphiql' } }),
 * )
 * ```
 */
export const apiServer = <
	const TOptions extends ApiServerOptions = Readonly<Record<never, never>>,
>(
	options: TOptions = {} as TOptions,
): ApiServerPlugins<TOptions> => {
	const { graphql = false, http, rest = false, server } = options
	const graphqlOptions = asOptions(graphql)
	const { explorer, yoga, ...graphqlPluginOptions } = graphqlOptions ?? {}
	const plugins = [
		httpPlugin(http),
		...(rest === false ? [] : [restPlugin(asOptions(rest))]),
		...(graphql === false
			? []
			: [
					graphqlPlugin(graphqlPluginOptions),
					graphqlYogaPlugin(yoga),
					...(explorer === undefined
						? []
						: [
								graphqlExplorerPlugin(
									typeof explorer === 'string' ? { ui: explorer } : explorer,
								),
							]),
				]),
		...(server === false ? [] : [honoServerPlugin(server)]),
	]
	// The list matches ApiServerPlugins<TOptions> entry by entry.
	return Object.freeze(plugins) as unknown as ApiServerPlugins<TOptions>
}
