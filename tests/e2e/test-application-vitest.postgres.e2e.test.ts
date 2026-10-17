import { execFile } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'

import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'

import { postgresConnectionUriContextKey } from '../fixtures/postgres-context.js'

// ADR-0327 decision 3: `ultimabaseTesting()` starts PostgreSQL once (or uses
// TEST_DATABASE_URL), gives each worker its schema and cleans up. A nested
// Vitest runs a project configured exactly as an application would.
const execFileAsync = promisify(execFile)
const repositoryRoot = path.resolve(import.meta.dirname, '../..')
const project = path.join(import.meta.dirname, 'fixtures/vitest-project')
const containerUrl = inject(postgresConnectionUriContextKey)
// Its own database: the nested workers reuse pool IDs of this run.
const databaseName = `vitest_project_${String(process.env.VITEST_POOL_ID)}`
const admin = new Pool({ connectionString: containerUrl, max: 1 })
const projectUrl = (() => {
	const url = new URL(containerUrl)
	url.pathname = `/${databaseName}`
	return url.href
})()

beforeAll(async () => {
	await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`)
	await admin.query(`CREATE DATABASE "${databaseName}"`)
})

afterAll(async () => {
	try {
		await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`)
	} finally {
		await admin.end()
	}
})

const runProject = (environment: Readonly<Record<string, string>>) => {
	// The nested run chooses its own database and worker slots.
	const inherited = Object.fromEntries(
		Object.entries(process.env).filter(
			([name]) => name !== 'TEST_DATABASE_URL' && name !== 'VITEST_POOL_ID',
		),
	)
	return execFileAsync(
		path.join(repositoryRoot, 'node_modules/.bin/vitest'),
		['run', '--root', project],
		{
			cwd: project,
			env: { ...inherited, ...environment },
			maxBuffer: 4 * 1024 * 1024,
		},
	)
}

describe('ultimabaseTesting()', () => {
	it('uses TEST_DATABASE_URL and drops the worker schemas after the files', async () => {
		const { stdout } = await runProject({ TEST_DATABASE_URL: projectUrl })
		expect(stdout).toContain('5 passed')
		const database = new Pool({ connectionString: projectUrl, max: 1 })
		try {
			const schemas = await database.query(
				`SELECT nspname FROM pg_namespace WHERE nspname LIKE 'ultimabase_test_%'`,
			)
			expect(schemas.rows).toStrictEqual([])
		} finally {
			await database.end()
		}
	}, 120_000)

	it('starts PostgreSQL once without TEST_DATABASE_URL', async () => {
		const { stdout } = await runProject({})
		expect(stdout).toContain('5 passed')
	}, 180_000)
})
