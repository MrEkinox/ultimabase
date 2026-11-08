// The PostgreSQL adapter (D-47): Kysely builds the statements, `pg` runs
// them. `log` lets the tests count the statements (D-98); `sql` runs the
// application's own, and a test file may run in a schema of its own (D-137).
import type {
	LogEvent,
	QueryExecutorProvider,
	Transaction as Open,
} from 'kysely'
import { Kysely, sql } from 'kysely'
import { CheckFailed, Refused } from 'ultimabase'
import { joining, scratchable } from 'ultimabase/internal'
import type {
	Adapter,
	CountRead,
	Feed,
	Logger,
	Read,
	Row,
	Schema,
	Transaction,
	Write,
} from 'ultimabase'
import { aggregate } from './aggregate.ts'
import { decodeRows } from './decode.ts'
import { apply, remoteOf, reset, stored } from './migrations.ts'
import { Catalog } from './names.ts'
import { overflowed } from './numbers.ts'
import { fillsOf } from './fills.ts'
import type { Opened } from './kept.ts'
import { released, reused } from './kept.ts'
import { timeoutOf } from './deadline.ts'
import { channelOf, listening } from './listen.ts'
import { plan } from './plan.ts'
import { BeginSent } from './begin.ts'
import { pooled, poolOf } from './pool.ts'
import { compileCount, compileFind } from './read.ts'
import { schemaOf } from './server.ts'
import {
	connecting,
	dropped,
	emptied,
	scratchName,
	trigrams,
	truncated,
} from './scratch.ts'
import { parseSnapshot } from './snapshot-parse.ts'
import { snapshotOf } from './snapshot.ts'
import type { Statement } from './write.ts'
import { translate } from './translate.ts'
import { compileWrite } from './write.ts'

export type Options = {
	readonly url: string | undefined
	/** How many connections the pool opens at most (D-47). */
	readonly connections?: number
	/** The milliseconds a query waits for a connection, or to open one. */
	readonly wait?: number
	readonly log?: (event: LogEvent) => void
	/** The text search configuration of every `_search`, `'simple'` by default (D-148). */
	readonly searchLanguage?: string
	/** Plans a composed statement once per connection; `true` by default (D-264, D-274). */
	readonly prepared?: boolean
	/** The milliseconds a statement may run, unbounded by default (D-331). */
	readonly statementTimeout?: number
}

/** What `postgres()` returns: an adapter that also runs raw SQL (D-137). */
export type Postgres = Adapter & {
	/**
	 * Runs one statement, in the open transaction if any, and returns its
	 * rows; each `${value}` is a parameter. No rule or hook runs.
	 */
	readonly sql: <R extends object = Record<string, unknown>>(
		strings: TemplateStringsArray,
		...values: readonly unknown[]
	) => Promise<R[]>
}

/** What the callback a rollback ends throws, which `rollback()` swallows. */
const rolledBack = new Error('The transaction was rolled back.')

/** `key` of a statement's first row, if it returned one. */
function firstOf(rows: readonly unknown[], key: string): unknown {
	const [first] = rows
	if (typeof first !== 'object' || first === null) return undefined
	const value: unknown = Reflect.get(first, key)
	return value
}

async function find(
	catalog: Catalog,
	db: QueryExecutorProvider,
	read: Read,
	committed = false,
): Promise<Row[]> {
	const { rows } = await compileFind(catalog, read, committed).execute(db)
	return decodeRows(catalog, read.model, firstOf(rows, 'rows'), read)
}

async function count(
	catalog: Catalog,
	db: QueryExecutorProvider,
	read: CountRead,
	committed = false,
): Promise<number> {
	const { rows } = await compileCount(catalog, read, committed).execute(db)
	const value = firstOf(rows, 'count')
	if (typeof value !== 'number') throw new Error('The count is not a number.')
	return value
}

/** A read in a transaction, a conflict reported as `Conflict` (D-179). */
async function translated<R>(catalog: Catalog, read: Promise<R>): Promise<R> {
	try {
		return await read
	} catch (error) {
		throw translate(catalog, error)
	}
}

