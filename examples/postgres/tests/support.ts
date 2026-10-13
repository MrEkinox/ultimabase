import process from 'node:process'

import type { LogLevel, Logger } from '@ultimabase/core'
import { Pool } from 'pg'

/** The server URL `ultimabaseTesting()` provides (a container or yours). */
export const testDatabaseUrl = (): string => {
	const url = process.env.TEST_DATABASE_URL
	if (url === undefined || url === '') {
		throw new TypeError('Run these tests through ultimabaseTesting()')
	}
	return url
}

/** A logger that keeps its lines for assertions. */
export const recordingLogger = () => {
	const lines: { readonly level: LogLevel; readonly message: string }[] = []
	const write = (level: LogLevel) => (message: string) => {
		lines.push({ level, message })
	}
	const logger: Logger = {
		debug: write('debug'),
		info: write('info'),
		warn: write('warn'),
		error: write('error'),
	}
	const messages = (level: LogLevel) =>
		lines.filter((line) => line.level === level).map(({ message }) => message)
	return { logger, messages }
}

/**
 * A PostgreSQL schema of its own for a test that starts applications itself,
 * dropped by `drop()`.
 */
export const openDedicatedSchema = async (name: string) => {
	const admin = new Pool({ connectionString: testDatabaseUrl(), max: 1 })
	await admin.query(`DROP SCHEMA IF EXISTS "${name}" CASCADE`)
	await admin.query(`CREATE SCHEMA "${name}"`)

	//#region search-path
	// Every table of the application lives in the `name` PostgreSQL schema.
	const url = new URL(testDatabaseUrl())
	url.searchParams.set('options', `-c search_path=${name}`)
	//#endregion search-path

	return {
		url: url.href,
		drop: async () => {
			try {
				await admin.query(`DROP SCHEMA IF EXISTS "${name}" CASCADE`)
			} finally {
				await admin.end()
			}
		},
	}
}

const readText = (row: unknown, key: string): string => {
	const value: unknown =
		typeof row === 'object' && row !== null ? Reflect.get(row, key) : undefined
	if (typeof value !== 'string') throw new TypeError(`No ${key} in the row`)
	return value
}

/**
 * Reads the catalog of the schema `testApplication` gives this worker,
 * `ultimabase_test_<worker>`: the physical side of the tables, checked
 * with our own pool outside UltimaBase.
 */
export const openWorkerCatalog = () => {
	const url = new URL(testDatabaseUrl())
	url.searchParams.set(
		'options',
		`-c search_path=ultimabase_test_${String(process.env.VITEST_POOL_ID)}`,
	)
	const pool = new Pool({ connectionString: url.href, max: 1 })

	return {
		/** Column name to its PostgreSQL type, in table order. */
		columns: async (table: string) => {
			const { rows } = await pool.query(
				`SELECT attname AS name, format_type(atttypid, atttypmod) AS type
				FROM pg_attribute
				WHERE attrelid = to_regclass($1) AND attnum > 0 AND NOT attisdropped
				ORDER BY attnum`,
				[`"${table}"`],
			)
			return Object.fromEntries(
				rows.map((row) => [readText(row, 'name'), readText(row, 'type')]),
			)
		},
		/** The `CREATE INDEX` statements of one table. */
		indexes: async (table: string) => {
			const { rows } = await pool.query(
				`SELECT indexdef FROM pg_indexes
				WHERE schemaname = current_schema() AND tablename = $1`,
				[table],
			)
			return rows.map((row) => readText(row, 'indexdef'))
		},
		/** The tables of the worker schema. */
		tables: async () => {
			const { rows } = await pool.query(
				`SELECT tablename FROM pg_tables
				WHERE schemaname = current_schema() ORDER BY tablename`,
			)
			return rows.map((row) => readText(row, 'tablename'))
		},
		[Symbol.asyncDispose]: () => pool.end(),
	}
}
