import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import type { QueryOffsetPaginationNode } from '../ast/contracts.js'

/** Describes explicit offset pagination before cursor normalization is added. */
export interface QueryOffsetPaginationInput {
	readonly limit?: number
	readonly skip?: number
}

const assertPaginationInteger: (
	value: unknown,
	path: string,
	minimum: number,
) => asserts value is number | undefined = (value, path, minimum) => {
	if (
		value !== undefined &&
		(typeof value !== 'number' ||
			!Number.isSafeInteger(value) ||
			value < minimum)
	) {
		throw new RangeError(
			`${path} must be a safe integer greater than or equal to ${String(minimum)}`,
		)
	}
}

/** Removes no-op offsets and freezes every explicit pagination value. */
export const normalizeQueryOffsetPagination = (
	input?: QueryOffsetPaginationInput,
): QueryOffsetPaginationNode | undefined => {
	if (input === undefined) {
		return undefined
	}

	const untrustedInput: unknown = input

	if (!isPlainRecord(untrustedInput)) {
		throw new TypeError('offset pagination must be an object')
	}

	const { limit, skip } = untrustedInput

	assertPaginationInteger(limit, 'pagination.limit', 1)
	assertPaginationInteger(skip, 'pagination.skip', 0)

	const normalizedSkip = skip ?? 0

	if (limit === undefined && normalizedSkip === 0) {
		return undefined
	}

	return immutableRecord({
		kind: 'offset-pagination',
		limit,
		skip: normalizedSkip,
	})
}
