// Run as a host runs it, in a schema of its own on TEST_DATABASE_URL: the
// migrations deployed (D-105), then a production start.
import { randomBytes } from 'node:crypto'
import { expect, it } from 'vitest'
import { requestFiles } from '../../../scripts/requests.ts'
import {
	eachInSchema,
	play,
	processes,
	query,
	schema,
	ultimabase,
} from './test/commands.ts'

eachInSchema()

it(
	'deploys the migrations, then serves the application on them',
	async () => {
		// Exits 1 while a deploy has something to do.
		await play('migrate-status', [1])
		await play('migrate-deploy', [0, 0])
		// The index the migration without a transaction built.
		expect(
			await query(
				`select indexname from pg_indexes where schemaname = '${schema}' and tablename = 'task' order by indexname`,
			),
		).toEqual([
			{ indexname: 'task_open_idx' },
			{ indexname: 'task_pkey' },
			{ indexname: 'task_project_id_idx' },
		])

		const started = await ultimabase('start', {
			// `openssl rand -base64 32` gives such a key.
			env: { MASTER_KEY: randomBytes(32).toString('base64') },
			use: async (url) => {
				const { check } = requestFiles(new URL('requests/', import.meta.url), {
					url,
				})
				await check('create-project', {}, { status: 200 })
			},
		})
		// SIGTERM finishes the requests under way, then stops it: it ends
		// with 143, 128 plus SIGTERM's number.
		expect(started.code).toBe(143)
		expect(started.output).toContain('Application stopped.')
	},
	processes,
)
