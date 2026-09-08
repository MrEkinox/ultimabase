import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

const maximumGraphqlInt = 2_147_483_647

/** Configures GraphQL v1 request safety and the forward-page window. */
export interface GraphqlExecutionLimits {
	/** Sets the page size used when `first` is omitted. @default 25 */
	readonly defaultPageSize?: number
	/** Rejects documents with more aliases. @default 100 */
	readonly maxAliases?: number
	/** Rejects selections nested beyond this depth. @default 20 */
	readonly maxDepth?: number
	/** Rejects UTF-8 source documents larger than this many bytes. @default 102400 */
	readonly maxDocumentBytes?: number
	/** Rejects source tokens or parsed AST nodes beyond this count. @default 10000 */
	readonly maxDocumentTokens?: number
	/** Rejects larger client-provided `first` values. @default 100 */
	readonly maxPageSize?: number
	/** Rejects operations with more top-level response fields. @default 20 */
	readonly maxRootFields?: number
	/** Rejects JSON-compatible variables larger than this many bytes. @default 1048576 */
	readonly maxVariablesBytes?: number
}

/** Retains the complete validated page limits used by one application. */
export interface NormalizedGraphqlExecutionLimits {
	readonly defaultPageSize: number
	readonly maxAliases: number
	readonly maxDepth: number
	readonly maxDocumentBytes: number
	readonly maxDocumentTokens: number
	readonly maxPageSize: number
	readonly maxRootFields: number
	readonly maxVariablesBytes: number
}

export const defaultGraphqlExecutionLimits: NormalizedGraphqlExecutionLimits =
	immutableRecord({
		defaultPageSize: 25,
		maxAliases: 100,
		maxDepth: 20,
		maxDocumentBytes: 100 * 1024,
		maxDocumentTokens: 10_000,
		maxPageSize: 100,
		maxRootFields: 20,
		maxVariablesBytes: 1024 * 1024,
	})

const limitKeys = new Set([
	'defaultPageSize',
	'maxAliases',
	'maxDepth',
	'maxDocumentBytes',
	'maxDocumentTokens',
	'maxPageSize',
	'maxRootFields',
	'maxVariablesBytes',
])

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

/** Snapshots the page limits implemented by the Relay connection owner. */
export const normalizeGraphqlExecutionLimits = (
	value: unknown,
	path = 'GraphQL plugin limits',
): NormalizedGraphqlExecutionLimits => {
	if (!isPlainRecord(value)) {
		throw new TypeError(`${path} must be a plain object`)
	}
	for (const key of Reflect.ownKeys(value)) {
		if (typeof key !== 'string' || !limitKeys.has(key)) {
			throw new TypeError(`${path} contains unknown option: ${String(key)}`)
		}
	}
	const defaultPageSize =
		value.defaultPageSize === undefined
			? defaultGraphqlExecutionLimits.defaultPageSize
			: readLimit(value.defaultPageSize, `${path}.defaultPageSize`, 0)
	const maxPageSize =
		value.maxPageSize === undefined
			? defaultGraphqlExecutionLimits.maxPageSize
			: readLimit(value.maxPageSize, `${path}.maxPageSize`, 1)
	const positiveLimit = (
		key: Exclude<
			keyof NormalizedGraphqlExecutionLimits,
			'defaultPageSize' | 'maxPageSize'
		>,
	): number =>
		value[key] === undefined
			? defaultGraphqlExecutionLimits[key]
			: readLimit(value[key], `${path}.${key}`, 1)
	if (defaultPageSize > maximumGraphqlInt) {
		throw new RangeError(
			`${path}.defaultPageSize must fit the GraphQL Int range`,
		)
	}
	if (defaultPageSize > maxPageSize) {
		throw new RangeError(
			`${path}.defaultPageSize must not exceed ${path}.maxPageSize`,
		)
	}
	return immutableRecord({
		defaultPageSize,
		maxAliases: positiveLimit('maxAliases'),
		maxDepth: positiveLimit('maxDepth'),
		maxDocumentBytes: positiveLimit('maxDocumentBytes'),
		maxDocumentTokens: positiveLimit('maxDocumentTokens'),
		maxPageSize,
		maxRootFields: positiveLimit('maxRootFields'),
		maxVariablesBytes: positiveLimit('maxVariablesBytes'),
	})
}
