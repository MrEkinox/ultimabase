import { PluginError } from '@ultimabase/core'
import type { Pool } from 'pg'
import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	it,
	vi,
} from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../../../../tests/fixtures/postgres-worker-fixture.js'
import {
	authErrorCodes,
	type AttemptSubject,
	type AuthEvents,
	type AuthTokenPurpose,
} from '../../src/index.js'
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
	fixture = await createPostgresWorkerFixture({ prefix: 'auth_tokens' })
}, 30_000)
afterAll(async () => {
	await fixture?.dispose()
})
afterEach(() => {
	vi.useRealTimers()
})

const purposes: readonly AuthTokenPurpose[] = [
	'email-change',
	'email-verification',
	'password-reset',
]
const readPurpose = (
	record: Readonly<Record<string, unknown>>,
): AuthTokenPurpose => {
	const purpose = purposes.find((candidate) => candidate === record.purpose)
	if (purpose === undefined) throw new TypeError('Probe purpose is missing')
	return purpose
}
const readSubject = (input: unknown): AttemptSubject => {
	const record = readProbeRecord(input)
	return {
		address: typeof record.address === 'string' ? record.address : undefined,
		identifier: readProbeString(record, 'identifier'),
		method: 'probe',
	}
}

/** Scenarios standing in for a method's token and attempt handlers. */
const scenarios: Readonly<Record<string, ProbeScenario>> = {
	'cancel-token': async (services, _context, input) => {
		const record = readProbeRecord(input)
		await services.cancelToken(
			readProbeString(record, 'userId'),
			readPurpose(record),
		)
		return null
	},
	check: async (services, _context, input) => {
		await services.checkAttempt(readSubject(input))
		return 'allowed'
	},
	'check-login': async (services, context, input) => {
		try {
			await services.assertAttemptAllowed(readSubject(input), context, (work) =>
				work(),
			)
			return 'allowed'
		} catch (error: unknown) {
			// Returning commits the transaction, so the queued event is delivered.
			if (error instanceof PluginError) return error.toJSON()
			throw error
		}
	},
	'consume-token': async (services, _context, input) => {
		const record = readProbeRecord(input)
		return (
			(await services.consumeToken(readPurpose(record), record.token)) ?? null
		)
	},
	count: async (services, _context, input) => {
		await services.countAttempt(readSubject(input))
		return null
	},
	fail: async (services, context, input) => {
		await services.recordFailedAttempt(readSubject(input), context)
		return null
	},
	'find-token': async (services, _context, input) => {
		const record = readProbeRecord(input)
		return (await services.findToken(readPurpose(record), record.token)) ?? null
	},
	'issue-token': (services, _context, input) => {
		const record = readProbeRecord(input)
		const expiresInMs = record.expiresInMs
		return services.issueToken({
			email: readProbeString(record, 'email'),
			expiresInMs: typeof expiresInMs === 'number' ? expiresInMs : 600_000,
			purpose: readPurpose(record),
			userId: readProbeString(record, 'userId'),
		})
	},
	login: (services, context, input) =>
		services.signIn({
			context,
			method: 'probe',
			subject: readSubject(input),
			userId: readProbeString(readProbeRecord(input), 'userId'),
		}),
	reset: async (services, _context, input) => {
		await services.resetAttempts(readSubject(input))
		return null
	},
}

const readToken = (value: unknown): string => {
	const token = readProbeRecord(value).token
	if (typeof token !== 'string') throw new TypeError('No token was issued')
	return token
}

describe('single-use account tokens', { concurrent: false }, () => {
	it('accepts the current token of one purpose exactly once', async () => {
		const { run, signIn, ultimabase } = createProbeApplication(pool(), {
			scenarios,
		})
		await ultimabase.start()
		try {
			const { user } = await signIn('acct|tokens')
			const issue = (purpose: AuthTokenPurpose, expiresInMs?: number) =>
				run('issue-token', {
					email: 'ada@example.test',
					expiresInMs,
					purpose,
					userId: user.id,
				})
			const find = (purpose: AuthTokenPurpose, token: unknown) =>
				run('find-token', { purpose, token })
			const claim = { email: 'ada@example.test', userId: user.id }

			const first = await issue('password-reset')
			expect(typeof readProbePath(first, 'expiresAt')).toBe('string')
			const firstToken = readToken(first)
			expect(firstToken).toMatch(/^ub_r1\.[\w-]{43}$/u)
			expect(await find('password-reset', firstToken)).toStrictEqual(claim)
			// Each purpose has its own prefix and never accepts another's token.
			expect(await find('email-verification', firstToken)).toBeNull()
			expect(await find('password-reset', 'ub_r1.short')).toBeNull()
			expect(await find('password-reset', 42)).toBeNull()
			expect(await find('password-reset', `ub_r1.${'a'.repeat(43)}`)).toBeNull()

			// A new token of the same purpose replaces the previous one.
			const secondToken = readToken(await issue('password-reset'))
			expect(await find('password-reset', firstToken)).toBeNull()
			const verification = readToken(await issue('email-verification'))
			expect(verification).toMatch(/^ub_v1\./u)
			expect(
				await run('consume-token', {
					purpose: 'password-reset',
					token: secondToken,
				}),
			).toStrictEqual(claim)
			expect(
				await run('consume-token', {
					purpose: 'password-reset',
					token: secondToken,
				}),
			).toBeNull()
			expect(await find('password-reset', secondToken)).toBeNull()
			// Using one purpose's token leaves the others valid.
			expect(await find('email-verification', verification)).toStrictEqual(
				claim,
			)

			await run('cancel-token', {
				purpose: 'email-verification',
				userId: user.id,
			})
			expect(await find('email-verification', verification)).toBeNull()
			await expect(
				run('cancel-token', { purpose: 'email-verification', userId: user.id }),
			).resolves.toBeNull()
			expect(
				await run('consume-token', {
					purpose: 'email-verification',
					token: verification,
				}),
			).toBeNull()
		} finally {
			await ultimabase.dispose()
		}
	})

	it('refuses a token once it expired', async () => {
		const now = Date.parse('2026-10-17T10:00:00.000Z')
		vi.useFakeTimers({ now, toFake: ['Date'] })
		const { run, signIn, ultimabase } = createProbeApplication(pool(), {
			scenarios,
		})
		await ultimabase.start()
		try {
			const { user } = await signIn('acct|token-expiry')
			const issued = await run('issue-token', {
				email: 'bob@example.test',
				expiresInMs: 60_000,
				purpose: 'email-change',
				userId: user.id,
			})
			expect(issued).toMatchObject({
				expiresAt: new Date(now + 60_000).toISOString(),
			})
			const token = readToken(issued)
			vi.setSystemTime(now + 60_000)
			expect(
				await run('find-token', { purpose: 'email-change', token }),
			).toBeNull()
			expect(
				await run('consume-token', { purpose: 'email-change', token }),
			).toBeNull()
		} finally {
			await ultimabase.dispose()
		}
	})
})

