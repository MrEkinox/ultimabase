import { FrameworkError } from '../../foundation.js'
import { TrackedExecutionLifetime } from '../engine/tracked-execution-lifetime.js'

/** Creates the stable failure exposed when a transaction engine has expired. */
const createClosedTransactionError = (): FrameworkError<'TRANSACTION_ERROR'> =>
	new FrameworkError(
		'TRANSACTION_ERROR',
		'Transaction engine cannot be used after its callback has completed.',
		{
			publicMessage: 'The transaction is no longer active.',
			internalDetails: { reason: 'transaction-engine-closed' },
		},
	)

/** Creates the explicit Runtime policy failure for unsupported nesting. */
export const createNestedTransactionError =
	(): FrameworkError<'TRANSACTION_ERROR'> =>
		new FrameworkError(
			'TRANSACTION_ERROR',
			'Nested RequestEngine transactions are not supported.',
			{
				publicMessage: 'Nested transactions are not supported.',
				internalDetails: { reason: 'nested-transaction' },
			},
		)

/**
 * Keeps a transaction engine usable only during its callback and observes every
 * started operation before the owning transaction can commit or roll back.
 */
export class TransactionLifetime extends TrackedExecutionLifetime {
	constructor() {
		super(createClosedTransactionError)
	}
}
