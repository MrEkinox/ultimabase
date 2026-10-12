import {
	definePluginOptionsParser,
	deriveEnvironmentDefault,
	describeEnvironmentSource,
} from '@ultimabase/plugin-kit'
import { normalizeHttpBrowserBootstrapPath } from '@ultimabase/http-plugin'

/** Selects the explorer a page serves. */
export type GraphqlExplorerUi = 'apollo-sandbox' | 'graphiql'

/** Selects whether a development-only explorer may expose its route. */
export type GraphqlExplorerEnvironment = 'development' | 'production'

/** Configures one optional GraphQL explorer browser route (ADR-0325). */
export interface GraphqlExplorerPluginOptions {
	/**
	 * The explorer to serve: GraphiQL, with pinned scripts and their integrity
	 * hashes, or Apollo Sandbox, whose unpinned script is a documented risk.
	 * @default "graphiql"
	 */
	readonly ui?: GraphqlExplorerUi
	/**
	 * Explicit deployment environment. When omitted, `NODE_ENV` decides:
	 * `production` means production, anything else development (ADR-0312).
	 */
	readonly environment?: GraphqlExplorerEnvironment
	/** Explicitly permits the route in production; without it production serves nothing. */
	readonly allowInProduction?: true
	/**
	 * Application-local browser route suffix.
	 * @default "/graphiql" or "/apollo-sandbox", after `ui`
	 */
	readonly path?: string
}

export interface NormalizedGraphqlExplorerPluginOptions {
	readonly enabled: boolean
	readonly path: string
	/** Why the route is or is not served, for the plugin's debug line. */
	readonly reason: string
	readonly ui: GraphqlExplorerUi
}

const uis: ReadonlySet<unknown> = new Set(['apollo-sandbox', 'graphiql'])
const isUi = (value: unknown): value is GraphqlExplorerUi => uis.has(value)

export const normalizeGraphqlExplorerPluginOptions: (
	value: unknown,
) => NormalizedGraphqlExplorerPluginOptions = definePluginOptionsParser({
	name: 'GraphQL explorer plugin options',
	keys: ['allowInProduction', 'environment', 'path', 'ui'] as const,
	formatUnknownKey: (key) =>
		`GraphQL explorer plugin options contains unknown option: ${String(key)}`,
	normalize: ({ allowInProduction, environment, path, ui = 'graphiql' }) => {
		if (!isUi(ui)) {
			throw new TypeError(
				'GraphQL explorer plugin ui must be graphiql or apollo-sandbox',
			)
		}
		if (
			environment !== undefined &&
			environment !== 'development' &&
			environment !== 'production'
		) {
			throw new TypeError(
				'GraphQL explorer plugin environment must be development or production',
			)
		}
		if (allowInProduction !== undefined && allowInProduction !== true) {
			throw new TypeError(
				'GraphQL explorer plugin allowInProduction must be true',
			)
		}
		const derived = deriveEnvironmentDefault(environment, {
			development: 'development' as const,
			production: 'production' as const,
		})
		const source = describeEnvironmentSource(derived.source)
		return {
			enabled: derived.value === 'development' || allowInProduction === true,
			reason:
				derived.value === 'development'
					? `development (${source})`
					: allowInProduction === true
						? `production with allowInProduction (${source})`
						: `production without allowInProduction (${source})`,
			path: normalizeHttpBrowserBootstrapPath(
				path ?? `/${ui}`,
				'GraphQL explorer plugin path',
			),
			ui,
		}
	},
})
