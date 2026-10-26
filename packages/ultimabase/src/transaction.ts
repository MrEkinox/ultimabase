// Transactions (D-36, D-88): `AsyncLocalStorage` carries the open one, so a
// hook's queries join it without a `tx` argument.
import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import type { Transaction } from './adapter.ts'
import { RelationViolation } from './adapter.ts'
import type { Logger } from './app-options.ts'
import { decoded } from './field-codec.ts'
import type { Running } from './running.ts'
import { current } from './running.ts'
import { refused } from './write-target.ts'

/** What a query reads and writes through. */
export type Store = Pick<Transaction, 'find' | 'count' | 'write'> & {
	/**
	 * The write's changes when nothing follows them: alone, they need no
	 * transaction (D-99).
	 */
	readonly last: Transaction['write']
}

/** A `*Commit` hook, run once the transaction commits (D-15). */
export type Commit = () => Promise<void>

type Open = {
	readonly app: Running
	/** Begun by the first query (D-99). */
	tx: Promise<Transaction> | undefined
	readonly commits: Commit[]
	/** The first query that failed in it (D-36). */
	failure: { readonly error: unknown } | undefined
}

const opened = new AsyncLocalStorage<Open>()

async function begun(open: Open): Promise<Transaction> {
	open.tx ??= open.app.adapter.begin()
	return open.tx
}

/** The store's rows with their plugin fields decoded (D-122). */
function decoding(app: Running, store: Store): Store {
	const { models } = app.resolved
	return {
		find: async (read) => decoded(models, read, await store.find(read)),
		count: async (read) => store.count(read),
		write: async (write) =>
			decoded(models, write.read, await store.write(write)),
		last: async (write) => decoded(models, write.read, await store.last(write)),
	}
}

/** Queries in the transaction; `owner`'s last write may run alone. */
function storeOf(open: Open, owner: boolean): Store {
	return decoding(open.app, {
		find: async (read) => (await begun(open)).find(read),
		count: async (read) => (await begun(open)).count(read),
		write: async (write) => (await begun(open)).write(write),
		last: async (write) =>
			owner && open.tx === undefined
				? open.app.adapter.write(write)
				: (await begun(open)).write(write),
	})
}

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

/** A transaction that failed to begin has nothing to roll back. */
async function rollback(open: Open): Promise<void> {
	const tx = await open.tx?.catch(() => undefined)
	await tx?.rollback()
}

async function atomic<R>(
	app: Running,
	run: (open: Open) => Promise<R>,
): Promise<R> {
	const open: Open = { app, tx: undefined, commits: [], failure: undefined }
	let result: R
	try {
		result = await opened.run(open, run, open)
	} catch (error) {
		await rollback(open)
		throw error
	}
	if (open.failure !== undefined) {
		await rollback(open)
		throw open.failure.error
	}
	try {
		await (await open.tx)?.commit()
	} catch (error) {
		// A deferred foreign key checks at the commit (D-99).
		throw error instanceof RelationViolation ? refused(error) : error
	}
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
	if (open === undefined) {
		const { adapter } = app
		return run(
			decoding(app, {
				find: async (read) => adapter.find(read),
				count: async (read) => adapter.count(read),
				write: async (write) => adapter.write(write),
				last: async (write) => adapter.write(write),
			}),
		)
	}
	return joined(open, async () => run(storeOf(open, false)))
}

/** A write: in the open transaction, else in its own (D-36). */
export async function writing<R>(
	app: Running,
	run: (store: Store, commits: Commit[]) => Promise<R>,
): Promise<R> {
	const open = opened.getStore()
	if (open !== undefined) {
		return joined(open, async () => run(storeOf(open, false), open.commits))
	}
	return atomic(app, async (own) => run(storeOf(own, true), own.commits))
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
