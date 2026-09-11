import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'

import { afterAll, beforeAll, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from './postgres-worker-fixture.js'

const executeFile = promisify(execFile)
const fixturePath = path.join(
	import.meta.dirname,
	'fixtures/relation-filter-postgres-no-typegen.mjs',
)
let fixture: PostgresWorkerFixture | undefined

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture({
		prefix: 'relation_filter_no_typegen',
	})
})

afterAll(async () => {
	await fixture?.dispose()
})

it('runs source relation filters from packed JavaScript without Typegen', async () => {
	if (fixture === undefined) throw new TypeError('PostgreSQL is unavailable')
	const { stdout } = await executeFile(process.execPath, [fixturePath], {
		env: {
			...process.env,
			ULTIMABASE_TEST_DATABASE_URL: fixture.connectionUri,
		},
	})

	expect(JSON.parse(stdout)).toStrictEqual({
		authenticatedContextual: [
			'authenticated-visible',
			'public-hidden',
			'public-visible',
		],
		anonymousContextual: ['public-hidden', 'public-visible'],
		anonymousStatic: ['authenticated-visible', 'public-visible'],
		included: {
			contextual: ['authenticated-visible', 'public-hidden', 'public-visible'],
			static: ['authenticated-visible', 'public-visible'],
		},
		masterContextual: ['public-hidden', 'public-visible'],
		masterStatic: ['authenticated-visible', 'public-visible'],
	})
}, 30_000)
