import process from 'node:process'

import { UltimaBase } from '@ultimabase/core'
import { testApplication } from '@ultimabase/testing'
import { ultimabaseTesting } from '@ultimabase/testing/vitest'
import { Client } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'

import setupTestDatabase from '../../src/vitest-global-setup.js'
import { urlDatabasePlugin } from './fixtures/url-database.js'

// Without TEST_DATABASE_URL, PostgreSQL comes from a container: one per run
// from ultimabaseTesting()'s global setup, otherwise one per process.
const previousUrl = process.env.TEST_DATABASE_URL
afterAll(() => {
	if (previousUrl === undefined) delete process.env.TEST_DATABASE_URL
	else process.env.TEST_DATABASE_URL = previousUrl
})
const [setupFile] = ultimabaseTesting().setupFiles
if (setupFile === undefined) throw new Error('No Vitest setup file')
await import(/* @vite-ignore */ setupFile)

const readTestDatabaseUrl = (): string | undefined =>
	process.env.TEST_DATABASE_URL

const selectOne = async (url: string): Promise<unknown> => {
	const client = new Client({ connectionString: url })
	await client.connect()
	try {
		return (await client.query<{ readonly one: number }>('SELECT 1 AS one'))
			.rows
	} finally {
		await client.end()
	}
}

describe('test database without TEST_DATABASE_URL', () => {
	it('keeps a configured TEST_DATABASE_URL in the global setup', async () => {
		process.env.TEST_DATABASE_URL = 'postgres://configured.invalid/tests'
		expect(await setupTestDatabase()).toBeUndefined()
		expect(process.env.TEST_DATABASE_URL).toBe(
			'postgres://configured.invalid/tests',
		)
	})

	it('starts one container for the run in the global setup and stops it after', async () => {
		process.env.TEST_DATABASE_URL = ' '
		const teardown = await setupTestDatabase()
		// Read after the setup, which replaces the variable.
		const url = readTestDatabaseUrl() ?? ''
		expect(url).toMatch(/^postgres(ql)?:\/\//u)
		expect(await selectOne(url)).toStrictEqual([{ one: 1 }])
		await teardown?.()
		expect(process.env.TEST_DATABASE_URL).toBeUndefined()
		await expect(selectOne(url)).rejects.toThrow()
	}, 120_000)

	it('starts one container per process for testApplication on first use', async () => {
		delete process.env.TEST_DATABASE_URL
		const first = urlDatabasePlugin()
		await testApplication(
			new (UltimaBase.use(first.plugin))({ logger: false, schemas: [] }),
		)
		const second = urlDatabasePlugin()
		await testApplication(
			new (UltimaBase.use(second.plugin))({ logger: false, schemas: [] }),
		)
		const servers = [first, second].map(({ connections }) => {
			const url = new URL(connections[0]?.url ?? '')
			return url.host
		})
		expect(servers[0]).not.toBe('')
		expect(servers[1]).toBe(servers[0])
		expect(second.connections[0]?.schema).toBe(
			`ultimabase_test_${String(process.env.VITEST_POOL_ID)}`,
		)
	}, 120_000)
})
