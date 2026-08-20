import { FrameworkError } from '../../foundation.js'
import { immutableRecord, type MaybePromise } from '@ultimabase/shared'

import type {
	DatabaseAdapter,
	DatabaseOperationExecutor,
	DatabaseTransactionAdapter,
} from '../database/contracts.js'
import type {
	RuntimeBehaviorStages,
	RuntimePipelineStages,
} from '../pipeline/contracts.js'
import type { RuntimePipeline } from '../pipeline/runtime-pipeline.js'

type TransactionScopeState =
	'active' | 'committed' | 'flushed' | 'flushing' | 'rolled-back'
type DeferredPostCommitEffect = () => MaybePromise<void>
type RuntimePipelineFactory = (stages: RuntimePipelineStages) => RuntimePipeline
const transactionAdapters = new WeakMap<
	RuntimePipeline,
	DatabaseTransactionAdapter
>()

/** Exposes only the lifecycle operations needed by the RequestEngine runner. */
export interface RuntimePipelineTransactionScope {
	readonly pipeline: RuntimePipeline
	commit(): Promise<void>
	rollback(): Promise<void>
	deferPostCommitEffect(effect: DeferredPostCommitEffect): void
	flushPostCommitEvents(): Promise<void>
}

/** Narrows the root executor before asking an infrastructure plugin for a transaction. */
const assertDatabaseAdapter: (
	executor: DatabaseOperationExecutor,
) => asserts executor is DatabaseAdapter = (executor) => {
	const untrustedExecutor: unknown = executor

	if (
		typeof untrustedExecutor !== 'object' ||
		untrustedExecutor === null ||
		!('kind' in untrustedExecutor) ||
		untrustedExecutor.kind !== 'database-adapter' ||
		!('beginTransaction' in untrustedExecutor) ||
		typeof untrustedExecutor.beginTransaction !== 'function'
	) {
		throw new FrameworkError(
			'TRANSACTION_ERROR',
			'Runtime pipeline database executor cannot begin transactions.',
			{
				publicMessage: 'Transactions are not available.',
				internalDetails: { reason: 'database-adapter-required' },
			},
		)
	}
}

/** Validates a plugin-owned transaction before any developer callback receives it. */
const assertDatabaseTransactionAdapter: (
	transaction: unknown,
) => asserts transaction is DatabaseTransactionAdapter = (transaction) => {
	if (
		typeof transaction !== 'object' ||
		transaction === null ||
		!('kind' in transaction) ||
		transaction.kind !== 'database-transaction-adapter' ||
		!('execute' in transaction) ||
		typeof transaction.execute !== 'function' ||
		!('prepare' in transaction) ||
		typeof transaction.prepare !== 'function' ||
		!('commit' in transaction) ||
		typeof transaction.commit !== 'function' ||
		!('rollback' in transaction) ||
		typeof transaction.rollback !== 'function'
	) {
		throw new FrameworkError(
			'TRANSACTION_ERROR',
			'Database adapter returned an invalid transaction executor.',
			{
				publicMessage: 'The transaction could not be started.',
				internalDetails: { reason: 'invalid-transaction-adapter' },
			},
		)
	}
}

/**
 * Reuses every pipeline stage with an isolated transaction adapter and keeps
 * post-commit effects private until the outer commit succeeds.
 */
export const beginPipelineTransaction = async (
	stages: Readonly<RuntimePipelineStages>,
	createPipeline: RuntimePipelineFactory,
): Promise<RuntimePipelineTransactionScope> => {
	const databaseAdapter: DatabaseOperationExecutor = stages.databaseOperation

	assertDatabaseAdapter(databaseAdapter)
	const transaction: unknown = await databaseAdapter.beginTransaction()

	assertDatabaseTransactionAdapter(transaction)

	const postCommitEffects: DeferredPostCommitEffect[] = []
	const postCommit = stages.behaviors?.postCommit
	const transactionBehaviors: RuntimeBehaviorStages | undefined =
		postCommit === undefined
			? stages.behaviors
			: immutableRecord({
					...stages.behaviors,
					postCommit: (input) => {
						postCommitEffects.push(() => postCommit(input))
					},
				})
	const transactionPipeline: RuntimePipeline = createPipeline({
		...stages,
		databaseOperation: transaction,
		// The outer scope commits the adapter exactly once after the callback.
		commit: () => undefined,
		...(transactionBehaviors === undefined
			? {}
			: { behaviors: transactionBehaviors }),
	})
	transactionAdapters.set(transactionPipeline, transaction)
	let state: TransactionScopeState = 'active'

	return immutableRecord({
		pipeline: transactionPipeline,
		commit: async (): Promise<void> => {
			if (state !== 'active') {
				throw new TypeError('Runtime transaction scope is already finalized')
			}

			await transaction.commit()
			state = 'committed'
			transactionAdapters.delete(transactionPipeline)
		},
		rollback: async (): Promise<void> => {
			if (state !== 'active') {
				throw new TypeError('Runtime transaction scope is already finalized')
			}

			postCommitEffects.length = 0

			try {
				await transaction.rollback()
				state = 'rolled-back'
			} finally {
				transactionAdapters.delete(transactionPipeline)
			}
		},
		deferPostCommitEffect: (effect): void => {
			if (state !== 'active' && state !== 'committed') {
				throw new TypeError(
					'Runtime transaction effects require an active transaction',
				)
			}

			if (typeof effect !== 'function') {
				throw new TypeError('Runtime transaction effect must be a function')
			}

			postCommitEffects.push(effect)
		},
		flushPostCommitEvents: async (): Promise<void> => {
			if (state !== 'committed') {
				throw new TypeError(
					'Runtime transaction events require a committed transaction',
				)
			}

			const effects: readonly DeferredPostCommitEffect[] =
				postCommitEffects.splice(0)
			const failures: unknown[] = []

			state = 'flushing'

			for (const effect of effects) {
				try {
					await effect()
				} catch (error: unknown) {
					// One committed observer cannot suppress independent sibling delivery.
					failures.push(error)
				}
			}

			state = 'flushed'

			if (failures.length === 1) {
				throw failures[0]
			}

			if (failures.length > 1) {
				throw new AggregateError(
					failures,
					'Multiple post-commit effects failed.',
					{ cause: failures[0] },
				)
			}
		},
	})
}

/** @internal Reads the transaction adapter only for a Core-owned active pipeline. */
export const readPipelineTransactionAdapter = (
	pipeline: RuntimePipeline,
): DatabaseTransactionAdapter | undefined => transactionAdapters.get(pipeline)
