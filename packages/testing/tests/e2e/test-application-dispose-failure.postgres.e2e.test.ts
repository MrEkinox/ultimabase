import process from 'node:process'

import { UltimaBase } from '@ultimabase/core'
import { testApplication } from '@ultimabase/testing'
import { Pool } from 'pg'
import { afterAll, expect, inject, it } from 'vitest'

import { postgresConnectionUriContextKey } from '../../../../tests/fixtures/postgres-context.js'
import { urlDatabasePlugin } from './fixtures/url-database.js'

// A failed disposal keeps the realm's application slot (Core releases it
// only after a clean disposal), so this case runs in its own file.
const containerUrl = inject(postgresConnectionUriContextKey)
process.env.TEST_DATABASE_URL = containerUrl
const workerSchema = `ultimabase_test_${String(process.env.VITEST_POOL_ID)}`
const admin = new Pool({ connectionString: containerUrl, max: 1 })

afterAll(async () => {
	delete process.env.TEST_DATABASE_URL
	await admin.end()
})

const createApplication = (failDispose?: Error) =>
	new (UltimaBase.use(urlDatabasePlugin({ failDispose }).plugin))({
		logger: false,
		schemas: [],
	})

it('drops the worker schema even when the previous application fails to dispose', async () => {
	const failing = createApplication(new Error('dispose failed'))
	await testApplication(failing)
	const schemas = async () =>
		(
			await admin.query<{ readonly name: string }>(
				'SELECT nspname AS name FROM pg_namespace WHERE nspname = $1',
				[workerSchema],
			)
		).rows
	expect(await schemas()).toHaveLength(1)

	const next = createApplication()
	await expect(testApplication(next)).rejects.toThrow('dispose failed')
	expect(await schemas()).toStrictEqual([])
	// The failure is not swallowed: the realm stays owned by the application
	// that could not release its resources.
	await expect(testApplication(next)).rejects.toThrow(
		'Another UltimaBase application is active',
	)
})
