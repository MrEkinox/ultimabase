import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'

import { afterAll, beforeAll, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../../../../tests/fixtures/postgres-worker-fixture.js'

const executeFile = promisify(execFile)
const fixturePath = path.join(
	import.meta.dirname,
	'fixtures/soft-delete-postgres-javascript.mjs',
)
let fixture: PostgresWorkerFixture | undefined

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture({
		prefix: 'soft_delete_no_typegen',
	})
})

afterAll(async () => {
	await fixture?.dispose()
})

it('runs the packed JavaScript plugin against PostgreSQL', async () => {
	if (fixture === undefined) throw new TypeError('PostgreSQL is unavailable')
	const { stdout } = await executeFile(process.execPath, [fixturePath], {
		env: {
			...process.env,
			ULTIMABASE_TEST_DATABASE_URL: fixture.connectionUri,
		},
	})

	const commands = [
		'softDeleteOne',
		'softDeleteMany',
		'restoreOne',
		'restoreMany',
		'purgeOne',
		'purgeMany',
	]
	expect(JSON.parse(stdout)).toStrictEqual({
		// Purge and the Master count; restore no longer needs Master.
		auditCount: 2,
		deletedPlain: false,
		hiddenCommand: 0,
		hiddenLogical: 0,
		purgedCommand: 0,
		restoredCommand: 1,
		surfaces: { command: commands, logical: commands, plain: [] },
	})
}, 30_000)
