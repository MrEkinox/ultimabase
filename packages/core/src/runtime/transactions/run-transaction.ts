import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'

import type { MaybePromise } from '@ultimabase/shared'
import type { ApplicationLog } from '../../application/application-log.js'
import { FrameworkError } from '../../foundation.js'
import { TrackedExecutionLifetime } from '../engine/tracked-execution-lifetime.js'
import type { RuntimePipeline } from '../pipeline/runtime-pipeline.js'
import { throwIfOperationCancelled } from '../cancellation/operation-cancellation.js'
import {
	startAfterCommitWork,
	type AfterCommitWork,
} from './after-commit-work.js'

type DeferredTransactionEffect = () => MaybePromise<void>

interface TransactionExecutionState {
	readonly afterCommit: AfterCommitWork[]
	readonly deferPostCommitEffect: (effect: DeferredTransactionEffect) => void
	readonly transactionId: string
}

const transactionExecution = new AsyncLocalStorage<TransactionExecutionState>()

/** Reads the opaque transaction identity inherited by nested operations. */
export const getCurrentTransactionId = (): string | undefined =>
	transactionExecution.getStore()?.transactionId

/** Queues one effect on the exact transaction inherited by the current callback. */
export const deferCurrentTransactionEffect = (
	effect: DeferredTransactionEffect,
): void => {
	const state = transactionExecution.getStore()
	if (state === undefined) {
		throw new TypeError('Transaction execution scope is unavailable')
	}
	state.deferPostCommitEffect(effect)
}

/**
 * Queues `work` to run once the current transaction commits, outside it and
 * outside the request, without delaying the response (ADR-0318). The works of
 * one transaction run in queue order; a rollback or a retried attempt
 * discards them; a failure is logged and never reaches the caller.
 *
 * @example `runAfterCommit(() => sendWelcomeEmail(user.email))`
 */
export const runAfterCommit = (work: AfterCommitWork): void => {
	if (typeof work !== 'function') {
		throw new TypeError('After-commit work must be a function')
	}
	const state = transactionExecution.getStore()
	if (state === undefined) {
		throw new FrameworkError(
			'TRANSACTION_ERROR',
			'After-commit work requires an active transaction.',
			{
				publicMessage: 'This work cannot be queued outside a transaction.',
				internalDetails: { reason: 'after-commit-transaction-required' },
			},
		)
	}
	state.afterCommit.push(work)
}

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
		super(
			() =>
				new FrameworkError(
					'TRANSACTION_ERROR',
					'Transaction engine cannot be used after its callback has completed.',
					{
						publicMessage: 'The transaction is no longer active.',
						internalDetails: { reason: 'transaction-engine-closed' },
					},
				),
		)
	}
}

/**
 * Preserves both independent failures without duplicating one caught error;
 * an error that wraps the other (its `cause`) is the same failure.
 */
const combineErrors = (
	primary: unknown,
	secondary: unknown,
	message: string,
): unknown =>
	primary === secondary ||
	(primary instanceof Error && primary.cause === secondary)
		? primary
		: new AggregateError([primary, secondary], message, { cause: secondary })

/**
 * Runs one callback inside an adapter transaction with one opaque identity,
 * commits once after every started operation settles, rolls back on any
 * failure, and delivers deferred effects only after the successful commit.
 */
