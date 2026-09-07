import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

const maximumGraphqlInt = 2_147_483_647

/** Configures the GraphQL v1 forward-page window. */
export interface GraphqlExecutionLimits {
	/** Sets the page size used when `first` is omitted. @default 25 */
	readonly defaultPageSize?: number
	/** Rejects larger client-provided `first` values. @default 100 */
	readonly maxPageSize?: number
}

/** Retains the complete validated page limits used by one application. */
export interface NormalizedGraphqlExecutionLimits {
	readonly defaultPageSize: number
	readonly maxPageSize: number
}

export const defaultGraphqlExecutionLimits: NormalizedGraphqlExecutionLimits =
	immutableRecord({ defaultPageSize: 25, maxPageSize: 100 })

const limitKeys = new Set(['defaultPageSize', 'maxPageSize'])

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
	return immutableRecord({ defaultPageSize, maxPageSize })
}
