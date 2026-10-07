import { definePluginOptionsParser } from '@ultimabase/plugin-kit'
import { normalizeHttpBrowserBootstrapPath } from '@ultimabase/http-plugin'

/** Selects whether a development-only explorer may expose its route. */
export type ApolloSandboxEnvironment = 'development' | 'production'

/** Configures one optional Apollo Sandbox browser route. */
export interface ApolloSandboxPluginOptions {
	/** Explicit deployment environment; no process-global value is inferred. */
	readonly environment: ApolloSandboxEnvironment
	/** Explicitly permits the route when environment is production. */
	readonly allowInProduction?: true
	/** Application-local browser route suffix. @default "/apollo-sandbox" */
	readonly path?: string
}

export interface NormalizedApolloSandboxPluginOptions {
	readonly enabled: boolean
	readonly path: string
}

export const normalizeApolloSandboxPluginOptions: (
	value: unknown,
) => NormalizedApolloSandboxPluginOptions = definePluginOptionsParser({
	name: 'Apollo Sandbox plugin options',
	keys: ['allowInProduction', 'environment', 'path'] as const,
	formatUnknownKey: (key) =>
		`Apollo Sandbox plugin options contains unknown option: ${String(key)}`,
	normalize: ({ allowInProduction, environment, path }) => {
		if (environment !== 'development' && environment !== 'production') {
			throw new TypeError(
				'Apollo Sandbox plugin environment must be development or production',
			)
		}
		if (allowInProduction !== undefined && allowInProduction !== true) {
			throw new TypeError(
				'Apollo Sandbox plugin allowInProduction must be true',
			)
		}
		return {
			enabled: environment === 'development' || allowInProduction === true,
			path: normalizeHttpBrowserBootstrapPath(
				path ?? '/apollo-sandbox',
				'Apollo Sandbox plugin path',
			),
		}
	},
})
