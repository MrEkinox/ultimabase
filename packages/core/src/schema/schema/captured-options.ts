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

	// Entries keep every option key, including `__proto__`, as an own key.
	return immutableRecord(
		Object.fromEntries(
			Object.entries(value).map(([key, nestedValue]): [string, unknown] => [
				key,
				snapshotCapturedOptionValue(nestedValue),
			]),
		),
	)
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

/** Detaches one field option record while retaining callback-bearing values as opaque artifacts. */
export const snapshotCapturedFieldRecord = (
	value: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> => {
	const seen = new WeakSet<object>()

	// Entries keep every option key, including `__proto__`, as an own key.
	return immutableRecord(
		Object.fromEntries(
			Object.entries(value).map(([key, nestedValue]): [string, unknown] => [
				key,
				containsExecutableArtifact(nestedValue, seen)
					? nestedValue
					: snapshotCapturedOptionValue(nestedValue),
			]),
		),
	)
}

/** Detaches field options while retaining callback-bearing values as opaque artifacts. */
export const snapshotCapturedFieldOptions = (value: unknown): unknown =>
	isPlainRecord(value)
		? snapshotCapturedFieldRecord(value)
		: snapshotCapturedOptionValue(value)
