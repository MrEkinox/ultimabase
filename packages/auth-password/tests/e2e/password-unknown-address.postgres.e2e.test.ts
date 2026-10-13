import { authPlugin, type AuthEventHandlers } from '@ultimabase/auth-plugin'
import { UltimaBase } from '@ultimabase/core'
import { httpPlugin } from '@ultimabase/http-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { waitForAfterCommit } from '@ultimabase/testing/plugins'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../../../../tests/fixtures/postgres-worker-fixture.js'
import { password } from '../../src/index.js'
import { fastPolicy, secret } from './password-fixture.js'

// ADR-0334: without a socket peer and without trustProxy, the client address
// is unknown. Sessions and events record `null`, and attempt limiting applies
// only the per-account limit, as outside HTTP.

let fixture: PostgresWorkerFixture | undefined

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture({ prefix: 'auth_no_address' })
}, 30_000)
afterAll(async () => {
	await fixture?.dispose()
})

const createApplication = () => {
	if (fixture === undefined) throw new TypeError('PostgreSQL is unavailable')
	const events: Readonly<Record<string, unknown>>[] = []
	const record =
		(event: string) =>
		({ address }: Readonly<{ address: string | null }>) => {
			events.push({ address, event })
		}
	const handlers: AuthEventHandlers = {
		afterLogin: record('login'),
		afterLoginFailed: record('login-failed'),
		afterSignUp: record('sign-up'),
	}
	const App = UltimaBase.use(
		postgresPlugin({ pool: fixture.pool, schemaPolicy: 'override' }),
		authPlugin({
			events: handlers,
			methods: [password({ identifier: 'email', policy: fastPolicy })],
		}),
		// No trustProxy: forwarded headers never name the client.
		httpPlugin(),
	)
	const NoAddressUser = App.UserSchema.define({ className: 'NoAddressUser' })
	const ultimabase = new App({ logger: false, schemas: [NoAddressUser] })
	const send = (
		path: string,
		body?: unknown,
		headers: Readonly<Record<string, string>> = {},
	) =>
		ultimabase.plugin(httpPlugin).fetch(
			new Request(`https://api.example.test${path}`, {
				...(body === undefined ? {} : { body: JSON.stringify(body) }),
				headers: {
					'Content-Type': 'application/json',
					'X-Forwarded-For': '198.51.100.1',
					...headers,
				},
				method: 'POST',
			}),
		)
	return { events, send, ultimabase }
}

// Reads one field of an untrusted JSON answer.
const field = (value: unknown, ...keys: readonly string[]): unknown =>
	keys.reduce<unknown>(
		(current, key) =>
			typeof current === 'object' && current !== null
				? Reflect.get(current, key)
				: undefined,
		value,
	)

describe(
	'authentication without a client address',
	{ concurrent: false },
	() => {
		it('records null on sessions and events', async () => {
			const { events, send, ultimabase } = createApplication()
			await ultimabase.start()
			try {
				const signUp = await send('/api/auth/sign-up', {
					email: 'nadia@example.test',
					password: secret,
				})
				expect(signUp.status).toBe(200)
				const credentials = { email: 'nadia@example.test', password: secret }
				expect(
					(
						await send('/api/auth/login', {
							...credentials,
							password: 'wrong password value',
						})
					).status,
				).toBe(401)
				const token = field(
					await (await send('/api/auth/login', credentials)).json(),
					'result',
					'session',
					'token',
				)
				if (typeof token !== 'string') throw new TypeError('No session token')
				const listed = await send('/api/auth/list-sessions', undefined, {
					Authorization: `Bearer ${token}`,
				})
				expect(listed.status).toBe(200)
				expect(field(await listed.json(), 'result', 'sessions')).toMatchObject([
					{ address: null },
					{ address: null },
				])
				await waitForAfterCommit()
				expect(events).toStrictEqual([
					{ address: null, event: 'sign-up' },
					{ address: null, event: 'login-failed' },
					{ address: null, event: 'login' },
				])
			} finally {
				await ultimabase.dispose()
			}
		})

		it('applies only the per-account attempt limit', async () => {
			// A frozen clock keeps the one-second locks from expiring under load.
			vi.useFakeTimers({ now: Date.now(), toFake: ['Date'] })
			const { send, ultimabase } = createApplication()
			await ultimabase.start()
			const login = (value: string) =>
				send('/api/auth/login', { email: 'omar@example.test', password: value })
			try {
				await send('/api/auth/sign-up', {
					email: 'omar@example.test',
					password: secret,
				})
				// Six failures would lock an account and address pair; address-less
				// clients share no pair counter.
				for (let attempt = 0; attempt < 6; attempt += 1) {
					expect((await login('wrong password value')).status).toBe(401)
				}
				expect((await login(secret)).status).toBe(200)
				// The account limit allows 20 failures, then locks.
				for (let attempt = 0; attempt < 21; attempt += 1) {
					expect((await login('wrong password value')).status).toBe(401)
				}
				const locked = await login(secret)
				expect(locked.status).toBe(429)
				expect(locked.headers.get('Retry-After')).toBe('1')
			} finally {
				vi.useRealTimers()
				await ultimabase.dispose()
			}
		})
	},
)
