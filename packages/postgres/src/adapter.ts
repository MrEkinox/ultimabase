// The PostgreSQL adapter (D-47): Kysely builds the statements, `pg` runs
// them. `log` lets the tests count the statements (D-98); `sql` runs the
// application's own, and a test file may run in a schema of its own (D-137).
import type {
	LogEvent,
	QueryExecutorProvider,
	Transaction as Open,
} from 'kysely'
import { Kysely, PostgresDialect, sql } from 'kysely'
import { Pool } from 'pg'
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
import type { Listener } from './listen.ts'
import { channelOf, listening } from './listen.ts'
import { plan } from './plan.ts'
import { pooled } from './pool.ts'
import { compileCount, compileFind } from './read.ts'
import {
	connecting,
	dropped,
	emptied,
	scratchName,
	trigrams,
} from './scratch.ts'
import { parseSnapshot } from './snapshot-parse.ts'
import { snapshotOf } from './snapshot.ts'
import type { Statement } from './write.ts'
import { compileWrite, translate } from './write.ts'

export type Options = {
	readonly url: string | undefined
	/** How many connections the pool opens at most (D-47). */
	readonly connections?: number
	/** The milliseconds a query waits for a connection, or to open one. */
	readonly wait?: number
	readonly log?: (event: LogEvent) => void
	/** The text search configuration of every `_search`, `'simple'` by default (D-148). */
	readonly searchLanguage?: string
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
): Promise<Row[]> {
	const { rows } = await compileFind(catalog, read).execute(db)
	return decodeRows(catalog, read.model, firstOf(rows, 'rows'), read)
}

async function count(
	catalog: Catalog,
	db: QueryExecutorProvider,
	read: CountRead,
): Promise<number> {
	const { rows } = await compileCount(catalog, read).execute(db)
	const value = firstOf(rows, 'count')
	if (typeof value !== 'number') throw new Error('The count is not a number.')
	return value
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

/** Refuses a server below PostgreSQL 15 (D-50). */
export function requireVersion(version: string | undefined): void {
	if (!(Number(version) >= 150000)) {
		throw new Refused(`UltimaBase needs PostgreSQL 15 or later.`)
	}
}

/** What a case-insensitive filter misses when `lower('É') <> 'é'` (D-140). */
export function foldWarning(ctype: string): string {
	return `PostgreSQL folds case under its ${ctype} locale for ASCII only: a case-insensitive filter matches É and é in memory() but not here. Create the database with a UTF-8 locale, such as en_US.UTF-8.`
}

export function createAdapter(options: Options): Postgres {
	const { url, connections = 10, wait = 10_000, searchLanguage } = options
	const remote = url ? remoteOf(url) : undefined
	let state:
		| {
				db: Kysely<object>
				catalog: Catalog
				/** The feed's channel and listener, when it has a taker (D-154). */
				channel?: string
				listener?: Listener
		  }
		| undefined
	/** A test file's schema, and whether a start created it. */
	let scratch: { readonly name: string; made: boolean } | undefined
	/** Each open transaction's own, for `sql` to join. */
	const opens = new WeakMap<Transaction, Open<object>>()
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
			const catalog = new Catalog(schema, searchLanguage)
			// Refuses two things stored under one name before it connects.
			const { tables } = snapshotOf(catalog)
			const trigram = Object.values(tables).some(
				(table) => Object.keys(table.trigrams).length > 0,
			)
			const extensions =
				scratch !== undefined && trigram ? [await trigrams(url)] : []
			const config = connecting(url, scratch?.name, extensions)
			const pool = new Pool({
				...config,
				max: connections,
				connectionTimeoutMillis: wait,
			})
			// A connection the server ends would crash the process unheard. An
			// idle one the pool drops, and the next query opens another; one a
			// transaction holds fails its next statement, and the pool drops it
			// once given back.
			pool.on('error', () => undefined)
			pool.on('connect', (client) => {
				client.on('error', () => undefined)
				// Compiling a nested read costs a hundred times more than running
				// it; queued, this runs before the client's first query (D-47).
				client.query('set jit = off').catch(() => undefined)
			})
			const dialect = new PostgresDialect({
				pool: pooled(url, pool, connections, wait),
			})
			const db = new Kysely<object>({
				dialect,
				...(options.log === undefined ? {} : { log: options.log }),
			})
			try {
				const { rows } = await sql<{
					version: string
					folds: boolean
					ctype: string
					language: boolean
					schema: string
				}>`select current_setting('server_version_num') as version, current_schema() as schema,
					lower('É') = 'é' as folds,
					(select datctype from pg_database where datname = current_database()) as ctype,
					exists (select from pg_ts_config as c join pg_namespace as n on n.oid = c.cfgnamespace where (c.cfgname = ${catalog.language} and pg_ts_config_is_visible(c.oid)) or n.nspname || '.' || c.cfgname = ${catalog.language}) as language`.execute(
					db,
				)
				const [server] = rows
				requireVersion(server?.version)
				if (server?.language === false) {
					throw new Refused(
						`postgres() searches in '${catalog.language}', a text search configuration this server does not have.`,
					)
				}
				if (server !== undefined && !server.folds) {
					logger.warn(foldWarning(server.ctype))
				}
				if (scratch !== undefined) {
					scratch.made = true
					await emptied(db, scratch.name)
				}
				const channel = channelOf(scratch?.name ?? server?.schema ?? '')
				state =
					feed === undefined
						? { db, catalog }
						: {
								db,
								catalog,
								channel,
								listener: await listening(config, channel, feed, logger),
							}
			} catch (error) {
				await db.destroy()
				throw error
			}
		},
		stop: async () => {
			const stopping = state
			state = undefined
			await stopping?.listener?.stop()
			await stopping?.db.destroy()
		},
		find: async (read) => find(started().catalog, started().db, read),
		count: async (read) => count(started().catalog, started().db, read),
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
			apply: async (given) => apply(started().db, given),
			reset: async () => reset(started().db),
			...(remote === undefined ? {} : { remote }),
		},
		begin: async (): Promise<Transaction> => {
			const { catalog, db, channel } = started()
			const opened = Promise.withResolvers<Open<object>>()
			const ending = Promise.withResolvers<boolean>()
			// Kysely gives the connection back however its transaction ends, a
			// failed ROLLBACK included; a COMMIT that fails rolls back.
			const ended = db.transaction().execute(async (trx) => {
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
				find: async (read) => find(catalog, trx, read),
				count: async (read) => count(catalog, trx, read),
				aggregate: async (read) => aggregate(catalog, trx, read),
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
				if (own.made && url) await dropped(url, own.name)
			},
		}
	})
}
