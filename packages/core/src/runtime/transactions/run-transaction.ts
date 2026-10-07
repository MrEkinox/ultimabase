import type { MaybePromise } from '@ultimabase/shared'
import { randomUUID } from 'node:crypto'

import type { RuntimePipeline } from '../pipeline/runtime-pipeline.js'
import type { RuntimePipelineTransactionScope } from './pipeline-transaction.js'
import { TransactionLifetime } from './transaction-lifetime.js'
import { runWithTransactionExecution } from './transaction-execution-storage.js'
import { throwIfOperationCancelled } from '../cancellation/operation-cancellation.js'

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

/** Rolls back once and reports only state confirmed by the adapter. */
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
const executeActiveRequestTransaction = async <TEngine, TResult>(
	scope: RuntimePipelineTransactionScope,
	createEngine: (
		pipeline: RuntimePipeline,
		lifetime: TransactionLifetime,
	) => TEngine,
	handler: (engine: TEngine) => MaybePromise<TResult>,
	signal: AbortSignal,
): Promise<TResult> => {
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
		throwIfOperationCancelled(signal, { phase: 'before-commit' })
	} catch (cancellationError: unknown) {
		return rollbackAndThrow(scope, cancellationError)
	}

	try {
		await scope.commit()
	} catch (commitError: unknown) {
		return rollbackAndThrow(scope, commitError)
	}

	await scope.flushPostCommitEvents()

	return outcome.value
}

/** Installs transaction identity and post-commit deferral after begin succeeds. */
const executeRequestTransaction = async <TEngine, TResult>(
	pipeline: RuntimePipeline,
	createEngine: (
		pipeline: RuntimePipeline,
		lifetime: TransactionLifetime,
	) => TEngine,
	handler: (engine: TEngine) => MaybePromise<TResult>,
	signal: AbortSignal,
): Promise<TResult> => {
	const scope: RuntimePipelineTransactionScope =
		await pipeline.beginTransaction()

	return runWithTransactionExecution(
		{
			deferPostCommitEffect: (effect) => {
				scope.deferPostCommitEffect(effect)
			},
			transactionId: randomUUID(),
		},
		() => executeActiveRequestTransaction(scope, createEngine, handler, signal),
	)
}

/** Assigns one opaque identity before adapter work so all nested operations share it. */
export const runRequestTransaction = <TEngine, TResult>(
	pipeline: RuntimePipeline,
	createEngine: (
		pipeline: RuntimePipeline,
		lifetime: TransactionLifetime,
	) => TEngine,
	handler: (engine: TEngine) => MaybePromise<TResult>,
	signal: AbortSignal,
): Promise<TResult> =>
	executeRequestTransaction(pipeline, createEngine, handler, signal)
