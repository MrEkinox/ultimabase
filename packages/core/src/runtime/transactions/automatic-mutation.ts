import { FrameworkError } from '../../foundation.js'
import { isPlainRecord } from '@ultimabase/shared'

import type { DatabaseOperationAst } from '../database/contracts.js'

const createInvalidBulkOptionsError = (): FrameworkError<'VALIDATION_ERROR'> =>
	new FrameworkError(
		'VALIDATION_ERROR',
		'Automatic mutation transaction received non-normalized bulk options.',
		{ publicMessage: 'The operation is invalid.' },
	)

/** Protects the low-level execution boundary before a bulk mutation can start. */
const assertNormalizedBulkOptions = (operation: DatabaseOperationAst): void => {
	if (!('options' in operation) || !isPlainRecord(operation.options)) {
		throw createInvalidBulkOptionsError()
	}

	const optionKeys: readonly string[] = Object.keys(operation.options)

	if (
		optionKeys.length !== 1 ||
		optionKeys[0] !== 'atomic' ||
		typeof operation.options.atomic !== 'boolean'
	) {
		throw createInvalidBulkOptionsError()
	}
}

/** Classifies the closed operation union before Runtime opens an adapter transaction. */
export const requiresAutomaticMutationTransaction = (
	operation: DatabaseOperationAst,
): boolean => {
	switch (operation.kind) {
		case 'find':
		case 'first':
		case 'get':
		case 'count':
		case 'exists':
			return false
		case 'create-many':
		case 'upsert-many':
			assertNormalizedBulkOptions(operation)
			return true
		case 'create-one':
		case 'update-one':
		case 'update-many':
		case 'upsert-one':
		case 'delete-one':
		case 'delete-many':
			return true
	}
}
