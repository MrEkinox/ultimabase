import {
	definePluginOptionsParser,
	deriveEnvironmentDefault,
	describeEnvironmentSource,
} from '@ultimabase/plugin-kit'
import { normalizeHttpBrowserBootstrapPath } from '@ultimabase/http-plugin'

/** Selects whether a development-only explorer may expose its route. */
export type GraphiqlEnvironment = 'development' | 'production'

/** Configures one optional GraphiQL browser route. */
export interface GraphiqlPluginOptions {
	/**
	 * Explicit deployment environment. When omitted, `NODE_ENV` decides:
	 * `production` means production, anything else development (ADR-0312).
	 */
	readonly environment?: GraphiqlEnvironment
	/** Explicitly permits the route in production; without it production serves nothing. */
	readonly allowInProduction?: true
	/** Application-local browser route suffix. @default "/graphiql" */
	readonly path?: string
}

export interface NormalizedGraphiqlPluginOptions {
	readonly enabled: boolean
	readonly path: string
	/** Why the route is or is not served, for the plugin's debug line. */
	readonly reason: string
}

export const normalizeGraphiqlPluginOptions: (
	value: unknown,
) => NormalizedGraphiqlPluginOptions = definePluginOptionsParser({
	name: 'GraphiQL plugin options',
	keys: ['allowInProduction', 'environment', 'path'] as const,
	formatUnknownKey: (key) =>
		`GraphiQL plugin options contains unknown option: ${String(key)}`,
	normalize: ({ allowInProduction, environment, path }) => {
		if (
			environment !== undefined &&
			environment !== 'development' &&
			environment !== 'production'
		) {
			throw new TypeError(
				'GraphiQL plugin environment must be development or production',
			)
		}
		if (allowInProduction !== undefined && allowInProduction !== true) {
			throw new TypeError('GraphiQL plugin allowInProduction must be true')
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
				path ?? '/graphiql',
				'GraphiQL plugin path',
			),
		}
	},
})
