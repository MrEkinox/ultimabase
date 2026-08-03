import { FrameworkError } from '@ultimabase/core'

import { readPostgresDriverCode } from '../connection/driver-error.js'

export type PostgresTransactionPhase =
	'begin' | 'commit' | 'rollback' | 'savepoint'

/** Removes SQL and connection diagnostics from transaction lifecycle failures. */
export const createPostgresTransactionError = (
	phase: PostgresTransactionPhase,
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
					driverCode === '40001' ||
					driverCode === '40P01'),
			internalDetails: {
				kind: 'postgres-transaction-failed',
				phase,
				...(driverCode === undefined ? {} : { driverCode }),
			},
		},
	)
}
