import { FrameworkError } from '../../foundation.js'

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
export class TransactionLifetime {
	readonly #pendingOperations = new Set<Promise<void>>()
	#active = true
	#failure: unknown
	#hasFailure = false

	/** Rejects queries and operations that outlive the transaction callback. */
	assertActive(): void {
		if (!this.#active) {
			throw createClosedTransactionError()
		}
	}

	/** Records one operation so an unawaited failure still makes the scope roll back. */
	run<TResult>(operation: () => Promise<TResult>): Promise<TResult> {
		this.assertActive()

		let result: Promise<TResult>

		try {
			result = operation()
		} catch (error: unknown) {
			this.markFailed(error)
			throw error
		}

		const observation: Promise<void> = result.then(
			() => undefined,
			(error: unknown) => {
				this.markFailed(error)
			},
		)

		this.#pendingOperations.add(observation)
		void observation.finally(() => this.#pendingOperations.delete(observation))

		return result
	}

	/** Makes a caught framework-level transaction violation rollback-only. */
	markFailed(error: unknown): void {
		if (!this.#hasFailure) {
			this.#failure = error
			this.#hasFailure = true
		}
	}

	/** Closes the public engine and waits for every operation started in time. */
	async close(): Promise<void> {
		this.#active = false
		await Promise.all([...this.#pendingOperations])

		if (this.#hasFailure) {
			throw this.#failure
		}
	}
}
