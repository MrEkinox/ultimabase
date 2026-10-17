import { PluginError } from '@ultimabase/core'
import type { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../../../../tests/fixtures/postgres-worker-fixture.js'
import {
	browserOrigin,
	cookieName,
	createProbeApplication,
	readResponse,
	type ProbeApplicationOptions,
} from './probe-application.js'
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
	fixture = await createPostgresWorkerFixture({ prefix: 'auth_http' })
}, 30_000)
afterAll(async () => {
	await fixture?.dispose()
})

/** Scenarios standing in for a method's HTTP handlers. */
const scenarios: Readonly<Record<string, ProbeScenario>> = {
	client: (services, context) =>
		Promise.resolve(services.client(context) ?? null),
	crash: () => Promise.reject(new Error('database password leaked here')),
	locked: async (services) => {
		const subject = { address: undefined, identifier: 'locked', method: 'x' }
		for (let failure = 0; failure < 21; failure += 1) {
			await services.countAttempt(subject)
		}
		await services.checkAttempt(subject)
		return null
	},
	login: (services, context, input) =>
		services.signIn({
			context,
			method: 'probe',
			userId: readProbeString(readProbeRecord(input), 'userId'),
		}),
	'no-session': () => Promise.resolve({ user: null }),
	teapot: () =>
		Promise.reject(
			new PluginError('PROBE_TEAPOT', 'The probe is a teapot.', {
				publicMessage: 'I am a teapot.',
			}),
		),
	whoami: (services, context) =>
		Promise.resolve(services.requireAuthenticated(context).userId),
}

const start = async (options: ProbeApplicationOptions = {}) => {
	const application = createProbeApplication(pool(), {
		scenarios,
		...options,
	})
	await application.ultimabase.start()
	return application
}

const errorBody = (code: string) => ({ body: { error: { code } } })
const rejectedRequest = {
	...errorBody('HTTP_APPLICATION_REJECTED'),
	status: 401,
}
const invalidSession = { ...errorBody('AUTH_INVALID_SESSION'), status: 401 }

