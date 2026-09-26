import { isPlainRecord, isUnknownArray } from '@ultimabase/shared'

import type { UpdateExpressionNode } from './contracts.js'

/** Reads the canonical operation records from one normalized update expression. */
export const readUpdateExpressionOperations = (
	update: UpdateExpressionNode,
	errorMessage: string,
): readonly Readonly<Record<string, unknown>>[] => {
	if (
		!isPlainRecord(update) ||
		update.kind !== 'update-expression' ||
		!isUnknownArray(update.operations) ||
		!update.operations.every(isPlainRecord)
	) {
		throw new TypeError(errorMessage)
	}

	return update.operations
}
