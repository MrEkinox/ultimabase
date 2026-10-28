// A test file's own schema (D-137): the connections' `search_path`, its
// tables emptied at each start, and dropped after the file's last test.
import { randomBytes } from 'node:crypto'
import type { Kysely } from 'kysely'
import { sql } from 'kysely'
import type { PoolConfig } from 'pg'
import { Client } from 'pg'
import { parseIntoClientConfig } from 'pg-connection-string'
import { tables, tablesOf } from './migrations.ts'
import { id } from './plan-parts.ts'

/** A new test schema's name. */
export const scratchName = (): string =>
	`ultimabase_test_${randomBytes(4).toString('hex')}`

/**
 * The connections to `url`, in `schema` when one is given, then in the
 * schemas of the extensions its tables use (D-141).
 */
export function connecting(
	url: string,
	schema: string | undefined,
	extensions: readonly string[] = [],
): PoolConfig {
	if (schema === undefined) return { connectionString: url }
	const config = parseIntoClientConfig(url)
	// After the url's own options: a `search_path` it sets loses.
	const path = [schema, ...extensions].join(',')
	const options = [config.options, `-c search_path=${path}`]
		.filter(Boolean)
		.join(' ')
	return { ...config, options }
}

/**
 * Creates `schema`, or empties the tables in it, once the connections are
 * known to use it and nothing else.
 */
export async function emptied(
	db: Kysely<object>,
	schema: string,
): Promise<void> {
	await sql`create schema if not exists ${sql.id(schema)}`.execute(db)
	const { rows } = await sql<{
		current: string | null
	}>`select current_schema() as current`.execute(db)
	if (rows[0]?.current !== schema) {
		throw new Error(
			`The connections did not take ${schema} as their search_path: does a pooler drop their startup options?`,
		)
	}
	const names = (await tablesOf(db)).filter((name) => !tables.includes(name))
	if (names.length === 0) return
	await sql.raw(`truncate ${names.map(id).join(', ')} cascade`).execute(db)
}

/**
 * Installs pg_trgm where a migration would, in the first schema of the
 * url's own `search_path`, and answers that schema (D-141).
 */
export async function trigrams(url: string): Promise<string> {
	const client = new Client({ connectionString: url })
	await client.connect()
	try {
		await client
			.query('create extension if not exists pg_trgm')
			.catch((error: unknown) => {
				// Another test file created it at the same time.
				const code: unknown = Reflect.get(Object(error), 'code')
				if (code !== '23505' && code !== '42710') throw error
			})
		const { rows } = await client.query<{ schema: string }>(
			`select n.nspname as schema from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pg_trgm'`,
		)
		const [row] = rows
		if (row === undefined) throw new Error('pg_trgm is not installed.')
		return row.schema
	} finally {
		await client.end()
	}
}

/** Drops `schema` and its tables. */
export async function dropped(url: string, schema: string): Promise<void> {
	const client = new Client({ connectionString: url })
	await client.connect()
	try {
		await client.query(`drop schema if exists ${id(schema)} cascade`)
	} finally {
		await client.end()
	}
}
