import { AsyncLocalStorage } from 'node:async_hooks'
import type { MaybePromise } from '@ultimabase/shared'

export type DeferredTransactionEffect = () => MaybePromise<void>

interface TransactionExecutionState {
	readonly deferPostCommitEffect: (effect: DeferredTransactionEffect) => void
	readonly transactionId: string
}

const transactionExecutionStorage =
	new AsyncLocalStorage<TransactionExecutionState>()

/** Reads the opaque transaction identity inherited by nested hook operations. */
export const getCurrentTransactionId = (): string | undefined =>
	transactionExecutionStorage.getStore()?.transactionId

/** Queues one effect on the exact transaction inherited by the current hook. */
export const deferCurrentTransactionEffect = (
	effect: DeferredTransactionEffect,
): void => {
	const state = transactionExecutionStorage.getStore()

	if (state === undefined) {
		throw new TypeError('Transaction execution scope is unavailable')
	}

	state.deferPostCommitEffect(effect)
}

/** Keeps one framework-generated identity active through every finalization step. */
export const runWithTransactionExecution = <TResult>(
	state: TransactionExecutionState,
	callback: () => TResult,
): TResult => transactionExecutionStorage.run(state, callback)
