import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import type { QueryOffsetPaginationNode } from '../ast/contracts.js'
import type { QueryCursorPaginationNode } from '../ast/contracts.js'
import type { QueryCursor } from '../cursor/contracts.js'

/** Describes forward keyset pagination before its token is authenticated. */
export interface QueryCursorPaginationInput {
	readonly after?: string
	readonly limit: number
}

/** Describes explicit offset pagination before cursor normalization is added. */
export interface QueryOffsetPaginationInput {
	readonly limit?: number
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

	const limit = parseOptionalPaginationInteger(
		untrustedInput.limit,
		'pagination.limit',
		1,
	)
	const skip = parseOptionalPaginationInteger(
		untrustedInput.skip,
		'pagination.skip',
		0,
	)

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

/** Validates a forward cursor page while keeping the token opaque to the AST. */
export const normalizeQueryCursorPagination = (
	input: QueryCursorPaginationInput,
): QueryCursorPaginationNode => {
	const untrustedInput: unknown = input

	if (!isPlainRecord(untrustedInput)) {
		throw new TypeError('cursor pagination must be an object')
	}

	const limit = parsePaginationInteger(
		untrustedInput.limit,
		'pagination.limit',
		1,
	)
	const after = untrustedInput.after

	if (
		after !== undefined &&
		(typeof after !== 'string' || after.length === 0)
	) {
		throw new TypeError('pagination.after must be a non-empty string')
	}

	return immutableRecord({
		kind: 'cursor-pagination',
		after: after as QueryCursor | undefined,
		limit,
	})
}
