import { isPlainRecord, isUnknownArray } from '@ultimabase/shared'
import type { NestedWriteRootCommand } from '../../schema/nested-writes/contracts.js'

/** Reads the adapter-proven identity before descendant relation work begins. */
export const readNestedMutationOutcomeId = (
	outcome: unknown,
	command: NestedWriteRootCommand,
): string | undefined => {
	if (!isPlainRecord(outcome) || !isUnknownArray(outcome.materializations)) {
		throw new TypeError('Nested write returned an invalid mutation outcome')
	}
	const materializations = outcome.materializations.filter(
		(materialization) =>
			isPlainRecord(materialization) && materialization.kind === command,
	)

	if (command === 'update' && materializations.length === 0) return undefined

	if (materializations.length !== 1) {
		throw new TypeError(
			'Nested write must produce one matching materialization before relation work',
		)
	}

	const materialization = materializations[0]
	const current = isPlainRecord(materialization)
		? materialization.current
		: undefined
	if (!isPlainRecord(current) || typeof current.id !== 'string') {
		throw new TypeError('Nested write materialization is missing its object ID')
	}

	return current.id
}
