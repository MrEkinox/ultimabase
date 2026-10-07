import { FrameworkError } from '../../foundation.js'
import { immutableRecord, type MaybePromise } from '@ultimabase/shared'

import {
	isDatabaseAdapter,
	isDatabaseTransactionAdapter,
	type DatabaseTransactionAdapter,
} from '../database/contracts.js'
import type { RuntimePipelineStages } from '../pipeline/contracts.js'
import type { RuntimePipeline } from '../pipeline/runtime-pipeline.js'

type DeferredPostCommitEffect = () => MaybePromise<void>

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

const transactionError = (
	message: string,
	publicMessage: string,
	reason: string,
): FrameworkError<'TRANSACTION_ERROR'> =>
	new FrameworkError('TRANSACTION_ERROR', message, {
		publicMessage,
		internalDetails: { reason },
	})

/**
 * Reuses every pipeline stage with an isolated transaction adapter and keeps
 * post-commit effects private until the outer commit succeeds.
 */
export const beginPipelineTransaction = async (
	stages: Readonly<RuntimePipelineStages>,
	createPipeline: (stages: RuntimePipelineStages) => RuntimePipeline,
): Promise<RuntimePipelineTransactionScope> => {
	const database = stages.databaseOperation
	if (!isDatabaseAdapter(database)) {
		throw transactionError(
			'Runtime pipeline database executor cannot begin transactions.',
			'Transactions are not available.',
			'database-adapter-required',
		)
	}
	const transaction: unknown = await database.beginTransaction()
	if (!isDatabaseTransactionAdapter(transaction)) {
		throw transactionError(
			'Database adapter returned an invalid transaction executor.',
			'The transaction could not be started.',
			'invalid-transaction-adapter',
		)
	}

	const effects: DeferredPostCommitEffect[] = []
	const postCommit = stages.behaviors?.postCommit
	const pipeline = createPipeline({
		...stages,
		databaseOperation: transaction,
		// The outer scope commits the adapter exactly once after the callback.
		commit: () => undefined,
		...(postCommit === undefined
			? {}
			: {
					behaviors: immutableRecord({
						...stages.behaviors,
						postCommit: (input) => {
							effects.push(() => postCommit(input))
						},
					}),
				}),
	})
	transactionAdapters.set(pipeline, transaction)
	let state: 'active' | 'committed' | 'flushed' | 'flushing' | 'rolled-back' =
		'active'
	const assertActive = (): void => {
		if (state !== 'active') {
			throw new TypeError('Runtime transaction scope is already finalized')
		}
	}

	return immutableRecord({
		pipeline,
		commit: async (): Promise<void> => {
			assertActive()
			await transaction.commit()
			state = 'committed'
			transactionAdapters.delete(pipeline)
		},
		rollback: async (): Promise<void> => {
			assertActive()
			effects.length = 0
			try {
				await transaction.rollback()
				state = 'rolled-back'
			} finally {
				transactionAdapters.delete(pipeline)
			}
		},
		deferPostCommitEffect: (effect: DeferredPostCommitEffect): void => {
			if (state !== 'active' && state !== 'committed') {
				throw new TypeError(
					'Runtime transaction effects require an active transaction',
				)
			}
			if (typeof effect !== 'function') {
				throw new TypeError('Runtime transaction effect must be a function')
			}
			effects.push(effect)
		},
		flushPostCommitEvents: async (): Promise<void> => {
			if (state !== 'committed') {
				throw new TypeError(
					'Runtime transaction events require a committed transaction',
				)
			}
			state = 'flushing'
			const failures: unknown[] = []
			for (const effect of effects.splice(0)) {
				try {
					await effect()
				} catch (error: unknown) {
					// One committed observer cannot suppress independent sibling delivery.
					failures.push(error)
				}
			}
			state = 'flushed'
			if (failures.length === 1) throw failures[0]
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
