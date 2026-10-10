import { immutableRecord } from '@ultimabase/shared'

import type { QuerySkipPaginationNode } from '../ast/contracts.js'
import { assertPlainObject } from '../../exact-object-validation.js'

/** Describes an optional number of rows to skip, independent from `take`. */
export interface QuerySkipPaginationInput {
	readonly skip?: number
}

const parsePaginationInteger = (
	value: unknown,
	path: string,
	minimum: number,
): number => {
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

const parseOptionalPaginationInteger = (
	value: unknown,
	path: string,
	minimum: number,
): number | undefined =>
	value === undefined ? undefined : parsePaginationInteger(value, path, minimum)

/** Validates the optional page-size value independently from the skipped rows. */
export const normalizeQueryTake = (take?: number): number | undefined =>
	parseOptionalPaginationInteger(take, 'query.take', 1)

/** Removes no-op skips and freezes every explicit pagination value. */
export const normalizeQuerySkipPagination = (
	input?: QuerySkipPaginationInput,
): QuerySkipPaginationNode | undefined => {
	if (input === undefined) {
		return undefined
	}

	const untrustedInput: unknown = input

	assertPlainObject(untrustedInput, 'skip pagination must be an object')

	const skip =
		parseOptionalPaginationInteger(untrustedInput.skip, 'pagination.skip', 0) ??
		0

	return skip === 0
		? undefined
		: immutableRecord({ kind: 'skip-pagination', skip })
}
