import type { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../../../../tests/fixtures/postgres-worker-fixture.js'
import { createProbeApplication } from './probe-application.js'
import {
	readProbeRecord,
	readProbeString,
	type ProbeScenario,
} from './probe-method.js'

let fixture: PostgresWorkerFixture | undefined
const pool = (): Pool => {
	if (fixture === undefined) throw new TypeError('PostgreSQL is unavailable')
	return fixture.pool
}

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture({ prefix: 'auth_first_rows' })
}, 30_000)
afterAll(async () => {
	await fixture?.dispose()
})

const scenarios: Readonly<Record<string, ProbeScenario>> = {
	count: async (services, _context, input) => {
		await services.countAttempt({
			address: undefined,
			identifier: readProbeString(readProbeRecord(input), 'identifier'),
			method: 'probe',
		})
		return null
	},
	login: async (services, context, input) => {
		await services.signIn({
			context,
			method: 'probe',
			userId: readProbeString(readProbeRecord(input), 'userId'),
		})
		return null
	},
}

const rejectionsOf = async (work: readonly Promise<unknown>[]) =>
	(await Promise.allSettled(work)).flatMap((result): unknown[] =>
		result.status === 'rejected' ? [result.reason] : [],
	)

// The first row of a key is inserted by whichever request comes first; the
// others hit UNIQUE_VIOLATION, and the retry the code intends then runs in a
// PostgreSQL transaction the failed INSERT already aborted (25P02).
describe('concurrent first rows', { concurrent: false }, () => {
	it('counts concurrent first failures of a subject without failing them', async () => {
		const { run, ultimabase } = createProbeApplication(pool(), { scenarios })
		await ultimabase.start()
		try {
			expect(
				await rejectionsOf(
					Array.from({ length: 4 }, () =>
						run('count', { identifier: 'first-failure' }),
					),
				),
			).toStrictEqual([])
		} finally {
			await ultimabase.dispose()
		}
	})

	it('signs in a user concurrently before their first session', async () => {
		const { auth, run, ultimabase } = createProbeApplication(pool(), {
			scenarios,
		})
		await ultimabase.start()
		try {
			const userId = await auth().createUser({ data: {} })
			expect(
				await rejectionsOf(
					Array.from({ length: 4 }, () => run('login', { userId })),
				),
			).toStrictEqual([])
		} finally {
			await ultimabase.dispose()
		}
	})
})
