import { isPlainRecord } from '@ultimabase/shared'

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

const optionKeys = new Set(['allowInProduction', 'environment', 'path'])

const normalizePath = (value: unknown): string => {
	const path = value ?? '/apollo-sandbox'
	if (
		typeof path !== 'string' ||
		!path.startsWith('/') ||
		path === '/' ||
		path.includes('?') ||
		path.includes('#') ||
		path.endsWith('/') ||
		path === '/__ultimabase/apps' ||
		path.startsWith('/__ultimabase/apps/')
	) {
		throw new TypeError(
			'Apollo Sandbox plugin path must be a normalized route suffix',
		)
	}
	for (const segment of path.slice(1).split('/')) {
		let decoded: string
		try {
			decoded = decodeURIComponent(segment)
		} catch {
			throw new TypeError(
				'Apollo Sandbox plugin path must be a normalized route suffix',
			)
		}
		if (
			segment.length === 0 ||
			decoded === '.' ||
			decoded === '..' ||
			decoded.includes('/')
		) {
			throw new TypeError(
				'Apollo Sandbox plugin path must be a normalized route suffix',
			)
		}
	}
	return path
}

export const normalizeApolloSandboxPluginOptions = (
	value: unknown,
): NormalizedApolloSandboxPluginOptions => {
	if (!isPlainRecord(value)) {
		throw new TypeError('Apollo Sandbox plugin options must be a plain object')
	}
	for (const key of Reflect.ownKeys(value)) {
		if (typeof key !== 'string' || !optionKeys.has(key)) {
			throw new TypeError(
				`Apollo Sandbox plugin options contains unknown option: ${String(key)}`,
			)
		}
	}
	if (
		value.environment !== 'development' &&
		value.environment !== 'production'
	) {
		throw new TypeError(
			'Apollo Sandbox plugin environment must be development or production',
		)
	}
	if (
		value.allowInProduction !== undefined &&
		value.allowInProduction !== true
	) {
		throw new TypeError('Apollo Sandbox plugin allowInProduction must be true')
	}
	return {
		enabled:
			value.environment === 'development' || value.allowInProduction === true,
		path: normalizePath(value.path),
	}
}
