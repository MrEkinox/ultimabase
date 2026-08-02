import { AsyncLocalStorage } from 'node:async_hooks'

const transactionExecutionStorage = new AsyncLocalStorage<string>()

/** Reads the opaque transaction identity inherited by nested hook operations. */
export const getCurrentTransactionId = (): string | undefined =>
	transactionExecutionStorage.getStore()

/** Keeps one framework-generated identity active through every finalization step. */
export const runWithTransactionId = <TResult>(
	transactionId: string,
	callback: () => TResult,
): TResult => transactionExecutionStorage.run(transactionId, callback)
