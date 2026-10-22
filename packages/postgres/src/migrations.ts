// How a PostgreSQL database follows the models (D-105): the snapshot its
// tables match in `ultimabase_schema`, the files `migrate deploy` applied in
// `ultimabase_migrations`, and every change under one advisory lock.
import type { Kysely, Transaction } from 'kysely'
import { sql } from 'kysely'
import type { Run, Stored } from 'ultimabase'
import { parseSnapshot } from './snapshot.ts'

const bookkeeping = [
	sql`create table if not exists ultimabase_schema (id integer primary key check (id = 1), snapshot jsonb not null, written_by text not null, written_at timestamptz not null)`,
	sql`create table if not exists ultimabase_migrations (name text primary key, checksum text not null, applied_at timestamptz not null)`,
]

/** Runs `run` in a transaction that holds the schema's lock. */
async function locked(
	db: Kysely<object>,
	run: (trx: Transaction<object>) => Promise<void>,
): Promise<void> {
	await db.transaction().execute(async (trx) => {
		await sql`select pg_advisory_xact_lock(hashtext(current_schema()))`.execute(
			trx,
		)
		for (const statement of bookkeeping) await statement.execute(trx)
		await run(trx)
	})
}

async function store(
	trx: Transaction<object>,
	to: unknown,
	by: Stored['by'],
): Promise<void> {
	await sql`insert into ultimabase_schema (id, snapshot, written_by, written_at)
		values (1, ${JSON.stringify(to)}::jsonb, ${by}, now())
		on conflict (id) do update set snapshot = excluded.snapshot,
		written_by = excluded.written_by, written_at = excluded.written_at`.execute(trx)
}

const isApplied = (value: unknown): value is Stored['applied'] =>
	Array.isArray(value) &&
	value.every(
		(item: unknown) =>
			typeof item === 'object' &&
			item !== null &&
			'name' in item &&
			typeof item.name === 'string' &&
			'checksum' in item &&
			typeof item.checksum === 'string',
	)

/**
 * The stored snapshot and the applied files, in one query. A deploy that
 * stopped before it stored its snapshot leaves files and no snapshot.
 */
export async function stored(db: Kysely<object>): Promise<Stored | undefined> {
	try {
		const { rows } = await sql<{
			snapshot: unknown
			written_by: unknown
			applied: unknown
		}>`select
			(select snapshot from ultimabase_schema) as snapshot,
			(select written_by from ultimabase_schema) as written_by,
			(select coalesce(json_agg(json_build_object('name', name, 'checksum', checksum) order by name), '[]')
				from ultimabase_migrations) as applied`.execute(db)
		const [row] = rows
		const { snapshot, written_by: by, applied } = row ?? {}
		if (!isApplied(applied)) throw new Error('ultimabase_migrations is broken.')
		if (snapshot === null && applied.length === 0) return undefined
		return {
			snapshot: snapshot ?? undefined,
			by: by === 'sync' ? 'sync' : 'deploy',
			applied,
		}
	} catch (error) {
		if (error instanceof Error && 'code' in error && error.code === '42P01') {
			return undefined
		}
		throw error
	}
}

/** Refuses tables that no snapshot describes (D-105). */
async function refuseTables(
	trx: Transaction<object>,
	to: unknown,
): Promise<void> {
	const names = Object.keys(parseSnapshot(to).tables)
	const { rows } = await sql<{ table_name: string }>`
		select table_name from information_schema.tables
		where table_schema = current_schema() and table_name = any(${names})
		order by table_name`.execute(trx)
	if (rows.length === 0) return
	const list = rows.map((row) => row.table_name).join(', ')
	throw new Error(
		`The database already holds ${list}, and no UltimaBase snapshot says what they are: sync only builds an empty database (D-105).`,
	)
}

async function sync(
	db: Kysely<object>,
	run: Extract<Run, { kind: 'sync' }>,
): Promise<void> {
	await locked(db, async (trx) => {
		const { rows } = await sql<{ done: boolean; same: boolean | null }>`
			select snapshot = ${JSON.stringify(run.to)}::jsonb as done,
			snapshot = ${run.from === undefined ? null : JSON.stringify(run.from)}::jsonb as same
			from ultimabase_schema`.execute(trx)
		const [row] = rows
		// Another process synced the same models first.
		if (row?.done === true) return
		if (row === undefined ? run.from !== undefined : row.same !== true) {
			throw new Error(
				'The database changed while UltimaBase synced it: start again.',
			)
		}
		if (row === undefined) await refuseTables(trx, run.to)
		for (const statement of run.statements) {
			await sql.raw(statement.sql).execute(trx)
		}
		await store(trx, run.to, 'sync')
	})
}

async function deploy(
	db: Kysely<object>,
	run: Extract<Run, { kind: 'deploy' }>,
): Promise<void> {
	for (const file of run.files) {
		await locked(db, async (trx) => {
			const { rows } = await sql`
				select 1 from ultimabase_migrations where name = ${file.name}`.execute(trx)
			// Another deploy applied it first.
			if (rows.length > 0) return
			try {
				await sql.raw(file.sql).execute(trx)
			} catch (error) {
				const message = error instanceof Error ? error.message : 'it failed'
				throw new Error(`${file.name} was not applied: ${message}`, {
					cause: error,
				})
			}
			await sql`insert into ultimabase_migrations (name, checksum, applied_at)
				values (${file.name}, ${file.checksum}, now())`.execute(trx)
		})
	}
	await locked(db, async (trx) => store(trx, run.to, 'deploy'))
}

export async function apply(db: Kysely<object>, run: Run): Promise<void> {
	await (run.kind === 'sync' ? sync(db, run) : deploy(db, run))
}
