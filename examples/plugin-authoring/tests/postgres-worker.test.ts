import process from 'node:process'

import { PostgresTestWorker } from '@ultimabase/testing/plugins'
import { Pool } from 'pg'
import { expect, it } from 'vitest'

// `ultimabaseTesting()` gives every worker the test database's URL.
const databaseUrl = process.env.TEST_DATABASE_URL

it('gives the worker its own PostgreSQL schema', async () => {
	const adminPool = new Pool({ connectionString: databaseUrl })
	const worker = new PostgresTestWorker({
		query: async (statement) => {
			await adminPool.query(statement)
		},
		// testApplication uses the default prefix: keep the schemas apart.
		prefix: 'plugin_test',
		workerId: Number(process.env.VITEST_POOL_ID),
	})

	await worker.reset()

	const pool = new Pool({
		connectionString: databaseUrl,
		options: worker.connectionOptions,
	})

	try {
		await pool.query('CREATE TABLE probe (id int)')
		const { rows } = await pool.query<{ schema: string }>(
			'SELECT current_schema() AS schema',
		)
		expect(rows).toStrictEqual([{ schema: worker.schemaName }])
		expect(worker.schemaName).toBe(
			`plugin_test_${String(process.env.VITEST_POOL_ID)}`,
		)
	} finally {
		await pool.end()
		await worker.dispose()
		await adminPool.end()
	}
})
