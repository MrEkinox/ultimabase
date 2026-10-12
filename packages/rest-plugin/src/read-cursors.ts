import { FrameworkError, type SchemaDefinition } from '@ultimabase/core'
import {
	decodeQueryCursor,
	encodeQueryCursor,
	type QueryCursorOrderBy,
} from '@ultimabase/core/plugin'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import { restErrorDetails, type RestFailure } from './errors.js'

/** Reads a decoded `orderBy` object, or fails as malformed REST input. */
const readOrderBy = (
	value: unknown,
	invalid: RestFailure,
): QueryCursorOrderBy | undefined => {
	if (value === undefined) return undefined
	if (!isPlainRecord(value)) {
		throw invalid(undefined, restErrorDetails('orderBy', 'must be an object'))
	}
	return immutableRecord(
		Object.fromEntries(
			Object.entries(value).map(
				([field, direction]): [string, 'asc' | 'desc'] => {
					if (direction !== 'asc' && direction !== 'desc') {
						throw invalid(
							undefined,
							restErrorDetails('orderBy', 'must order by asc or desc', [field]),
						)
					}
					return [field, direction]
				},
			),
		),
	)
}

/** Replaces the opaque `after` cursor by the position it encodes (ADR-0309). */
export const decodeRestAfterCursor = (
	schema: SchemaDefinition,
	value: Readonly<Record<string, unknown>>,
	invalid: RestFailure,
): Readonly<Record<string, unknown>> => {
	if (!Object.hasOwn(value, 'after')) return value
	const { after } = value
	if (typeof after !== 'string') {
		throw invalid(
			undefined,
			restErrorDetails('after', 'must be a string cursor'),
		)
	}
	return immutableRecord({
		...value,
		after: decodeQueryCursor(
			schema,
			readOrderBy(value.orderBy, invalid),
			after,
		),
	})
}

/** Encodes the cursor of the last returned row for the same `orderBy`. */
export const encodeRestNextCursor = (
	schema: SchemaDefinition,
	orderBy: unknown,
	row: unknown,
	invalid: RestFailure,
): string => encodeQueryCursor(schema, readOrderBy(orderBy, invalid), row)

/**
 * An invalid `after` keeps Core's public `VALIDATION_ERROR` (ADR-0309); every
 * other normalization failure stays the opaque REST read error.
 */
export const isRestPositionError = (error: unknown): boolean =>
	error instanceof FrameworkError &&
	error.code === 'VALIDATION_ERROR' &&
	error.publicDetails?.parameter === 'after'