describe('the Bearer HTTP transport', { concurrent: false }, () => {
	it('serves sessions to Bearer clients and records their client', async () => {
		const { send, signIn, ultimabase } = await start()
		try {
			const { user } = await signIn('acct|bearer')
			const response = await send('probe-session', {
				body: { input: { userId: user.id }, scenario: 'login' },
				headers: { 'User-Agent': 'u'.repeat(300) },
			})
			expect(response.headers.has('Set-Cookie')).toBe(false)
			const login = await readResponse(response)
			expect(login).toMatchObject({
				body: { result: { user: { id: user.id } } },
				status: 200,
			})
			const token = readProbeString(
				readProbeRecord(
					readProbeRecord(readProbeRecord(login.body).result).session,
				),
				'token',
			)
			const bearer = { Authorization: `Bearer ${token}` }
			expect(
				await readResponse(await send('current', { headers: bearer })),
			).toMatchObject({ body: { result: { id: user.id } }, status: 200 })
			expect(
				await readResponse(
					await send('probe', {
						body: { scenario: 'client' },
						headers: { 'User-Agent': 'probe-agent' },
					}),
				),
			).toMatchObject({
				body: {
					result: { address: '198.51.100.7', userAgent: 'probe-agent' },
				},
			})
			const { body } = await readResponse(
				await send('list-sessions', { headers: bearer }),
			)
			const sessions = readProbeRecord(readProbeRecord(body).result).sessions
			expect(sessions).toMatchObject([
				{ address: '198.51.100.7', current: true, method: 'probe' },
				{ address: null, current: false, method: 'fake' },
			])
			expect(sessions).toMatchObject([{ device: 'u'.repeat(256) }, {}])

			const logout = await send('logout', { headers: bearer })
			expect(logout.headers.has('Set-Cookie')).toBe(false)
			expect(await readResponse(logout)).toMatchObject({
				body: { result: { revoked: true } },
				status: 200,
			})
			expect(
				await readResponse(await send('current', { headers: bearer })),
			).toMatchObject(invalidSession)
		} finally {
			await ultimabase.dispose()
		}
	})

	it('refuses malformed credentials and bodies before any operation', async () => {
		const { send, signIn, ultimabase } = await start()
		try {
			const { session } = await signIn('acct|malformed')
			const bearer = { Authorization: `Bearer ${session.token}` }
			expect(
				await readResponse(
					await send('current', { headers: { Authorization: 'Basic abc' } }),
				),
			).toMatchObject(rejectedRequest)
			for (const token of ['nope', `ub_s1.${'a'.repeat(43)}`]) {
				expect(
					await readResponse(
						await send('current', {
							headers: { Authorization: `Bearer ${token}` },
						}),
					),
				).toMatchObject(invalidSession)
			}
			expect(await readResponse(await send('current'))).toMatchObject(
				invalidSession,
			)
			// Without cookie mode, a cookie is not a credential.
			expect(
				await readResponse(
					await send('current', {
						headers: { Cookie: `${cookieName}=${session.token}` },
					}),
				),
			).toMatchObject(invalidSession)
			const invalidRequest = {
				body: {
					error: {
						code: 'AUTH_INVALID_REQUEST',
						message: 'The request body is invalid.',
					},
				},
				status: 400,
			}
			for (const request of [{ rawBody: '{' }, { body: { id: 1 } }]) {
				expect(
					await readResponse(
						await send('revoke-session', { ...request, headers: bearer }),
					),
				).toMatchObject(invalidRequest)
			}
			expect(
				await readResponse(
					await send('revoke-session', {
						body: { id: '0199325a-0c00-7000-8000-000000000000' },
						headers: bearer,
					}),
				),
			).toMatchObject({ ...errorBody('AUTH_NOT_FOUND'), status: 404 })
		} finally {
			await ultimabase.dispose()
		}
	})

	it('maps declared failures to their status and hides every other error', async () => {
		const { send, ultimabase } = await start()
		try {
			const teapot = await readResponse(
				await send('probe', { body: { scenario: 'teapot' } }),
			)
			expect(teapot).toMatchObject({
				body: { error: { code: 'PROBE_TEAPOT', message: 'I am a teapot.' } },
				status: 418,
			})
			// Every failure names its request for log correlation.
			expect(typeof readProbePath(teapot.body, 'error', 'requestId')).toBe(
				'string',
			)
			const internal = {
				body: {
					error: {
						code: 'AUTH_INTERNAL_ERROR',
						message: 'The authentication request could not be completed.',
						retryable: false,
					},
				},
				status: 500,
			}
			const crash = await readResponse(
				await send('probe', { body: { scenario: 'crash' } }),
			)
			expect(crash).toMatchObject(internal)
			expect(JSON.stringify(crash.body)).not.toContain('password')
			expect(
				await readResponse(
					await send('probe-session', { body: { scenario: 'no-session' } }),
				),
			).toMatchObject(internal)
			const locked = await send('probe', { body: { scenario: 'locked' } })
			expect(locked.headers.get('Retry-After')).toBe('1')
			expect(await readResponse(locked)).toMatchObject({
				body: {
					error: {
						code: 'AUTH_TOO_MANY_ATTEMPTS',
						details: { retryAfterSeconds: 1 },
					},
				},
				status: 429,
			})
		} finally {
			await ultimabase.dispose()
		}
	})
})

