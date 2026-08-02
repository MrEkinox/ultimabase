import type { MaybePromise } from '@ultimabase/shared'
import { immutableRecord } from '@ultimabase/shared'
import type {
	HookErrorPhase,
	HookErrorTransactionState,
} from '../../schema/hooks/contracts.js'

import type { RuntimePipeline } from '../pipeline/runtime-pipeline.js'
import type { RuntimePipelineTransactionScope } from './pipeline-transaction.js'
import { TransactionLifetime } from './transaction-lifetime.js'

/** Retains a successful callback value or its exact thrown failure. */
type TransactionOutcome<TResult> =
	| { readonly status: 'fulfilled'; readonly value: TResult }
	| { readonly status: 'rejected'; readonly error: unknown }

type ErrorObserverOutcome =
	| Readonly<{ readonly status: 'fulfilled' }>
	| Readonly<{ readonly error: unknown; readonly status: 'rejected' }>

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

/** Notifies observers without replacing the failure that initiated finalization. */
const observeTransactionError = async (
	scope: RuntimePipelineTransactionScope,
	error: unknown,
	phase: HookErrorPhase,
	transaction: HookErrorTransactionState,
): Promise<ErrorObserverOutcome> => {
	try {
		await scope.onError(immutableRecord({ error, phase, transaction }))
	} catch (observerError: unknown) {
		return immutableRecord({ error: observerError, status: 'rejected' })
	}

	return immutableRecord({ status: 'fulfilled' })
}

/** Rolls back once and reports only state confirmed by the adapter. */
const rollbackAndThrow = async (
	scope: RuntimePipelineTransactionScope,
	error: unknown,
	phase: HookErrorPhase,
): Promise<never> => {
	let reportedError: unknown = error
	let transaction: HookErrorTransactionState

	try {
		await scope.rollback()
	} catch (rollbackError: unknown) {
		reportedError = combineTransactionErrors(
			error,
			rollbackError,
			'Transaction failed and rollback reported an additional error.',
		)
		transaction = immutableRecord({
			rollback: 'failed' as const,
			status: 'rollback-failed' as const,
		})
		const observerOutcome = await observeTransactionError(
			scope,
			error,
			phase,
			transaction,
		)

		throw observerOutcome.status === 'fulfilled'
			? reportedError
			: combineTransactionErrors(
					reportedError,
					observerOutcome.error,
					'Transaction failure reporting produced an additional error.',
				)
	}

	transaction = immutableRecord({
		rollback: 'succeeded' as const,
		status: 'rolled-back' as const,
	})

	try {
		await scope.afterRollback(error)
	} catch (rollbackObserverError: unknown) {
		reportedError = combineTransactionErrors(
			reportedError,
			rollbackObserverError,
			'Transaction failed and its rollback observer reported an additional error.',
		)
	}

	const observerOutcome = await observeTransactionError(
		scope,
		error,
		phase,
		transaction,
	)

	throw observerOutcome.status === 'fulfilled'
		? reportedError
		: combineTransactionErrors(
				reportedError,
				observerOutcome.error,
				'Transaction failure reporting produced an additional error.',
			)
}

/** Reports a failure after commit without suggesting rollback was possible. */
const throwCommittedFailure = async (
	scope: RuntimePipelineTransactionScope,
	error: unknown,
	phase: Extract<HookErrorPhase, 'after-commit' | 'post-commit'>,
): Promise<never> => {
	const observerOutcome = await observeTransactionError(
		scope,
		error,
		phase,
		immutableRecord({
			rollback: 'not-applicable' as const,
			status: 'committed' as const,
		}),
	)

	throw observerOutcome.status === 'fulfilled'
		? error
		: combineTransactionErrors(
				error,
				observerOutcome.error,
				'Committed transaction finalization produced an additional error.',
			)
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
	const failurePhase: HookErrorPhase = 'operation'

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
		return rollbackAndThrow(scope, outcome.error, failurePhase)
	}

	try {
		await scope.beforeCommit()
	} catch (beforeCommitError: unknown) {
		return rollbackAndThrow(scope, beforeCommitError, 'before-commit')
	}

	try {
		await scope.commit()
	} catch (commitError: unknown) {
		return rollbackAndThrow(scope, commitError, 'commit')
	}

	let committedFailure:
		| Readonly<{
				error: unknown
				phase: Extract<HookErrorPhase, 'after-commit' | 'post-commit'>
		  }>
		| undefined

	try {
		await scope.afterCommit()
	} catch (afterCommitError: unknown) {
		committedFailure = immutableRecord({
			error: afterCommitError,
			phase: 'after-commit' as const,
		})
	}

	try {
		// External effects still receive committed state if a sibling observer fails.
		await scope.flushPostCommitEvents()
	} catch (postCommitError: unknown) {
		committedFailure =
			committedFailure === undefined
				? immutableRecord({
						error: postCommitError,
						phase: 'post-commit' as const,
					})
				: immutableRecord({
						error: combineTransactionErrors(
							committedFailure.error,
							postCommitError,
							'Multiple committed transaction finalizers failed.',
						),
						phase: committedFailure.phase,
					})
	}

	if (committedFailure !== undefined) {
		return throwCommittedFailure(
			scope,
			committedFailure.error,
			committedFailure.phase,
		)
	}

	return outcome.value
}
