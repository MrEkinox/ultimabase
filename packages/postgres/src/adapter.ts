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
import { createTables, tableNames } from './ddl.ts'
import { decodeRows } from './decode.ts'
import { Catalog } from './names.ts'
import { compileCount, compileFind } from './read.ts'
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

/** Runs a write's statements; the last one returns the rows it reads. */
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
			rows = first?.['rows']
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

/** Creates the tables of a new database, and refuses any other (D-98). */
async function prepare(catalog: Catalog, db: Kysely<object>): Promise<void> {
	const { rows } = await sql<{
		server_version_num: string
	}>`show server_version_num`.execute(db)
	requireVersion(rows[0]?.server_version_num)
	const names = tableNames(catalog)
	const found = await sql<{ table_name: string }>`
		select table_name from information_schema.tables
		where table_schema = current_schema()
		and table_name in (${sql.join(names)})`.execute(db)
	if (found.rows.length > 0) {
		const list = found.rows.map((row) => row.table_name).join(', ')
		throw new Error(
			`The database already holds ${list}: UltimaBase only creates the tables of an empty database until migrations arrive (D-98).`,
		)
	}
	await db.transaction().execute(async (trx) => {
		for (const statement of createTables(catalog)) await statement.execute(trx)
	})
}

export function createAdapter(options: Options): Adapter {
	let state: { db: Kysely<object>; catalog: Catalog } | undefined
	const started = () => {
		if (state === undefined) throw new Error('postgres() is not started.')
		return state
	}
	return {
		start: async (schema: Schema) => {
			const pool = new Pool({ connectionString: options.url })
			const dialect = new PostgresDialect({ pool })
			const db = new Kysely<object>({
				dialect,
				...(options.log === undefined ? {} : { log: options.log }),
			})
			const catalog = new Catalog(schema)
			try {
				await prepare(catalog, db)
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
			return db
				.transaction()
				.execute(async (trx) => run(catalog, trx, given, statements))
		},
		begin: async (): Promise<Transaction> => {
			const { catalog, db } = started()
			const trx = await db.startTransaction().execute()
			return {
				find: async (read) => find(catalog, trx, read),
				count: async (read) => count(catalog, trx, read),
				write: async (given) => write(catalog, trx, given),
				commit: async () => trx.commit().execute(),
				rollback: async () => trx.rollback().execute(),
			}
		},
	}
}
