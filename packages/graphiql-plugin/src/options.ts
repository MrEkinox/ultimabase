import { definePluginOptionsParser } from '@ultimabase/plugin-kit'
import { normalizeHttpBrowserBootstrapPath } from '@ultimabase/http-plugin'

/** Selects whether a development-only explorer may expose its route. */
export type GraphiqlEnvironment = 'development' | 'production'

/** Configures one optional GraphiQL browser route. */
export interface GraphiqlPluginOptions {
	/** Explicit deployment environment; no process-global value is inferred. */
	readonly environment: GraphiqlEnvironment
	/** Explicitly permits the route when environment is production. */
	readonly allowInProduction?: true
	/** Application-local browser route suffix. @default "/graphiql" */
	readonly path?: string
}

export interface NormalizedGraphiqlPluginOptions {
	readonly enabled: boolean
	readonly path: string
}

export const normalizeGraphiqlPluginOptions: (
	value: unknown,
) => NormalizedGraphiqlPluginOptions = definePluginOptionsParser({
	name: 'GraphiQL plugin options',
	keys: ['allowInProduction', 'environment', 'path'] as const,
	formatUnknownKey: (key) =>
		`GraphiQL plugin options contains unknown option: ${String(key)}`,
	normalize: ({ allowInProduction, environment, path }) => {
		if (environment !== 'development' && environment !== 'production') {
			throw new TypeError(
				'GraphiQL plugin environment must be development or production',
			)
		}
		if (allowInProduction !== undefined && allowInProduction !== true) {
			throw new TypeError('GraphiQL plugin allowInProduction must be true')
		}
		return {
			enabled: environment === 'development' || allowInProduction === true,
			path: normalizeHttpBrowserBootstrapPath(
				path ?? '/graphiql',
				'GraphiQL plugin path',
			),
		}
	},
})
