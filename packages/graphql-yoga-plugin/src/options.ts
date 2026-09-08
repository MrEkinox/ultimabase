import { isPlainRecord } from '@ultimabase/shared'

/** Configures the GraphQL-over-HTTP adapter without changing GraphQL execution. */
export interface GraphqlYogaPluginOptions {
	/** Maximum streamed JSON request size in bytes. @default 1048576 */
	readonly bodyLimit?: number
	/** Enables schema introspection over HTTP. @default false */
	readonly introspection?: boolean
	/** Absolute normalized HTTP mount path. @default "/graphql" */
	readonly path?: string
}

export interface NormalizedGraphqlYogaPluginOptions {
	readonly bodyLimit: number
	readonly introspection: boolean
	readonly path: string
}

const optionKeys = new Set(['bodyLimit', 'introspection', 'path'])

const normalizePath = (value: unknown): string => {
	if (value === undefined) return '/graphql'
	if (typeof value !== 'string' || !value.startsWith('/')) {
		throw new TypeError('GraphQL Yoga plugin path must be an absolute path')
	}
	if (value.includes('?') || value.includes('#')) {
		throw new TypeError(
			'GraphQL Yoga plugin path cannot contain a query or fragment',
		)
	}
	if (value.length > 1 && value.endsWith('/')) {
		throw new TypeError('GraphQL Yoga plugin path cannot have a trailing slash')
	}
	const segments = value === '/' ? [] : value.slice(1).split('/')
	if (segments.some((segment) => segment.length === 0)) {
		throw new TypeError(
			'GraphQL Yoga plugin path must not contain empty segments',
		)
	}
	for (const segment of segments) {
		let decoded: string
		try {
			decoded = decodeURIComponent(segment)
		} catch {
			throw new TypeError('GraphQL Yoga plugin path contains invalid encoding')
		}
		if (decoded === '.' || decoded === '..' || decoded.includes('/')) {
			throw new TypeError('GraphQL Yoga plugin path must be normalized')
		}
	}
	return value
}

/** @internal Rejects unknown options before the plugin can declare effects. */
export const normalizeGraphqlYogaPluginOptions = (
	value: unknown,
): NormalizedGraphqlYogaPluginOptions => {
	if (value === undefined) {
		return { bodyLimit: 1_048_576, introspection: false, path: '/graphql' }
	}
	if (!isPlainRecord(value)) {
		throw new TypeError('GraphQL Yoga plugin options must be a plain object')
	}
	for (const key of Reflect.ownKeys(value)) {
		if (typeof key !== 'string' || !optionKeys.has(key)) {
			throw new TypeError(
				`GraphQL Yoga plugin options contains unknown option: ${String(key)}`,
			)
		}
	}
	const bodyLimit = value.bodyLimit ?? 1_048_576
	if (
		typeof bodyLimit !== 'number' ||
		!Number.isSafeInteger(bodyLimit) ||
		bodyLimit < 1
	) {
		throw new TypeError(
			'GraphQL Yoga plugin bodyLimit must be a positive safe integer',
		)
	}
	if (
		value.introspection !== undefined &&
		typeof value.introspection !== 'boolean'
	) {
		throw new TypeError('GraphQL Yoga plugin introspection must be a boolean')
	}
	return {
		bodyLimit,
		introspection: value.introspection ?? false,
		path: normalizePath(value.path),
	}
}
