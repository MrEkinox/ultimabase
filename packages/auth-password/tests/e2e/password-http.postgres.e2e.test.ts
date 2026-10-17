import { authPlugin } from '@ultimabase/auth-plugin'
import { UltimaBase } from '@ultimabase/core'
import { httpPlugin } from '@ultimabase/http-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import type { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../../../../tests/fixtures/postgres-worker-fixture.js'
import { password } from '../../src/index.js'
import { fastPolicy, secret } from './password-fixture.js'

const origin = 'https://client.example'
const cookieName = '__Host-todo-session'
let fixture: PostgresWorkerFixture | undefined
const pool = () => {
	if (fixture === undefined) throw new TypeError('PostgreSQL is unavailable')
	return fixture.pool
}

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture({ prefix: 'auth_http' })
}, 30_000)
afterAll(async () => {
	await fixture?.dispose()
})

const createHttpApplication = (database: Pool, cookie: boolean) => {
	const App = UltimaBase.use(
		postgresPlugin({ pool: database, schemaPolicy: 'override' }),
		authPlugin({
			methods: [password({ identifier: 'email', policy: fastPolicy })],
			...(cookie ? { http: { cookie: { name: cookieName } } } : {}),
		}),
		httpPlugin({
			// `fetch()` has no socket: one proxy hop makes X-Forwarded-For the client.
			trustProxy: 1,
			...(cookie ? { browser: { origins: [origin], credentials: true } } : {}),
		}),
	)
	const HttpUser = App.UserSchema.define({ className: 'HttpUser' })
	const ultimabase = new App({ logger: false, schemas: [HttpUser] })
	const send = (
		path: string,
		options: Readonly<{
			body?: unknown
			headers?: Readonly<Record<string, string>>
		}> = {},
	) =>
		ultimabase.plugin(httpPlugin).fetch(
			new Request(`https://api.example.test${path}`, {
				...(options.body === undefined
					? {}
					: { body: JSON.stringify(options.body) }),
				headers: {
					'Content-Type': 'application/json',
					'X-Forwarded-For': '198.51.100.1',
					...options.headers,
				},
				method: 'POST',
			}),
		)
	return { send, ultimabase }
}

const json = async (response: Response): Promise<Record<string, unknown>> =>
	(await response.json()) as Record<string, unknown>

