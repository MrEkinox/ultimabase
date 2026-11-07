// Run as a developer runs it, in a schema of its own on TEST_DATABASE_URL: a
// sync, then a reset from the migrations (D-105).
import { expect, it } from 'vitest'
import {
	development,
	eachInSchema,
	play,
	processes,
	ultimabase,
} from './test/commands.ts'

eachInSchema()

it(
	'syncs a development database, then rebuilds it from the migrations',
	async () => {
		// Logged, so one JSON line here and a readable one in a terminal.
		const synced = await ultimabase('sync', { env: development })
		expect(synced.code).toBe(0)
		expect(synced.output).toContain("Created the database's tables.")
		await play('sync', [0], development)
		// A deploy runs only on a database the migrations built.
		await play('deploy-after-sync', [1], development)
		await play('reset', [0], development)
		// In production, only a deploy changes the tables.
		expect(await ultimabase('sync')).toMatchObject({
			code: 1,
			output:
				'sync changes only a development database: run `npx ultimabase migrate deploy` in production.\n',
		})
		expect(await ultimabase('reset')).toMatchObject({
			code: 1,
			output:
				'reset rebuilds only a development database: it is refused in production.\n',
		})
	},
	processes,
)
