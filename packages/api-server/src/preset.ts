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
import type { TransportExposureOptions } from '@ultimabase/plugin-kit'
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

/**
 * Selects and configures the plugins of one REST and GraphQL API server.
 * `default`, `hide`, `pagination` and `publicWrites` apply to every
 * installed transport; the same option inside `rest` or `graphql` replaces
 * the shared value for that transport, whole (ADR-0347).
 */
export interface ApiServerOptions {
	/**
	 * Exposure of every schema method that `.with({ expose })` and the
	 * transport keys leave out, on every transport: `true`, `false`, or by
	 * `all`, group, operation or method. A `default` inside `rest` or
	 * `graphql` replaces it for that transport, whole.
	 * @example `default: { count: true }`
	 */
	readonly default?: NonNullable<TransportExposureOptions['default']>
	/**
	 * Public operations that neither REST nor GraphQL exposes. A `hide` inside
	 * `rest` or `graphql` replaces this list for that transport.
	 * @example `hide: [readingTime]`
	 */
	readonly hide?: NonNullable<TransportExposureOptions['hide']>
	/**
	 * Default and largest page size of collection reads on every transport
	 * (ADR-0309). A `pagination` inside `rest` or `graphql` replaces it for
	 * that transport, whole.
	 * @default { defaultTake: 100, maxTake: 1000 }
	 * @example `pagination: { defaultTake: 20, maxTake: 200 }`
	 */
	readonly pagination?: NonNullable<TransportExposureOptions['pagination']>
	/**
	 * Lets every transport start when it exposes writes and no protected
	 * policy (such as Access) is installed: every client may then write
	 * (ADR-0294). A `publicWrites` inside `rest` or `graphql` replaces it.
	 * @default false
	 * @example `publicWrites: true`
	 */
	readonly publicWrites?: NonNullable<TransportExposureOptions['publicWrites']>
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

/** The shared options the call sets, so that an omitted one stays unset. */
const sharedOptions = ({
	default: defaultRule,
	hide,
	pagination,
	publicWrites,
}: ApiServerOptions): TransportExposureOptions => ({
	...(defaultRule === undefined ? {} : { default: defaultRule }),
	...(hide === undefined ? {} : { hide }),
	...(pagination === undefined ? {} : { pagination }),
	...(publicWrites === undefined ? {} : { publicWrites }),
})

/**
 * Returns the plugins of a REST and GraphQL API server, each configured with
 * its own options (ADR-0325): `httpPlugin`, `restPlugin`, `graphqlPlugin`,
 * `graphqlYogaPlugin`, `graphqlExplorerPlugin` and `honoServerPlugin`.
 * `UltimaBase.use()` installs the array in order (ADR-0340). It hides no
 * code: every plugin stays installable alone.
 *
 * @example
 * ```ts
 * export const App = UltimaBase.use(
 * 	postgresPlugin(),
 * 	apiServer({ rest: true, graphql: { explorer: 'graphiql' } }),
 * )
 * ```
 */
export const apiServer = <
	const TOptions extends ApiServerOptions = Readonly<Record<never, never>>,
>(
	options: TOptions = {} as TOptions,
): ApiServerPlugins<TOptions> => {
	const { graphql = false, http, rest = false, server } = options
	const shared = sharedOptions(options)
	const graphqlOptions = asOptions(graphql)
	const { explorer, yoga, ...graphqlPluginOptions } = graphqlOptions ?? {}
	const plugins = [
		httpPlugin(http),
		...(rest === false ? [] : [restPlugin({ ...shared, ...asOptions(rest) })]),
		...(graphql === false
			? []
			: [
					graphqlPlugin({ ...shared, ...graphqlPluginOptions }),
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