describe(
	'authentication routes under one prefix',
	{ concurrent: false },
	() => {
		it('serves Bearer sessions with the token in the body', async () => {
			const { send, ultimabase } = createHttpApplication(pool(), false)
			await ultimabase.start()
			try {
				const signUp = await send('/api/auth/sign-up', {
					body: { email: 'ada@example.test', password: secret },
				})
				expect(signUp.status).toBe(200)
				const { result } = (await json(signUp)) as {
					result: { session: { token: string }; user: { email: string } }
				}
				expect(result.user.email).toBe('ada@example.test')
				const bearer = { Authorization: `Bearer ${result.session.token}` }
				const current = await send('/api/auth/current', { headers: bearer })
				expect(await json(current)).toMatchObject({
					result: { email: 'ada@example.test' },
				})
				const refreshed = await send('/api/auth/refresh', { headers: bearer })
				expect(refreshed.status).toBe(200)
				expect(refreshed.headers.has('Set-Cookie')).toBe(false)
				const stale = await send('/api/auth/current', { headers: bearer })
				expect(stale.status).toBe(401)
				expect(await json(stale)).toMatchObject({
					error: { code: 'AUTH_INVALID_SESSION' },
				})
				const malformed = await ultimabase.plugin(httpPlugin).fetch(
					new Request('https://api.example.test/api/auth/login', {
						body: '{',
						headers: { 'Content-Type': 'application/json' },
						method: 'POST',
					}),
				)
				expect(malformed.status).toBe(400)
				expect(await json(malformed)).toMatchObject({
					error: { code: 'AUTH_INVALID_REQUEST' },
				})
			} finally {
				await ultimabase.dispose()
			}
		})

		it('answers browsers with the cookie, on the same routes', async () => {
			const { send, ultimabase } = createHttpApplication(pool(), true)
			await ultimabase.start()
			try {
				const browser = { Origin: origin }
				const foreign = await send('/api/auth/sign-up', {
					body: { email: 'bob@example.test', password: secret },
					headers: { Origin: 'https://attacker.example' },
				})
				expect(foreign.status).toBe(401)
				// A client without `Origin` is not a browser: it keeps Bearer.
				const server = await send('/api/auth/sign-up', {
					body: { email: 'server@example.test', password: secret },
				})
				expect(server.status).toBe(200)
				expect(server.headers.has('Set-Cookie')).toBe(false)
				expect(JSON.stringify(await json(server))).toContain('ub_s1.')
				const signUp = await send('/api/auth/sign-up', {
					body: { email: 'bob@example.test', password: secret },
					headers: browser,
				})
				expect(signUp.status).toBe(200)
				const setCookie = signUp.headers.get('Set-Cookie') ?? ''
				expect(setCookie).toMatch(
					new RegExp(
						`^${cookieName}=ub_s1\\.[A-Za-z0-9_-]{43}; Path=/; Expires=.+; HttpOnly; Secure; SameSite=Lax$`,
						'u',
					),
				)
				const body = await json(signUp)
				expect(JSON.stringify(body)).not.toContain('ub_s1.')
				const cookie = setCookie.slice(0, setCookie.indexOf(';'))
				const current = await send('/api/auth/current', {
					headers: { ...browser, Cookie: cookie },
				})
				expect(await json(current)).toMatchObject({
					result: { email: 'bob@example.test' },
				})
				const ambiguous = await send('/api/auth/current', {
					headers: {
						...browser,
						Authorization: `Bearer ${cookie.slice(cookieName.length + 1)}`,
						Cookie: cookie,
					},
				})
				expect(ambiguous.status).toBe(401)
				// A stale cookie never blocks logging in again.
				const login = await send('/api/auth/login', {
					body: { email: 'bob@example.test', password: secret },
					headers: { ...browser, Cookie: `${cookieName}=stale` },
				})
				expect(login.status).toBe(200)
				const logout = await send('/api/auth/logout', {
					headers: { ...browser, Cookie: cookie },
				})
				expect(logout.status).toBe(200)
				expect(logout.headers.get('Set-Cookie')).toContain('Max-Age=0')
				const after = await send('/api/auth/current', {
					headers: { ...browser, Cookie: cookie },
				})
				expect(after.status).toBe(401)
			} finally {
				await ultimabase.dispose()
			}
		})

		it('limits attempts per account and address, then per account, across application instances', async () => {
			// A frozen clock keeps the one-second locks from expiring under load.
			vi.useFakeTimers({ now: Date.now(), toFake: ['Date'] })
			const first = createHttpApplication(pool(), false)
			await first.ultimabase.start()
			const login = (
				application: ReturnType<typeof createHttpApplication>,
				address: string,
				value: string,
			) =>
				application.send('/api/auth/login', {
					body: { email: 'carol@example.test', password: value },
					headers: { 'X-Forwarded-For': address },
				})
			try {
				await first.send('/api/auth/sign-up', {
					body: { email: 'carol@example.test', password: secret },
				})
				for (let attempt = 0; attempt < 6; attempt += 1) {
					expect(
						(await login(first, '203.0.113.1', 'wrong password value')).status,
					).toBe(401)
				}
				const locked = await login(first, '203.0.113.1', secret)
				expect(locked.status).toBe(429)
				expect(locked.headers.get('Retry-After')).toBe('1')
				expect(await json(locked)).toMatchObject({
					error: { code: 'AUTH_TOO_MANY_ATTEMPTS' },
				})
			} catch (error: unknown) {
				vi.useRealTimers()
				throw error
			} finally {
				await first.ultimabase.dispose()
			}
			// Another server shares the counters; another address is not locked.
			const second = createHttpApplication(pool(), false)
			await second.ultimabase.start()
			try {
				expect((await login(second, '203.0.113.1', secret)).status).toBe(429)
				expect((await login(second, '203.0.113.2', secret)).status).toBe(200)
				// Success reset the account; distributed failures lock it again.
				for (let attempt = 0; attempt < 21; attempt += 1) {
					expect(
						(
							await login(
								second,
								`192.0.2.${String(attempt)}`,
								'wrong password value',
							)
						).status,
					).toBe(401)
				}
				expect((await login(second, '192.0.2.200', secret)).status).toBe(429)
			} finally {
				vi.useRealTimers()
				await second.ultimabase.dispose()
			}
		})
	},
)