export const runRequestTransaction = async <TEngine, TResult>(
	pipeline: RuntimePipeline,
	createEngine: (
		pipeline: RuntimePipeline,
		lifetime: TransactionLifetime,
	) => TEngine,
	handler: (engine: TEngine) => MaybePromise<TResult>,
	signal: AbortSignal,
): Promise<TResult> => {
	const scope = await pipeline.beginTransaction()
	const state: TransactionExecutionState = {
		afterCommit: [],
		deferPostCommitEffect: (effect) => {
			scope.deferPostCommitEffect(effect)
		},
		transactionId: randomUUID(),
	}

	return transactionExecution.run(state, async () => {
		const lifetime = new TransactionLifetime()
		const engine = createEngine(scope.pipeline, lifetime)
		let outcome:
			| { readonly ok: true; readonly value: TResult }
			| { readonly ok: false; readonly error: unknown }
		try {
			outcome = { ok: true, value: await handler(engine) }
		} catch (error: unknown) {
			outcome = { ok: false, error }
		}
		try {
			await lifetime.close()
		} catch (closeError: unknown) {
			outcome = {
				ok: false,
				error: outcome.ok
					? closeError
					: combineErrors(
							outcome.error,
							closeError,
							'Transaction callback and an operation both failed.',
						),
			}
		}

		try {
			if (!outcome.ok) throw outcome.error
			throwIfOperationCancelled(signal, { phase: 'before-commit' })
			await scope.commit()
		} catch (error: unknown) {
			// Roll back once and report only state confirmed by the adapter.
			try {
				await scope.rollback()
			} catch (rollbackError: unknown) {
				throw combineErrors(
					error,
					rollbackError,
					'Transaction failed and rollback reported an additional error.',
				)
			}
			throw error
		}
		try {
			await scope.flushPostCommitEvents()
		} finally {
			// The write is committed: its background work starts whatever the flush did.
			startAfterCommitWork(state.afterCommit.splice(0))
		}
		return outcome.value
	})
}

/** Total attempts of one automatic mutation transaction (ADR-0300). */
export const automaticTransactionAttempts = 3

/** Identifies one automatic transaction in retry diagnostics, never its values. */
export interface AutomaticTransactionLabel {
	readonly operation: string
	readonly schema?: string | undefined
}

/** Only an adapter guarantees that a failed attempt rolled back completely. */
const isTransientConflict = (error: unknown): error is FrameworkError =>
	error instanceof FrameworkError &&
	error.code === 'TRANSACTION_CONFLICT' &&
	error.retryable

// A function call keeps the abort state observable after an await.
const isAborted = (signal: AbortSignal): boolean => signal.aborted

/** Waits a short randomized delay so competing transactions stop colliding. */
const waitBeforeRetry = (attempt: number, signal: AbortSignal): Promise<void> =>
	new Promise((resolve) => {
		const delay = Math.floor((5 + Math.random() * 20) * attempt)
		const finish = (): void => {
			clearTimeout(timer)
			signal.removeEventListener('abort', finish)
			resolve()
		}
		const timer = setTimeout(finish, delay)
		signal.addEventListener('abort', finish, { once: true })
	})

/**
 * Runs one automatic mutation transaction and replays it from normalization
 * after a transient adapter conflict, at most three attempts in total. Failed
 * attempts roll back and discard their post-commit effects; no attempt starts
 * after cancellation or the request deadline.
 */
export const runAutomaticRequestTransaction = async <TEngine, TResult>(
	pipeline: RuntimePipeline,
	createEngine: (
		pipeline: RuntimePipeline,
		lifetime: TransactionLifetime,
	) => TEngine,
	handler: (engine: TEngine) => MaybePromise<TResult>,
	signal: AbortSignal,
	label: AutomaticTransactionLabel,
	log: ApplicationLog,
): Promise<TResult> => {
	for (let attempt = 1; ; attempt += 1) {
		try {
			return await runRequestTransaction(
				pipeline,
				createEngine,
				handler,
				signal,
			)
		} catch (error: unknown) {
			if (!isTransientConflict(error)) throw error
			const diagnostic = { ...label, attempt, code: error.code }
			if (attempt >= automaticTransactionAttempts) {
				log.warn(
					'UltimaBase: automatic transaction retries exhausted after transient conflicts',
					diagnostic,
				)
				throw error
			}
			if (isAborted(signal)) throw error
			log.debug(
				'UltimaBase: retrying an automatic transaction after a transient conflict',
				diagnostic,
			)
			await waitBeforeRetry(attempt, signal)
			if (isAborted(signal)) throw error
		}
	}
}