/** Runs a write's statements; the one that reads returns the rows. */
async function run(
	catalog: Catalog,
	db: QueryExecutorProvider,
	given: Write,
	statements: readonly Statement[],
): Promise<Row[]> {
	let rows: unknown
	try {
		for (const statement of statements) {
			const [first] = (await statement.sql.execute(db)).rows
			for (let at = 0; at < statement.checks; at += 1) {
				if (first?.[`c${at}`] !== true) throw new CheckFailed(at)
			}
			if (first !== undefined && 'rows' in first) rows = first['rows']
		}
	} catch (error) {
		throw translate(catalog, overflowed(given, error))
	}
	const read = given.read
	// A `before` read of a model the write deletes nothing of reads none.
	if (read === undefined || rows === undefined) return []
	return decodeRows(catalog, read.model, rows, read)
}

async function write(
	catalog: Catalog,
	db: QueryExecutorProvider,
	given: Write,
	channel: string | undefined,
): Promise<Row[]> {
	return run(catalog, db, given, compileWrite(catalog, given, channel))
}

export function createAdapter(options: Options): Postgres {
	const { url, connections = 10, wait = 10_000, searchLanguage } = options
	const remote = url ? remoteOf(url) : undefined
	/** Whether a migration lifts the statement timeout for its own (D-331). */
	const free = options.statementTimeout !== undefined
	let state: (Opened & { readonly catalog: Catalog }) | undefined
	/** A test file's schema, whether a start created it, and what it keeps. */
	let scratch:
		| { readonly name: string; made: boolean; kept?: Opened | undefined }
		| undefined
	/** Each open transaction's own, for `sql` to join. */
	const opens = new WeakMap<Transaction, Open<object>>()
	/** Migrations running, which no statement timeout ends (D-331). */
	let migrating = 0
	const migrated = async <T>(migration: () => Promise<T>): Promise<T> => {
		migrating += 1
		try {
			return await migration()
		} finally {
			migrating -= 1
		}
	}
	const started = () => {
		if (state === undefined) throw new Error('postgres() is not started.')
		return state
	}
	const adapter: Postgres = {
		start: async (schema: Schema, logger: Logger, feed?: Feed) => {
			if (!url) {
				throw new Refused(
					'postgres() was given no url: is the variable it reads set?',
				)
			}
			if (!Number.isInteger(connections) || connections < 1) {
				throw new Refused(
					`postgres() takes connections as a whole number, 1 or more, not ${connections}.`,
				)
			}
			const timeout = timeoutOf(options.statementTimeout)
			const catalog = new Catalog(schema, searchLanguage)
			// Refuses two things stored under one name before it connects.
			const snapshot = snapshotOf(catalog)
			const { tables } = snapshot
			const shape = JSON.stringify(snapshot)
			if (scratch !== undefined) {
				const again = await reused(
					scratch.kept,
					shape,
					scratch.name,
					feed,
					logger,
				)
				scratch.kept = undefined
				if (again !== undefined) {
					state = { ...again, catalog }
					return
				}
			}
			const trigram = Object.values(tables).some(
				(table) => Object.keys(table.trigrams).length > 0,
			)
			const extensions =
				scratch !== undefined && trigram ? [await trigrams(url)] : []
			const config = connecting(url, scratch?.name, extensions)
			const { pool, open } = poolOf({
				config,
				connections,
				wait,
				prepared: options.prepared !== false,
				timeout,
				spared: () => migrating > 0,
				logger,
			})
			const dialect = new BeginSent({
				pool: pooled(url, pool, connections, wait),
			})
			const db = new Kysely<object>({
				dialect,
				...(options.log === undefined ? {} : { log: options.log }),
			})
			// A test file's channel is known before the server answers: its
			// listener connects with the pool, not after it (D-308).
			const known = scratch === undefined ? undefined : channelOf(scratch.name)
			const early =
				feed === undefined || known === undefined
					? undefined
					: listening(config, known, feed, logger, () => [...open])
			early?.catch(() => undefined)
			try {
				const current = await schemaOf(db, catalog, logger)
				if (scratch !== undefined) {
					scratch.made = true
					await emptied(db, scratch.name, current)
				}
				const channel = known ?? channelOf(current ?? '')
				const quiet = () =>
					pool.idleCount === pool.totalCount && pool.waitingCount === 0
				const opened = { db, catalog, quiet, shape }
				state =
					feed === undefined
						? opened
						: {
								...opened,
								channel,
								listener: await (early ??
									listening(config, channel, feed, logger, () => [...open])),
							}
			} catch (error) {
				await early?.then((listener) => listener.stop()).catch(() => undefined)
				await db.destroy()
				throw error
			}
		},
		stop: async () => {
			const stopping = state
			state = undefined
			if (stopping === undefined) return
			// The file's next start takes them back, unless a query still runs.
			if (scratch !== undefined && stopping.quiet()) {
				stopping.listener?.paused()
				scratch.kept = stopping
				return
			}
			await released(stopping)
		},
		empty: async () => {
			const { catalog, db } = started()
			await truncated(db, Object.keys(snapshotOf(catalog).tables))
		},
		// Outside a transaction, a statement reads committed rows (D-320).
		find: async (read) => find(started().catalog, started().db, read, true),
		count: async (read) => count(started().catalog, started().db, read, true),
		aggregate: async (read) => aggregate(started().catalog, started().db, read),
		write: async (given) => {
			const { catalog, db, channel } = started()
			const statements = compileWrite(catalog, given, channel)
			// One statement is atomic alone: no BEGIN, no COMMIT (D-99).
			if (statements.length <= 1) return run(catalog, db, given, statements)
			try {
				return await db
					.transaction()
					.execute(async (trx) => run(catalog, trx, given, statements))
			} catch (error) {
				// A deferred foreign key checks at the COMMIT (D-99).
				throw translate(catalog, error)
			}
		},
		migrations: {
			snapshot: (schema) => snapshotOf(new Catalog(schema, searchLanguage)),
			plan: (from, schema) => {
				const catalog = new Catalog(schema, searchLanguage)
				return plan(
					from === undefined ? undefined : parseSnapshot(from),
					snapshotOf(catalog),
					fillsOf(catalog),
				)
			},
			stored: async () => stored(started().db),
			apply: async (given) =>
				migrated(async () => apply(started().db, given, free)),
			reset: async () => migrated(async () => reset(started().db, free)),
			...(remote === undefined ? {} : { remote }),
		},
		begin: async (asked): Promise<Transaction> => {
			const { catalog, db, channel } = started()
			const opened = Promise.withResolvers<Open<object>>()
			const ending = Promise.withResolvers<boolean>()
			const begun =
				asked?.isolation === 'serializable'
					? db.transaction().setIsolationLevel('serializable')
					: db.transaction()
			// Kysely gives the connection back however its transaction ends, a
			// failed ROLLBACK included; a COMMIT that fails rolls back.
			const ended = begun.execute(async (trx) => {
				opened.resolve(trx)
				if (!(await ending.promise)) throw rolledBack
			})
			// A BEGIN that fails rejects `opened` too.
			void ended.catch(opened.reject)
			const trx = await opened.promise
			const end = async (commit: boolean) => {
				ending.resolve(commit)
				await ended
			}
			const tx: Transaction = {
				find: async (read) => translated(catalog, find(catalog, trx, read)),
				count: async (read) => translated(catalog, count(catalog, trx, read)),
				aggregate: async (read) =>
					translated(catalog, aggregate(catalog, trx, read)),
				write: async (given) => write(catalog, trx, given, channel),
				commit: async () => {
					try {
						await end(true)
					} catch (error) {
						throw translate(catalog, error)
					}
				},
				rollback: async () => {
					try {
						await end(false)
					} catch (error) {
						if (error !== rolledBack) throw error
					}
				},
			}
			opens.set(tx, trx)
			return tx
		},
		sql: async <R extends object>(
			strings: TemplateStringsArray,
			...values: readonly unknown[]
		) =>
			joining(adapter, async (tx) => {
				const db = (tx && opens.get(tx)) ?? started().db
				return (await sql<R>(strings, ...values).execute(db)).rows
			}),
	}
	return scratchable(adapter, () => {
		scratch = { name: scratchName(), made: false }
		const own = scratch
		return {
			drop: async () => {
				scratch = undefined
				const { kept } = own
				own.kept = undefined
				if (kept !== undefined) await released(kept)
				if (own.made && url) await dropped(url, own.name)
			},
		}
	})
}
