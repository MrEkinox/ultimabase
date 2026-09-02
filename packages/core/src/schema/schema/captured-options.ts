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

const containsExecutableArtifact = (
	value: unknown,
	seen: WeakSet<object>,
): boolean => {
	if (typeof value === 'function') {
		return true
	}

	if (!isPlainRecord(value) && !isUnknownArray(value)) {
		return false
	}

	if (seen.has(value)) {
		return false
	}

	seen.add(value)
	return Object.values(value).some((nestedValue) =>
		containsExecutableArtifact(nestedValue, seen),
	)
}

/** Detaches field options while retaining callback-bearing values as opaque artifacts. */
export const snapshotCapturedFieldOptions = (value: unknown): unknown => {
	if (!isPlainRecord(value)) {
		return snapshotCapturedOptionValue(value)
	}

	const snapshot: Record<string, unknown> = {}
	const seen = new WeakSet<object>()

	for (const [key, nestedValue] of Object.entries(value)) {
		snapshot[key] = containsExecutableArtifact(nestedValue, seen)
			? nestedValue
			: snapshotCapturedOptionValue(nestedValue)
	}

	return immutableRecord(snapshot)
}
