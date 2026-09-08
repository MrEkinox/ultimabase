import { isPlainRecord } from '@ultimabase/shared'

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
	readonly environment: GraphiqlEnvironment
	readonly path: string
}

const optionKeys = new Set(['allowInProduction', 'environment', 'path'])

const normalizePath = (value: unknown): string => {
	const path = value ?? '/graphiql'
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
			'GraphiQL plugin path must be a normalized route suffix',
		)
	}
	for (const segment of path.slice(1).split('/')) {
		let decoded: string
		try {
			decoded = decodeURIComponent(segment)
		} catch {
			throw new TypeError(
				'GraphiQL plugin path must be a normalized route suffix',
			)
		}
		if (
			segment.length === 0 ||
			decoded === '.' ||
			decoded === '..' ||
			decoded.includes('/')
		) {
			throw new TypeError(
				'GraphiQL plugin path must be a normalized route suffix',
			)
		}
	}
	return path
}

export const normalizeGraphiqlPluginOptions = (
	value: unknown,
): NormalizedGraphiqlPluginOptions => {
	if (!isPlainRecord(value)) {
		throw new TypeError('GraphiQL plugin options must be a plain object')
	}
	for (const key of Reflect.ownKeys(value)) {
		if (typeof key !== 'string' || !optionKeys.has(key)) {
			throw new TypeError(
				`GraphiQL plugin options contains unknown option: ${String(key)}`,
			)
		}
	}
	if (
		value.environment !== 'development' &&
		value.environment !== 'production'
	) {
		throw new TypeError(
			'GraphiQL plugin environment must be development or production',
		)
	}
	if (
		value.allowInProduction !== undefined &&
		value.allowInProduction !== true
	) {
		throw new TypeError('GraphiQL plugin allowInProduction must be true')
	}
	return {
		enabled:
			value.environment === 'development' || value.allowInProduction === true,
		environment: value.environment,
		path: normalizePath(value.path),
	}
}
