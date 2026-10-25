// The PostgreSQL adapter (D-47): Kysely builds the statements, `pg` runs
// them. `log` lets the tests count the statements (D-98).
import type {
	LogEvent,
	QueryExecutorProvider,
	Transaction as Open,
} from 'kysely'
import { Kysely, PostgresDialect, sql } from 'kysely'
import { Pool } from 'pg'
import { parse } from 'pg-connection-string'
import { CheckFailed } from 'ultimabase'
import type {
	Adapter,
	CountRead,
	Read,
	Row,
	Schema,
	Transaction,
	Write,
} from 'ultimabase'
import { decodeRows } from './decode.ts'
import { apply, remoteOf, reset, stored } from './migrations.ts'
import { Catalog } from './names.ts'
import { plan } from './plan.ts'
import { compileCount, compileFind } from './read.ts'
import { parseSnapshot, snapshotOf } from './snapshot.ts'
import type { Statement } from './write.ts'
import { compileWrite, translate } from './write.ts'

export type Options = {
	readonly url: string | undefined
	readonly log?: (event: LogEvent) => void
}

/** The codes of a server the network does not reach, or does not know. */
const unreachable =
	/^(ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH)$/

/**
 * `error`, or one naming the server `url` cannot reach, not its password
 * (D-105).
 */
function reach(url: string, error: unknown): unknown {
	const code: unknown = Reflect.get(Object(error), 'code')
	if (typeof code !== 'string' || !unreachable.test(code)) return error
	const { host, port } = parse(url)
	const address = `${host || process.env['PGHOST'] || 'localhost'}:${port || 5432}`
	const message = `Cannot reach PostgreSQL at ${address} (${code}): is it running, and is its url right?`
	return Object.assign(new Error(message, { cause: error }), { code })
}

/** What the callback a rollback ends throws, which `rollback()` swallows. */
const rolledBack = new Error('The transaction was rolled back.')

async function find(
	catalog: Catalog,
	db: QueryExecutorProvider,
	read: Read,
): Promise<Row[]> {
	const { rows } = await compileFind(catalog, read).execute(db)
	const [first] = rows
	const value =
		typeof first === 'object' && first !== null && 'rows' in first
			? first.rows
			: undefined
	return decodeRows(catalog, read.model, value, read)
}

async function count(
	catalog: Catalog,
	db: QueryExecutorProvider,
	read: CountRead,
): Promise<number> {
	const { rows } = await compileCount(catalog, read).execute(db)
	const [first] = rows
	const value =
		typeof first === 'object' && first !== null && 'count' in first
			? first.count
			: undefined
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
		throw translate(catalog, error)
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
): Promise<Row[]> {
	return run(catalog, db, given, compileWrite(catalog, given))
}

/** Refuses a server below PostgreSQL 15 (D-50). */
export function requireVersion(version: string | undefined): void {
	if (!(Number(version) >= 150000)) {
		throw new Error(`UltimaBase needs PostgreSQL 15 or later.`)
	}
}

export function createAdapter(options: Options): Adapter {
	const { url } = options
	const remote = url ? remoteOf(url) : undefined
	let state: { db: Kysely<object>; catalog: Catalog } | undefined
	const started = () => {
		if (state === undefined) throw new Error('postgres() is not started.')
		return state
	}
	return {
		start: async (schema: Schema) => {
			if (!url) {
				throw new Error(
					'postgres() was given no url: is the variable it reads set?',
				)
			}
			const catalog = new Catalog(schema)
			// Refuses two things stored under one name before it connects.
			snapshotOf(catalog)
			const pool = new Pool({ connectionString: url })
			// A connection the server ends would crash the process unheard. An
			// idle one the pool drops, and the next query opens another; one a
			// transaction holds fails its next statement, and the pool drops it
			// once given back.
			pool.on('error', () => undefined)
			pool.on('connect', (client) => client.on('error', () => undefined))
			const dialect = new PostgresDialect({ pool })
			const db = new Kysely<object>({
				dialect,
				...(options.log === undefined ? {} : { log: options.log }),
			})
			try {
				const { rows } = await sql<{
					server_version_num: string
				}>`show server_version_num`.execute(db)
				requireVersion(rows[0]?.server_version_num)
			} catch (error) {
				await db.destroy()
				throw reach(url, error)
			}
			state = { db, catalog }
		},
		stop: async () => {
			const db = state?.db
			state = undefined
			await db?.destroy()
		},
		find: async (read) => find(started().catalog, started().db, read),
		count: async (read) => count(started().catalog, started().db, read),
		write: async (given) => {
			const { catalog, db } = started()
			const statements = compileWrite(catalog, given)
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
			snapshot: (schema) => snapshotOf(new Catalog(schema)),
			plan: (from, to) =>
				plan(
					from === undefined ? undefined : parseSnapshot(from),
					parseSnapshot(to),
				),
			stored: async () => stored(started().db),
			apply: async (given) => apply(started().db, given),
			reset: async () => reset(started().db),
			...(remote === undefined ? {} : { remote }),
		},
		begin: async (): Promise<Transaction> => {
			const { catalog, db } = started()
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
			return {
				find: async (read) => find(catalog, trx, read),
				count: async (read) => count(catalog, trx, read),
				write: async (given) => write(catalog, trx, given),
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
		},
	}
}
