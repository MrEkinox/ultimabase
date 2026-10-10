import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import {
	narrowRuntimeSchemaModelMetadata,
	transferRuntimeSchemaModelMetadata,
} from '../operations/model-metadata.js'

const invalidSubset = (): never => {
	throw new TypeError('A protected policy result may only omit values')
}

const invalidCollectionLength = (): never => {
	throw new TypeError(
		'A protected policy result must preserve collection length',
	)
}

/** Snapshots one recursively proven subset without permitting replacement values. */
const snapshotSubset = (source: unknown, candidate: unknown): unknown => {
	if (Object.is(source, candidate)) {
		return candidate
	}

	if (isUnknownArray(source)) {
		if (!isUnknownArray(candidate) || candidate.length !== source.length) {
			return invalidCollectionLength()
		}

		return immutableArray(
			candidate.map((value, index) => snapshotSubset(source[index], value)),
		)
	}

	if (isPlainRecord(source)) {
		if (!isPlainRecord(candidate)) {
			return invalidSubset()
		}

		const entries = Object.entries(candidate).map(([key, value]) => {
			if (!Object.hasOwn(source, key)) {
				return invalidSubset()
			}

			return [key, snapshotSubset(source[key], value)] as const
		})
		const subset = immutableRecord(Object.fromEntries(entries))
		const kept = Object.keys(candidate)

		// An omitted field leaves the visible projection, so later boundaries
		// (an included target's virtual fields) no longer require it.
		if (kept.length < Object.keys(source).length) {
			narrowRuntimeSchemaModelMetadata(source, subset, kept)
		} else {
			transferRuntimeSchemaModelMetadata(source, subset)
		}

		return subset
	}

	return invalidSubset()
}

/** Proves that a protected result handler only removed object properties. */
export const validateProtectedPolicyResultSubset = <const TResult>(
	source: TResult,
	candidate: unknown,
): TResult => snapshotSubset(source, candidate) as TResult
