// How a PostgreSQL database follows the models (D-105): the snapshot its
// tables match in `ultimabase_schema`, the files `migrate deploy` applied in
// `ultimabase_migrations`, and every change under one advisory lock.
import type { Kysely, Transaction } from 'kysely'
import { sql } from 'kysely'
import type { Migration, Run, Stored } from 'ultimabase'
import { MigrationFailed } from 'ultimabase'
import { id } from './plan.ts'
import { parseSnapshot } from './snapshot.ts'

const tables = ['ultimabase_schema', 'ultimabase_migrations']

const bookkeeping = [
	sql`create table if not exists ultimabase_schema (id integer primary key check (id = 1), snapshot jsonb not null, written_by text not null, written_at timestamptz not null)`,
	sql`create table if not exists ultimabase_migrations (name text primary key, checksum text not null, schema_hash text, applied_at timestamptz not null)`,
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
			typeof item.checksum === 'string' &&
			(!('schema' in item) || typeof item.schema === 'string'),
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
			(select coalesce(json_agg(json_strip_nulls(json_build_object('name', name, 'checksum', checksum, 'schema', schema_hash)) order by name), '[]')
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

/**
 * How long a file waits for a table another query holds: past it, the file
 * fails rather than queue every query on that table behind it.
 */
const lockTimeout = '5s'

/** What to do when the database refuses with `code`, after its reason. */
function hint(code: unknown, transaction: boolean): string {
	if (code === '55P03') {
		return ': another query held a table it changes past lock_timeout'
	}
	if (code !== '25001') return ''
	return transaction
		? ': put it in its own file, whose second line is `-- ultimabase no transaction`'
		: ': a file without a transaction holds one statement: put each in its own file'
}

/** Runs `text`, and names `at` when the database refuses it. */
async function executed(
	db: Kysely<object>,
	text: string,
	at: string,
	transaction = true,
): Promise<void> {
	try {
		await sql.raw(text).execute(db)
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error)
		const code: unknown =
			error instanceof Error ? Reflect.get(error, 'code') : undefined
		throw new MigrationFailed(at, `${reason}${hint(code, transaction)}`)
	}
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
			await executed(trx, statement.sql, statement.sql)
		}
		await store(trx, run.to, 'sync')
	})
}

/** Whether another deploy applied `file` first. */
async function isDone(db: Kysely<object>, file: Migration): Promise<boolean> {
	const { rows } = await sql`
		select 1 from ultimabase_migrations where name = ${file.name}`.execute(db)
	return rows.length > 0
}

const done = (db: Kysely<object>, file: Migration) =>
	sql`insert into ultimabase_migrations (name, checksum, schema_hash, applied_at)
		values (${file.name}, ${file.checksum}, ${file.schema ?? null}, now())`.execute(
		db,
	)

/**
 * Runs a file outside a transaction, under the schema's lock taken for the
 * session. It waits for locks as long as it needs: `create index
 * concurrently` waits for running transactions without blocking any, and
 * one that fails leaves an invalid index.
 */
async function outside(db: Kysely<object>, file: Migration): Promise<void> {
	await db.connection().execute(async (session) => {
		await sql`select pg_advisory_lock(hashtext(current_schema()))`.execute(
			session,
		)
		try {
			for (const statement of bookkeeping) await statement.execute(session)
			if (await isDone(session, file)) return
			await executed(session, file.sql, file.name, false)
			await done(session, file)
		} finally {
			await sql`select pg_advisory_unlock(hashtext(current_schema()))`.execute(
				session,
			)
		}
	})
}

async function deploy(
	db: Kysely<object>,
	run: Extract<Run, { kind: 'deploy' }>,
): Promise<void> {
	for (const file of run.files) {
		if (!file.transaction) {
			await outside(db, file)
			continue
		}
		await locked(db, async (trx) => {
			if (await isDone(trx, file)) return
			// A file may set its own, with `set local lock_timeout`.
			await sql.raw(`set local lock_timeout = '${lockTimeout}'`).execute(trx)
			await executed(trx, file.sql, file.name)
			await done(trx, file)
		})
	}
	await locked(db, async (trx) => store(trx, run.to, 'deploy'))
}

export async function apply(db: Kysely<object>, run: Run): Promise<void> {
	await (run.kind === 'sync' ? sync(db, run) : deploy(db, run))
}

/**
 * Drops every table of the current schema but an extension's, such as
 * PostGIS's `spatial_ref_sys`; returns the models' tables.
 */
export async function reset(db: Kysely<object>): Promise<readonly string[]> {
	const dropped: string[] = []
	await locked(db, async (trx) => {
		const { rows } = await sql<{ table_name: string }>`
			select relname as table_name from pg_class
			where relnamespace = current_schema()::regnamespace
			and relkind in ('r', 'p') and not relispartition
			and not exists (select from pg_depend where classid = 'pg_class'::regclass
				and objid = pg_class.oid and deptype = 'e')
			order by relname`.execute(trx)
		const names = rows.map((row) => row.table_name)
		await sql.raw(`drop table ${names.map(id).join(', ')} cascade`).execute(trx)
		dropped.push(...names.filter((name) => !tables.includes(name)))
	})
	return dropped
}
