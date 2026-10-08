import { immutableRecord } from '@ultimabase/shared'
import { assertExactEnumerablePlainObject } from '../../exact-object-validation.js'

import type { NestedWriteLimits } from './contracts.js'

/** Applies the accepted finite defaults to every application graph. */
export const defaultNestedWriteLimits: NestedWriteLimits = immutableRecord({
	maxDepth: 5,
	maxOperations: 100,
})

const nestedWriteLimitKeys = new Set(['maxDepth', 'maxOperations'])

/** Validates and snapshots trusted application nested-write limits. */
export const normalizeNestedWriteLimits = (
	limits: unknown,
): NestedWriteLimits => {
	assertExactEnumerablePlainObject(
		limits,
		nestedWriteLimitKeys,
		'Nested-write limits must be a plain object',
		'Nested-write limits contain unknown option: ',
	)

	const maxDepth = limits.maxDepth ?? defaultNestedWriteLimits.maxDepth
	const maxOperations =
		limits.maxOperations ?? defaultNestedWriteLimits.maxOperations

	if (!Number.isSafeInteger(maxDepth) || Number(maxDepth) < 0) {
		throw new TypeError(
			'Nested-write maxDepth must be a non-negative safe integer',
		)
	}

	if (!Number.isSafeInteger(maxOperations) || Number(maxOperations) < 1) {
		throw new TypeError(
			'Nested-write maxOperations must be a positive safe integer',
		)
	}

	return immutableRecord({
		maxDepth: Number(maxDepth),
		maxOperations: Number(maxOperations),
	})
}
