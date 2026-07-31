import { FrameworkError } from '@ultimabase/core'
import { immutableRecord, type MaybePromise } from '@ultimabase/shared'

import type {
	DatabaseAdapter,
	DatabaseOperationExecutor,
	DatabaseTransactionAdapter,
} from '../database/contracts.js'
import type {
	RuntimePipelineStages,
	RuntimeResultEffectStage,
} from '../pipeline/contracts.js'
import type { RuntimePipeline } from '../pipeline/runtime-pipeline.js'

type TransactionScopeState = 'active' | 'committed' | 'rolled-back'
type DeferredPostCommitEffect = () => MaybePromise<void>
type RuntimePipelineFactory = (stages: RuntimePipelineStages) => RuntimePipeline

/** Exposes only the lifecycle operations needed by the RequestEngine runner. */
export interface RuntimePipelineTransactionScope {
	readonly pipeline: RuntimePipeline
	commit(): Promise<void>
	rollback(): Promise<void>
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
	const deferPostCommitEvents: RuntimeResultEffectStage = (input) => {
		postCommitEffects.push(() => stages.postCommitEvents(input))
	}
	const transactionPipeline: RuntimePipeline = createPipeline({
		...stages,
		databaseOperation: transaction,
		// The outer scope commits the adapter exactly once after the callback.
		commit: () => undefined,
		postCommitEvents: deferPostCommitEvents,
	})
	let state: TransactionScopeState = 'active'

	return immutableRecord({
		pipeline: transactionPipeline,
		commit: async (): Promise<void> => {
			if (state !== 'active') {
				throw new TypeError('Runtime transaction scope is already finalized')
			}

			await transaction.commit()
			state = 'committed'
		},
		rollback: async (): Promise<void> => {
			if (state !== 'active') {
				throw new TypeError('Runtime transaction scope is already finalized')
			}

			postCommitEffects.length = 0

			try {
				await transaction.rollback()
			} finally {
				state = 'rolled-back'
			}
		},
		flushPostCommitEvents: async (): Promise<void> => {
			if (state !== 'committed') {
				throw new TypeError(
					'Runtime transaction events require a committed transaction',
				)
			}

			const effects: readonly DeferredPostCommitEffect[] =
				postCommitEffects.splice(0)

			for (const effect of effects) {
				await effect()
			}
		},
	})
}
