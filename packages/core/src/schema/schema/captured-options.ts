import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

/** Detaches delayed plugin options from caller-owned plain data. */
export const snapshotCapturedOptionValue = (value: unknown): unknown => {
	if (isUnknownArray(value)) {
		return immutableArray(value.map(snapshotCapturedOptionValue))
	}

	if (value instanceof Date) {
		return Object.freeze(new Date(value.getTime()))
	}

	if (value instanceof RegExp) {
		return Object.freeze(new RegExp(value.source, value.flags))
	}

	if (!isPlainRecord(value)) {
		return value
	}

	const snapshot: Record<string, unknown> = {}

	for (const [key, nestedValue] of Object.entries(value)) {
		snapshot[key] = snapshotCapturedOptionValue(nestedValue)
	}

	return immutableRecord(snapshot)
}

/** Detaches field options while retaining the validator as one opaque artifact. */
export const snapshotCapturedFieldOptions = (value: unknown): unknown => {
	if (!isPlainRecord(value)) {
		return snapshotCapturedOptionValue(value)
	}

	const snapshot: Record<string, unknown> = {}

	for (const [key, nestedValue] of Object.entries(value)) {
		// Standard Schema implementations may be plain records. Their identity and
		// executable protocol must never be cloned as ordinary option data.
		snapshot[key] =
			key === 'validation'
				? nestedValue
				: snapshotCapturedOptionValue(nestedValue)
	}

	return immutableRecord(snapshot)
}
