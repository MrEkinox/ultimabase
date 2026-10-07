import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import type { DatabaseLogicalRecord } from '../database/contracts.js'

/** Validated logical records exposed by a prepared mutation stage. */
export interface RuntimePreparedMutationRecords {
	/** The singular target, including the absent and upsert-create states. */
	readonly target: DatabaseLogicalRecord | null | undefined
	/** Stable set-based preimages when the Runtime requested them. */
	readonly targets?: readonly DatabaseLogicalRecord[]
}

const readTarget = (
	value: unknown,
): DatabaseLogicalRecord | null | undefined => {
	if (value === undefined || value === null) return value
	if (isPlainRecord(value)) return value

	throw new TypeError(
		'Runtime prepared mutation target must be a logical record',
	)
}

const readTargets = (
	value: unknown,
): readonly DatabaseLogicalRecord[] | undefined => {
	if (value === undefined) return undefined
	if (!isUnknownArray(value) || !value.every(isPlainRecord)) {
		throw new TypeError(
			'Runtime prepared mutation targets must be logical records',
		)
	}

	return immutableArray(value)
}

/** Recovers validated prepared mutation records from one erased Runtime input. */
export const readRuntimePreparedMutationRecords = (
	value: unknown,
): RuntimePreparedMutationRecords => {
	if (typeof value !== 'object' || value === null) {
		throw new TypeError('Runtime prepared mutation input must be an object')
	}

	const target = readTarget('target' in value ? value.target : undefined)
	const targets = readTargets('targets' in value ? value.targets : undefined)

	return immutableRecord({
		target,
		...(targets === undefined ? {} : { targets }),
	})
}
