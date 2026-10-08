import { immutableRecord } from '@ultimabase/shared'

import type { QueryOffsetPaginationNode } from '../ast/contracts.js'
import { assertPlainObject } from '../../exact-object-validation.js'

/** Describes an optional offset without duplicating the independent limit. */
export interface QueryOffsetPaginationInput {
	readonly offset?: number
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

/** Validates the optional page-size value independently from offset position. */
export const normalizeQueryLimit = (limit?: number): number | undefined =>
	parseOptionalPaginationInteger(limit, 'query.limit', 1)

/** Removes no-op offsets and freezes every explicit pagination value. */
export const normalizeQueryOffsetPagination = (
	input?: QueryOffsetPaginationInput,
): QueryOffsetPaginationNode | undefined => {
	if (input === undefined) {
		return undefined
	}

	const untrustedInput: unknown = input

	assertPlainObject(untrustedInput, 'offset pagination must be an object')

	const offset =
		parseOptionalPaginationInteger(
			untrustedInput.offset,
			'pagination.offset',
			0,
		) ?? 0

	return offset === 0
		? undefined
		: immutableRecord({ kind: 'offset-pagination', offset })
}
