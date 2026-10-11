import {
	definePluginOptionsParser,
	deriveEnvironmentDefault,
	describeEnvironmentSource,
} from '@ultimabase/plugin-kit'
import { normalizeHttpBrowserBootstrapPath } from '@ultimabase/http-plugin'

/** Selects whether a development-only explorer may expose its route. */
export type ApolloSandboxEnvironment = 'development' | 'production'

/** Configures one optional Apollo Sandbox browser route. */
export interface ApolloSandboxPluginOptions {
	/**
	 * Explicit deployment environment. When omitted, `NODE_ENV` decides:
	 * `production` means production, anything else development (ADR-0312).
	 */
	readonly environment?: ApolloSandboxEnvironment
	/** Explicitly permits the route in production; without it production serves nothing. */
	readonly allowInProduction?: true
	/** Application-local browser route suffix. @default "/apollo-sandbox" */
	readonly path?: string
}

export interface NormalizedApolloSandboxPluginOptions {
	readonly enabled: boolean
	readonly path: string
	/** Why the route is or is not served, for the plugin's debug line. */
	readonly reason: string
}

export const normalizeApolloSandboxPluginOptions: (
	value: unknown,
) => NormalizedApolloSandboxPluginOptions = definePluginOptionsParser({
	name: 'Apollo Sandbox plugin options',
	keys: ['allowInProduction', 'environment', 'path'] as const,
	formatUnknownKey: (key) =>
		`Apollo Sandbox plugin options contains unknown option: ${String(key)}`,
	normalize: ({ allowInProduction, environment, path }) => {
		if (
			environment !== undefined &&
			environment !== 'development' &&
			environment !== 'production'
		) {
			throw new TypeError(
				'Apollo Sandbox plugin environment must be development or production',
			)
		}
		if (allowInProduction !== undefined && allowInProduction !== true) {
			throw new TypeError(
				'Apollo Sandbox plugin allowInProduction must be true',
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
				path ?? '/apollo-sandbox',
				'Apollo Sandbox plugin path',
			),
		}
	},
})
