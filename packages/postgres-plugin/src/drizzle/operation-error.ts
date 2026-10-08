import { FrameworkError, type OperationKind } from '@ultimabase/core'

import { readPostgresDriverCode } from '../connection/driver-error.js'

const isFrameworkError = (value: unknown): value is FrameworkError =>
	value instanceof FrameworkError

const isSerializationFailure = (driverCode: string | undefined): boolean =>
	driverCode === '40001' || driverCode === '40P01'

/** Converts driver failures without exposing SQL, values, or database diagnostics. */
export const mapPostgresOperationError = (
	error: unknown,
	operation: OperationKind,
): FrameworkError => {
	if (isFrameworkError(error)) {
		return error
	}

	const driverCode = readPostgresDriverCode(error)
	const internalDetails = {
		...(driverCode === undefined ? {} : { driverCode }),
		operation,
	}

	if (driverCode === 'P0002') {
		return new FrameworkError('NOT_FOUND', 'PostgreSQL row was not found.', {
			cause: error,
			publicMessage: 'The requested object was not found.',
			internalDetails,
		})
	}

	// Data exceptions (22) and integrity violations (23) come from developer values.
	if (
		driverCode?.startsWith('22') === true ||
		driverCode?.startsWith('23') === true
	) {
		return new FrameworkError(
			'VALIDATION_ERROR',
			'PostgreSQL rejected an operation value or constraint.',
			{
				cause: error,
				publicMessage: 'The operation violates a data constraint.',
				internalDetails,
			},
		)
	}

	return new FrameworkError('INTERNAL_ERROR', 'PostgreSQL operation failed.', {
		cause: error,
		publicMessage: 'The database operation failed.',
		internalDetails,
		retryable: isSerializationFailure(driverCode),
	})
}

/** Removes SQL and connection diagnostics from transaction lifecycle failures. */
export const createPostgresTransactionError = (
	phase: 'begin' | 'commit' | 'rollback',
	error: unknown,
): FrameworkError<'TRANSACTION_ERROR'> => {
	const driverCode = readPostgresDriverCode(error)

	return new FrameworkError(
		'TRANSACTION_ERROR',
		`PostgreSQL transaction ${phase} failed.`,
		{
			publicMessage: 'The database transaction failed.',
			// Only a failed BEGIN is known not to have committed developer work.
			retryable:
				phase === 'begin' &&
				(driverCode?.startsWith('08') === true ||
					isSerializationFailure(driverCode)),
			internalDetails: {
				kind: 'postgres-transaction-failed',
				phase,
				...(driverCode === undefined ? {} : { driverCode }),
			},
		},
	)
}
