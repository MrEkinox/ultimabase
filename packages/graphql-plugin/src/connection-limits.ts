import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import { assertGraphqlKnownKeys } from './known-keys.js'

/** The largest value of the GraphQL `Int` scalar. */
export const maximumGraphqlInt = 2_147_483_647

/**
 * Configures the page window of Relay connections, with the same option and
 * defaults as `restPlugin({ pagination })` (ADR-0309).
 *
 * @example `graphqlPlugin({ pagination: { defaultTake: 20, maxTake: 200 } })`
 */
export interface GraphqlPaginationOptions {
	/** Page size used when `first` is omitted. @default 100 */
	readonly defaultTake?: number
	/** Largest accepted `first`; a larger value is a GraphQL error. @default 1000 */
	readonly maxTake?: number
}

/** Configures GraphQL v1 request safety. */
export interface GraphqlExecutionLimits {
	/** Rejects documents with more aliases. @default 100 */
	readonly maxAliases?: number
	/** Rejects selections nested beyond this depth. @default 20 */
	readonly maxDepth?: number
	/** Rejects UTF-8 source documents larger than this many bytes. @default 102400 */
	readonly maxDocumentBytes?: number
	/** Rejects source tokens or parsed AST nodes beyond this count. @default 10000 */
	readonly maxDocumentTokens?: number
	/** Rejects operations with more top-level response fields. @default 20 */
	readonly maxRootFields?: number
	/** Rejects JSON-compatible variables larger than this many bytes. @default 1048576 */
	readonly maxVariablesBytes?: number
}

/** Retains the complete validated request and page limits of one application. */
export interface NormalizedGraphqlExecutionLimits {
	readonly defaultTake: number
	readonly maxAliases: number
	readonly maxDepth: number
	readonly maxDocumentBytes: number
	readonly maxDocumentTokens: number
	readonly maxRootFields: number
	readonly maxTake: number
	readonly maxVariablesBytes: number
}

export const defaultGraphqlExecutionLimits: NormalizedGraphqlExecutionLimits =
	immutableRecord({
		defaultTake: 100,
		maxAliases: 100,
		maxDepth: 20,
		maxDocumentBytes: 100 * 1024,
		maxDocumentTokens: 10_000,
		maxRootFields: 20,
		maxTake: 1000,
		maxVariablesBytes: 1024 * 1024,
	})

const limitKeys = new Set(
	Object.keys(defaultGraphqlExecutionLimits).filter(
		(key) => key !== 'defaultTake' && key !== 'maxTake',
	),
)
const paginationKeys = new Set(['defaultTake', 'maxTake'])

const readLimit = (value: unknown, path: string, minimum: number): number => {
	if (
		typeof value !== 'number' ||
		!Number.isSafeInteger(value) ||
		value < minimum
	) {
		throw new RangeError(
			`${path} must be a safe integer greater than or equal to ${String(minimum)}`,
		)
	}
	return value
}

/** Snapshots the request limits and the Relay page window of one application. */
export const normalizeGraphqlExecutionLimits = (
	limits: unknown,
	pagination?: unknown,
): NormalizedGraphqlExecutionLimits => {
	const path = 'GraphQL plugin limits'
	const value = limits === undefined ? {} : limits
	if (!isPlainRecord(value)) {
		throw new TypeError(`${path} must be a plain object`)
	}
	assertGraphqlKnownKeys(value, limitKeys, path)
	const page = pagination === undefined ? {} : pagination
	if (!isPlainRecord(page)) {
		throw new TypeError('GraphQL plugin pagination must be a plain object')
	}
	assertGraphqlKnownKeys(page, paginationKeys, 'GraphQL plugin pagination')
	const take = (key: 'defaultTake' | 'maxTake'): number =>
		page[key] === undefined
			? defaultGraphqlExecutionLimits[key]
			: readLimit(page[key], `GraphQL plugin pagination.${key}`, 1)
	const defaultTake = take('defaultTake')
	const maxTake = take('maxTake')
	const positiveLimit = (
		key: Exclude<
			keyof NormalizedGraphqlExecutionLimits,
			'defaultTake' | 'maxTake'
		>,
	): number =>
		value[key] === undefined
			? defaultGraphqlExecutionLimits[key]
			: readLimit(value[key], `${path}.${key}`, 1)
	if (defaultTake > maxTake) {
		throw new RangeError(
			'GraphQL plugin pagination.defaultTake must not exceed pagination.maxTake',
		)
	}
	if (defaultTake > maximumGraphqlInt) {
		throw new RangeError(
			'GraphQL plugin pagination.defaultTake must fit the GraphQL Int range',
		)
	}
	return immutableRecord({
		defaultTake,
		maxAliases: positiveLimit('maxAliases'),
		maxDepth: positiveLimit('maxDepth'),
		maxDocumentBytes: positiveLimit('maxDocumentBytes'),
		maxDocumentTokens: positiveLimit('maxDocumentTokens'),
		maxRootFields: positiveLimit('maxRootFields'),
		maxTake,
		maxVariablesBytes: positiveLimit('maxVariablesBytes'),
	})
}
