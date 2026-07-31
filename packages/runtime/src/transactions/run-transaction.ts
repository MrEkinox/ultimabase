import type { MaybePromise } from '@ultimabase/shared'

import type { RuntimePipeline } from '../pipeline/runtime-pipeline.js'
import type { RuntimePipelineTransactionScope } from './pipeline-transaction.js'
import { TransactionLifetime } from './transaction-lifetime.js'

/** Retains a successful callback value or its exact thrown failure. */
type TransactionOutcome<TResult> =
	| { readonly status: 'fulfilled'; readonly value: TResult }
	| { readonly status: 'rejected'; readonly error: unknown }

/** Preserves both independent failures without duplicating one caught error. */
const combineTransactionErrors = (
	primaryError: unknown,
	secondaryError: unknown,
	message: string,
): unknown =>
	primaryError === secondaryError
		? primaryError
		: new AggregateError([primaryError, secondaryError], message, {
				cause: secondaryError,
			})

/** Rolls back once and never hides an additional adapter cleanup failure. */
const rollbackAndThrow = async (
	scope: RuntimePipelineTransactionScope,
	error: unknown,
): Promise<never> => {
	try {
		await scope.rollback()
	} catch (rollbackError: unknown) {
		throw combineTransactionErrors(
			error,
			rollbackError,
			'Transaction failed and rollback reported an additional error.',
		)
	}

	throw error
}

/**
 * Owns the adapter-neutral callback lifecycle while the engine module decides
 * the exact typed RequestEngine instance exposed to the developer.
 */
export const runRequestTransaction = async <TEngine, TResult>(
	pipeline: RuntimePipeline,
	createEngine: (
		pipeline: RuntimePipeline,
		lifetime: TransactionLifetime,
	) => TEngine,
	handler: (engine: TEngine) => MaybePromise<TResult>,
): Promise<TResult> => {
	const scope: RuntimePipelineTransactionScope =
		await pipeline.beginTransaction()
	const lifetime = new TransactionLifetime()
	const engine: TEngine = createEngine(scope.pipeline, lifetime)
	let outcome: TransactionOutcome<TResult>

	try {
		outcome = { status: 'fulfilled', value: await handler(engine) }
	} catch (error: unknown) {
		outcome = { status: 'rejected', error }
	}

	try {
		await lifetime.close()
	} catch (closeError: unknown) {
		outcome =
			outcome.status === 'rejected'
				? {
						status: 'rejected',
						error: combineTransactionErrors(
							outcome.error,
							closeError,
							'Transaction callback and an operation both failed.',
						),
					}
				: { status: 'rejected', error: closeError }
	}

	if (outcome.status === 'rejected') {
		return rollbackAndThrow(scope, outcome.error)
	}

	try {
		await scope.commit()
	} catch (commitError: unknown) {
		return rollbackAndThrow(scope, commitError)
	}

	// External effects run only after the database confirms the outer commit.
	await scope.flushPostCommitEvents()

	return outcome.value
}
