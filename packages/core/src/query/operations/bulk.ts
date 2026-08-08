import { immutableArray, isUnknownArray } from '@ultimabase/shared'

/** Snapshots caller-owned collection topology before asynchronous execution starts. */
export const snapshotCreateInputs = <const TInput>(
	inputs: readonly TInput[],
): readonly TInput[] => {
	const untrustedInputs: unknown = inputs

	if (!isUnknownArray(untrustedInputs)) {
		throw new TypeError('bulk create inputs must be an array')
	}

	return immutableArray(inputs)
}
