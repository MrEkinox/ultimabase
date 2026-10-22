// Transactions (D-36, D-88): `AsyncLocalStorage` carries the open one, so a
// hook's queries join it without a `tx` argument.
import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import type { Transaction } from './adapter.ts'
import type { Logger } from './app-options.ts'
import type { Running } from './running.ts'
import { current } from './running.ts'

/** What a query reads and writes through. */
export type Store = Pick<Transaction, 'find' | 'count' | 'write'>

/** A `*Commit` hook, run once the transaction commits (D-15). */
export type Commit = () => Promise<void>

type Open = {
	readonly tx: Transaction
	readonly commits: Commit[]
	/** The first query that failed in it (D-36). */
	failure: { readonly error: unknown } | undefined
}

const opened = new AsyncLocalStorage<Open>()

/** Runs in the open transaction; a failure rolls all of it back (D-36). */
async function joined<R>(open: Open, run: () => Promise<R>): Promise<R> {
	if (open.failure !== undefined) {
		throw new Error(
			'A query failed in this transaction, which rolls back: no other query runs in it.',
			{ cause: open.failure.error },
		)
	}
	try {
		return await run()
	} catch (error) {
		open.failure ??= { error }
		throw error
	}
}

async function committed(logger: Logger, commits: Commit[]): Promise<void> {
	for (const commit of commits) {
		try {
			await commit()
		} catch (error) {
			logger.error(
				{ correlationId: randomUUID(), err: error },
				'A commit hook failed; the write is kept.',
			)
		}
	}
}

async function atomic<R>(
	app: Running,
	run: (open: Open) => Promise<R>,
): Promise<R> {
	const tx = await app.adapter.begin()
	const open: Open = { tx, commits: [], failure: undefined }
	let result: R
	try {
		result = await opened.run(open, run, open)
	} catch (error) {
		await tx.rollback()
		throw error
	}
	if (open.failure !== undefined) {
		await tx.rollback()
		throw open.failure.error
	}
	await tx.commit()
	// Outside the transaction: a commit hook's queries open their own.
	await committed(app.logger, open.commits)
	return result
}

/** A read: in the open transaction, else straight on the adapter. */
export async function reading<R>(
	app: Running,
	run: (store: Store) => Promise<R>,
): Promise<R> {
	const open = opened.getStore()
	if (open === undefined) return run(app.adapter)
	return joined(open, async () => run(open.tx))
}

/** A write: in the open transaction, else in its own (D-36). */
export async function writing<R>(
	app: Running,
	run: (store: Store, commits: Commit[]) => Promise<R>,
): Promise<R> {
	const open = opened.getStore()
	if (open !== undefined) {
		return joined(open, async () => run(open.tx, open.commits))
	}
	return atomic(app, async ({ tx, commits }) => run(tx, commits))
}

/**
 * Runs `run` in one transaction: if it throws, or if a query in it fails,
 * every write rolls back and the `*Commit` hooks never run. Inside another
 * `transaction`, it joins that one (D-36).
 */
export async function transaction<R>(run: () => Promise<R>): Promise<R> {
	const open = opened.getStore()
	if (open !== undefined) return joined(open, run)
	const app = current()
	if (app === undefined) {
		throw new Error('transaction runs on a started application.')
	}
	return app.work.run(async () => atomic(app, run))
}
