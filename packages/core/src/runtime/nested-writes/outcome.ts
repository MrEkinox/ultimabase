import { isPlainRecord, isUnknownArray } from '@ultimabase/shared'

/** Reads the adapter-proven identity before descendant relation work begins. */
export const readNestedCreateOutcomeId = (outcome: unknown): string => {
	if (!isPlainRecord(outcome) || !isUnknownArray(outcome.materializations)) {
		throw new TypeError('Nested create returned an invalid mutation outcome')
	}
	const creates = outcome.materializations.filter(
		(materialization) =>
			isPlainRecord(materialization) && materialization.kind === 'create',
	)

	if (creates.length !== 1) {
		throw new TypeError(
			'Nested create must produce one create materialization before relation work',
		)
	}

	const create = creates[0]
	const current = isPlainRecord(create) ? create.current : undefined
	if (!isPlainRecord(current) || typeof current.id !== 'string') {
		throw new TypeError(
			'Nested create materialization is missing its object ID',
		)
	}

	return current.id
}
