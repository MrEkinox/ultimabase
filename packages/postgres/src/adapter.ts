// The PostgreSQL adapter (D-47): Kysely builds the statements, `pg` runs
// them. `log` lets the tests count the statements (D-98).
import type { LogEvent, QueryExecutorProvider } from 'kysely'
import { Kysely, PostgresDialect, sql } from 'kysely'
import { Pool } from 'pg'
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
import { apply, reset, stored } from './migrations.ts'
import { Catalog } from './names.ts'
import { plan } from './plan.ts'
import { compileCount, compileFind } from './read.ts'
import { parseSnapshot, snapshotOf } from './snapshot.ts'
import type { Statement } from './write.ts'
import { compileWrite, translate } from './write.ts'

export type Options = {
	readonly url: string
	readonly log?: (event: LogEvent) => void
}

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
	return read === undefined ? [] : decodeRows(catalog, read.model, rows, read)
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
		throw new Error(`UltimaBase needs PostgreSQL 15 or later (D-50).`)
	}
}

export function createAdapter(options: Options): Adapter {
	let state: { db: Kysely<object>; catalog: Catalog } | undefined
	const started = () => {
		if (state === undefined) throw new Error('postgres() is not started.')
		return state
	}
	return {
		start: async (schema: Schema) => {
			const catalog = new Catalog(schema)
			// Refuses two things stored under one name before it connects.
			snapshotOf(catalog)
			const pool = new Pool({ connectionString: options.url })
			// An idle connection the server ends would crash the process unheard:
			// the pool drops it and the next query opens another.
			pool.on('error', () => undefined)
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
				throw error
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
		},
		begin: async (): Promise<Transaction> => {
			const { catalog, db } = started()
			const trx = await db.startTransaction().execute()
			return {
				find: async (read) => find(catalog, trx, read),
				count: async (read) => count(catalog, trx, read),
				write: async (given) => write(catalog, trx, given),
				commit: async () => {
					try {
						await trx.commit().execute()
					} catch (error) {
						// A failed COMMIT keeps its connection until a ROLLBACK frees it.
						await trx.rollback().execute()
						throw translate(catalog, error)
					}
				},
				rollback: async () => trx.rollback().execute(),
			}
		},
	}
}