describe('attempt limiting', { concurrent: false }, () => {
	it('locks one account and address pair after five failures, doubling the delay', async () => {
		const now = Date.parse('2026-10-17T10:00:00.000Z')
		vi.useFakeTimers({ now, toFake: ['Date'] })
		const failures: AuthEvents['afterLoginFailed'][] = []
		const { run, signIn, ultimabase } = createProbeApplication(pool(), {
			events: {
				afterLoginFailed: (event) => {
					failures.push(event)
				},
			},
			scenarios,
		})
		await ultimabase.start()
		try {
			const attacker = { address: '203.0.113.9', identifier: 'ada' }
			const user = { address: '198.51.100.1', identifier: 'ada' }
			for (let failure = 0; failure < 5; failure += 1) {
				await run('fail', attacker)
			}
			expect(await run('check', attacker)).toBe('allowed')
			await run('fail', attacker)
			const locked = {
				code: authErrorCodes.tooManyAttempts,
				publicDetails: { retryAfterSeconds: 1 },
			}
			await expect(run('check', attacker)).rejects.toMatchObject(locked)
			await run('count', attacker)
			await expect(run('check', attacker)).rejects.toMatchObject({
				publicDetails: { retryAfterSeconds: 2 },
			})
			// Another address of the same account is not slowed down.
			expect(await run('check', user)).toBe('allowed')
			expect(await run('check-login', attacker)).toMatchObject({
				code: authErrorCodes.tooManyAttempts,
				details: { retryAfterSeconds: 2 },
			})
			vi.setSystemTime(now + 2_000)
			expect(await run('check-login', attacker)).toBe('allowed')

			// A success resets the counters of its subject.
			await run('fail', attacker)
			await expect(run('check', attacker)).rejects.toMatchObject({
				code: authErrorCodes.tooManyAttempts,
			})
			const { user: account } = await signIn('acct|attempts')
			await run('login', { ...attacker, userId: account.id })
			expect(await run('check', attacker)).toBe('allowed')
			await run('fail', attacker)
			expect(await run('check', attacker)).toBe('allowed')
			await run('reset', attacker)

			await vi.waitFor(() => {
				expect(failures).toHaveLength(9)
			})
			expect(failures[0]).toMatchObject({
				address: '203.0.113.9',
				identifier: 'ada',
				limited: false,
				method: 'probe',
			})
			expect(failures.filter(({ limited }) => limited)).toHaveLength(1)
		} finally {
			await ultimabase.dispose()
		}
	})

	it('limits an account across every address after twenty failures', async () => {
		const now = Date.parse('2026-10-17T10:00:00.000Z')
		vi.useFakeTimers({ now, toFake: ['Date'] })
		const { run, ultimabase } = createProbeApplication(pool(), { scenarios })
		await ultimabase.start()
		try {
			// Without an address only the account limit applies (ADR-0334).
			const unknown = { identifier: 'bob' }
			for (let failure = 0; failure < 20; failure += 1) {
				await run('count', unknown)
			}
			expect(await run('check', unknown)).toBe('allowed')
			await run('count', unknown)
			const locked = { code: authErrorCodes.tooManyAttempts }
			await expect(run('check', unknown)).rejects.toMatchObject(locked)
			await expect(
				run('check', { address: '198.51.100.2', identifier: 'bob' }),
			).rejects.toMatchObject(locked)
			expect(await run('check', { identifier: 'carol' })).toBe('allowed')
			vi.setSystemTime(now + 1_000)
			expect(await run('check', unknown)).toBe('allowed')
		} finally {
			await ultimabase.dispose()
		}
	})
})
