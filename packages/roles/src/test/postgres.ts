// Each PostgreSQL server the tests run on, and a schema of its own per run
// (D-98).
import { randomUUID } from 'node:crypto'
import { postgres } from '@ultimabase/postgres'
import { Client } from 'pg'
import type { Adapter } from 'ultimabase'

const servers =
	'postgres://postgres:postgres@localhost:54315/postgres postgres://postgres:postgres@localhost:54318/postgres'
/** The servers `TEST_DATABASE_URL` lists, else the two `compose.yaml` runs. */
export const urls = (process.env['TEST_DATABASE_URL'] ?? servers)
	.split(' ')
	.filter((url) => url !== '')

async function run(url: string, statement: string): Promise<void> {
	const client = new Client({ connectionString: url })
	await client.connect()
	try {
		await client.query(statement)
	} finally {
		await client.end()
	}
}

/**
 * `postgres()` in a schema of its own, dropped when it stops; `log` hears
 * each statement.
 */
export function database(url: string, log?: () => void): Adapter {
	const schema = `t_${randomUUID().replaceAll('-', '')}`
	const options = encodeURIComponent(`-c search_path=${schema}`)
	const adapter = postgres({
		url: `${url}?options=${options}`,
		...(log === undefined ? {} : { log }),
	})
	return {
		...adapter,
		start: async (given, logger) => {
			await run(url, `create schema "${schema}"`)
			await adapter.start(given, logger)
		},
		stop: async () => {
			await adapter.stop()
			await run(url, `drop schema "${schema}" cascade`)
		},
	}
}
