import type { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../../../../tests/fixtures/postgres-worker-fixture.js'
import { authErrorCodes } from '../../src/index.js'
import { createProbeApplication } from './probe-application.js'
import {
	readProbePath,
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
	fixture = await createPostgresWorkerFixture({ prefix: 'auth_races' })
}, 30_000)
afterAll(async () => {
	await fixture?.dispose()
})

const scenarios: Readonly<Record<string, ProbeScenario>> = {
	'consume-token': async (services, _context, input) =>
		(await services.consumeToken(
			'password-reset',
			readProbePath(input, 'token'),
		)) ?? null,
	'issue-token': (services, _context, input) =>
		services.issueToken({
			email: 'race@example.test',
			expiresInMs: 600_000,
			purpose: 'password-reset',
			userId: readProbeString(readProbeRecord(input), 'userId'),
		}),
}

const settle = async (work: readonly Promise<unknown>[]) => {
	const results = await Promise.allSettled(work)
	return {
		fulfilled: results.flatMap((result) =>
			result.status === 'fulfilled' ? [result.value] : [],
		),
		rejected: results.flatMap((result): unknown[] =>
			result.status === 'rejected' ? [result.reason] : [],
		),
	}
}

describe('concurrent authentication changes', { concurrent: false }, () => {
	it('rotates one session token for exactly one concurrent refresh', async () => {
		const { ProbeUser, signIn, ultimabase } = createProbeApplication(pool(), {
			scenarios,
		})
		await ultimabase.start()
		try {
			const { session } = await signIn('acct|race-refresh')
			const { fulfilled, rejected } = await settle([
				ProbeUser.refresh(session.token),
				ProbeUser.refresh(session.token),
				ProbeUser.refresh(session.token),
			])
			expect(fulfilled).toHaveLength(1)
			expect(rejected).toMatchObject([
				{ code: authErrorCodes.invalidSession },
				{ code: authErrorCodes.invalidSession },
			])
		} finally {
			await ultimabase.dispose()
		}
	})

	it('accepts a token for exactly one concurrent use', async () => {
		const { run, signIn, ultimabase } = createProbeApplication(pool(), {
			scenarios,
		})
		await ultimabase.start()
		try {
			const { user } = await signIn('acct|race-token')
			const token = readProbePath(
				await run('issue-token', { userId: user.id }),
				'token',
			)
			const { fulfilled } = await settle([
				run('consume-token', { token }),
				run('consume-token', { token }),
				run('consume-token', { token }),
			])
			expect(
				fulfilled.filter((claim) => claim !== null).length,
			).toBeLessThanOrEqual(1)
			expect(fulfilled.filter((claim) => claim !== null)).toStrictEqual([
				{ email: 'race@example.test', userId: user.id },
			])
		} finally {
			await ultimabase.dispose()
		}
	})
})