describe('the session cookie', { concurrent: false }, () => {
	const browser = { Origin: browserOrigin }
	const readCookie = (response: Response): string => {
		const header = response.headers.get('Set-Cookie') ?? ''
		return header.slice(0, header.indexOf(';'))
	}

	it('answers browsers with a secure cookie and other clients with the token', async () => {
		const { send, signIn, ultimabase } = await start({ cookie: true })
		try {
			const { user } = await signIn('acct|cookie')
			const login = (headers: Readonly<Record<string, string>>) =>
				send('probe-session', {
					body: { input: { userId: user.id }, scenario: 'login' },
					headers,
				})
			const server = await login({})
			expect(server.headers.has('Set-Cookie')).toBe(false)
			expect(JSON.stringify((await readResponse(server)).body)).toContain(
				'ub_s1.',
			)
			const signedIn = await login(browser)
			expect(signedIn.headers.get('Set-Cookie')).toMatch(
				new RegExp(
					`^${cookieName}=ub_s1\\.[\\w-]{43}; Path=/; Expires=.+ GMT; HttpOnly; Secure; SameSite=Lax$`,
					'u',
				),
			)
			const body = await readResponse(signedIn)
			expect(body).toMatchObject({
				status: 200,
			})
			expect(typeof readProbePath(body.body, 'result', 'session', 'id')).toBe(
				'string',
			)
			expect(JSON.stringify(body.body)).not.toContain('ub_s1.')
			const cookie = readCookie(signedIn)

			const asBrowser = (path: string, headers = {}) =>
				send(path, { headers: { ...browser, Cookie: cookie, ...headers } })
			expect(
				await readResponse(
					await asBrowser('current', { Cookie: `theme=dark; ${cookie}` }),
				),
			).toMatchObject({ body: { result: { id: user.id } }, status: 200 })
			const refreshed = await asBrowser('refresh')
			expect(refreshed.status).toBe(200)
			const next = readCookie(refreshed)
			expect(next).not.toBe(cookie)
			expect(await readResponse(await asBrowser('current'))).toMatchObject(
				invalidSession,
			)
			const logout = await send('logout', {
				headers: { ...browser, Cookie: next },
			})
			expect(logout.status).toBe(200)
			expect(logout.headers.get('Set-Cookie')).toBe(
				`${cookieName}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
			)
		} finally {
			await ultimabase.dispose()
		}
	})

	it('requires an allowed Origin and one unambiguous credential', async () => {
		const { send, signIn, ultimabase } = await start({ cookie: true })
		try {
			const { session, user } = await signIn('acct|cookie-proof')
			const cookie = `${cookieName}=${session.token}`
			const refused = async (
				path: string,
				headers: Readonly<Record<string, string>>,
			) => readResponse(await send(path, { headers }))
			// A browser's authentication request comes from an allowed origin.
			for (const headers of [
				{ Origin: 'https://attacker.example' },
				{ Origin: 'null' },
				{ 'Content-Type': 'text/plain', Origin: browserOrigin },
			]) {
				expect(await refused('current', headers)).toMatchObject(rejectedRequest)
			}
			// An unsafe request the cookie authenticates must prove its origin.
			expect(await refused('current', { Cookie: cookie })).toMatchObject(
				rejectedRequest,
			)
			for (const headers of [
				{ Authorization: `Bearer ${session.token}`, Cookie: cookie },
				{ Cookie: `${cookie}; ${cookieName}=${session.token}` },
				{ Cookie: `${cookieName}; theme=dark` },
			]) {
				expect(
					await refused('current', { ...browser, ...headers }),
				).toMatchObject(rejectedRequest)
			}
			expect(
				await refused('current', { ...browser, Cookie: `${cookieName}=stale` }),
			).toMatchObject(invalidSession)
			// Bearer stays usable without Origin in cookie mode.
			expect(
				await refused('current', { Authorization: `Bearer ${session.token}` }),
			).toMatchObject({ body: { result: { id: user.id } }, status: 200 })

			// A stale cookie never blocks signing in or anonymous recovery.
			const stale = { ...browser, Cookie: `${cookieName}=stale` }
			expect(
				(
					await send('probe-session', {
						body: { input: { userId: user.id }, scenario: 'login' },
						headers: stale,
					})
				).status,
			).toBe(200)
			expect(
				await readResponse(
					await send('probe-recover', {
						body: { scenario: 'client' },
						headers: stale,
					}),
				),
			).toMatchObject({ body: { result: { address: '198.51.100.7' } } })
			expect(
				await readResponse(
					await send('probe', { body: { scenario: 'whoami' }, headers: stale }),
				),
			).toMatchObject(invalidSession)
		} finally {
			await ultimabase.dispose()
		}
	})

	it('sets the configured SameSite attribute', async () => {
		const { send, signIn, ultimabase } = await start({
			cookie: true,
			cookieSameSite: 'strict',
		})
		try {
			const { user } = await signIn('acct|strict')
			const response = await send('probe-session', {
				body: { input: { userId: user.id }, scenario: 'login' },
				headers: browser,
			})
			expect(response.headers.get('Set-Cookie')).toMatch(/; SameSite=Strict$/u)
		} finally {
			await ultimabase.dispose()
		}
	})

	it('refuses to start without a credentialed browser policy', async () => {
		const { ultimabase } = createProbeApplication(pool(), {
			cookie: true,
			credentials: false,
			scenarios,
		})
		try {
			await expect(ultimabase.start()).rejects.toThrow(
				'authPlugin cookie mode requires credentialed exact origins',
			)
		} finally {
			await ultimabase.dispose()
		}
	})
})
