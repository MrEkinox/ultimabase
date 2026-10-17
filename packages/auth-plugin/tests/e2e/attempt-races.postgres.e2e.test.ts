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

/**
 * Makes every update of the attempt table a no-op, so each compare-and-swap
 * of a recorded failure loses as if a concurrent request always won.
 */
const loseEveryAttemptSwap = async (): Promise<() => Promise<void>> => {
	if (fixture === undefined) throw new TypeError('PostgreSQL is unavailable')
	const { schemaName } = fixture
	const { rows } = await pool().query<{ readonly table_name: string }>(
		`SELECT table_name FROM information_schema.columns
		 WHERE table_schema = $1 AND table_name LIKE '_ub_private_%'
		   AND column_name = 'failures'`,
		[schemaName],
	)
	const table = rows[0]?.table_name
	if (rows.length !== 1 || table === undefined) {
		throw new TypeError('The attempt table is not unique')
	}
	const target = `"${schemaName}"."${table}"`
	await pool().query(
		`CREATE FUNCTION "${schemaName}".skip_attempt_update() RETURNS trigger
		 LANGUAGE plpgsql AS 'BEGIN RETURN NULL; END'`,
	)
	await pool().query(
		`CREATE TRIGGER skip_attempt_update BEFORE UPDATE ON ${target}
		 FOR EACH ROW EXECUTE FUNCTION "${schemaName}".skip_attempt_update()`,
	)
	return async () => {
		await pool().query(`DROP TRIGGER skip_attempt_update ON ${target}`)
		await pool().query(`DROP FUNCTION "${schemaName}".skip_attempt_update()`)
	}
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

	// ADR-0345: contention never lets a failure go uncounted.
	it('answers the retryable TRANSACTION_CONFLICT when a failure cannot be recorded', async () => {
		const { run, send, ultimabase } = createProbeApplication(pool(), {
			scenarios,
		})
		await ultimabase.start()
		const input = { identifier: 'always-contended' }
		await run('count', input)
		const restore = await loseEveryAttemptSwap()
		try {
			await expect(run('count', input)).rejects.toMatchObject({
				code: 'TRANSACTION_CONFLICT',
				retryable: true,
			})
			const response = await send('probe', {
				body: { input, scenario: 'count' },
			})
			expect(response.status).toBe(409)
			expect(await response.json()).toMatchObject({
				error: { code: 'TRANSACTION_CONFLICT', retryable: true },
			})
		} finally {
			await restore()
			await ultimabase.dispose()
		}
	})
})
