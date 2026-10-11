import { AsyncLocalStorage } from 'node:async_hooks'

import type { MaybePromise } from '@ultimabase/shared'

import { readApplicationLog } from '../../application/application-kernel-state.js'
import {
	readActiveApplicationOwner,
	runApplicationWork,
} from '../../application/active-application.js'

/** One unit of work queued by `runAfterCommit` on a transaction. */
export type AfterCommitWork = () => MaybePromise<void>

// Captured when Core loads, outside any request: background work runs here so
// it inherits no request, transaction, callback or nested-write scope.
const runDetached = AsyncLocalStorage.snapshot()

const pendingWork = new WeakMap<object, Set<Promise<void>>>()

const runSequentially = async (
	works: readonly AfterCommitWork[],
): Promise<void> => {
	for (const work of works) {
		try {
			await work()
		} catch (error: unknown) {
			// Nothing can roll back after commit and the caller already has its answer.
			readApplicationLog().error(
				'UltimaBase: after-commit work failed; the committed write is kept',
				error instanceof Error ? error : { error },
			)
		}
	}
}

/**
 * Starts the works one transaction queued, in order, outside its request and
 * without delaying the response. The active application tracks them: `stop()`
 * and `dispose()` wait for them, and so does `waitForAfterCommitWork()`.
 */
export const startAfterCommitWork = (
	works: readonly AfterCommitWork[],
): void => {
	if (works.length === 0) return
	const owner = readActiveApplicationOwner()
	const start = (): Promise<void> => runDetached(() => runSequentially(works))
	if (owner === undefined) {
		void start()
		return
	}
	let pending = pendingWork.get(owner)
	if (pending === undefined) {
		pending = new Set()
		pendingWork.set(owner, pending)
	}
	const tracked = pending
	const promise = runApplicationWork(owner, start).finally(() => {
		tracked.delete(promise)
	})
	tracked.add(promise)
}

/**
 * Resolves once the after-commit work of the active application has settled,
 * including work started by that work (ADR-0318). Tests use it to observe
 * `afterCommit` hooks and events; it never rejects.
 *
 * @example `await Todo.createOne({ data }); await waitForAfterCommitWork()`
 */
export const waitForAfterCommitWork = async (): Promise<void> => {
	const owner = readActiveApplicationOwner()
	const pending = owner === undefined ? undefined : pendingWork.get(owner)
	if (pending === undefined) return
	while (pending.size > 0) {
		await Promise.allSettled(pending)
	}
}
