import { FrameworkError } from '../../foundation.js'
import { isPlainRecord } from '@ultimabase/shared'

import type { DatabaseOperationAst } from '../database/contracts.js'

const atomicBulkKinds = new Set<DatabaseOperationAst['kind']>([
	'create-many',
	'upsert-many',
])

const createInvalidBulkOptionsError = (): FrameworkError<'VALIDATION_ERROR'> =>
	new FrameworkError(
		'VALIDATION_ERROR',
		'Atomic bulk operation does not contain normalized options.',
		{ publicMessage: 'The operation is invalid.' },
	)

/** Reads the trusted normalized flag before deciding whether Runtime opens a transaction. */
export const requiresAtomicBulkTransaction = (
	operation: DatabaseOperationAst,
): boolean => {
	if (!atomicBulkKinds.has(operation.kind)) {
		return false
	}

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

	return operation.options.atomic
}
