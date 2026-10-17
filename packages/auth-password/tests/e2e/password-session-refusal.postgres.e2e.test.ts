import { randomUUID } from 'node:crypto'

import { accessPlugin } from '@ultimabase/access-plugin'
import { authPlugin } from '@ultimabase/auth-plugin'
import { MasterAuthority, UltimaBase } from '@ultimabase/core'
import { httpPlugin } from '@ultimabase/http-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { restPlugin } from '@ultimabase/rest-plugin'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../../../../tests/fixtures/postgres-worker-fixture.js'
import { password } from '../../src/index.js'
import { fastPolicy, secret } from './password-fixture.js'

let fixture: PostgresWorkerFixture | undefined

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture({ prefix: 'auth_refusal' })
}, 30_000)
afterAll(async () => {
	await fixture?.dispose()
})

const createApplication = () => {
	if (fixture === undefined) throw new TypeError('PostgreSQL is unavailable')
	const App = UltimaBase.use(
		postgresPlugin({ pool: fixture.pool, schemaPolicy: 'override' }),
		accessPlugin(),
		authPlugin({
			methods: [password({ identifier: 'email', policy: fastPolicy })],
			session: { expiresInMs: 300_000 },
		}),
		httpPlugin({ master: true, trustProxy: 1 }),
		restPlugin(),
	)
	const RefusalUser = App.UserSchema.define({
		className: 'RefusalUser',
	}).with({
		access: {
			read: ({ principal, where }) =>
				where.in('id', principal === undefined ? [] : [principal.id]),
		},
	})
	const ultimabase = new App({
		logger: false,
		masterAuthority: new MasterAuthority({
			keys: [{ id: 'refusal', value: 'server-only-master-key' }],
			onUse: () => undefined,
		}),
		schemas: [RefusalUser],
	})
	const send = async (
		path: string,
		headers: Readonly<Record<string, string>> = {},
		body?: unknown,
	) => {
		const response = await ultimabase.plugin(httpPlugin).fetch(
			new Request(`https://api.example.test${path}`, {
				...(body === undefined ? {} : { body: JSON.stringify(body) }),
				headers: {
					'Content-Type': 'application/json',
					'X-Forwarded-For': '198.51.100.11',
					...headers,
				},
				method: path.startsWith('/api/auth/') ? 'POST' : 'GET',
			}),
		)
		return { body: (await response.json()) as unknown, status: response.status }
	}
	const signUp = async (): Promise<string> => {
		const { body } = await send('/api/auth/sign-up', undefined, {
			email: `ada-${randomUUID()}@example.test`,
			password: secret,
		})
		const token: unknown = Reflect.get(
			Reflect.get(Reflect.get(Object(body), 'result') ?? {}, 'session') ?? {},
			'token',
		)
		if (typeof token !== 'string') throw new TypeError('No session token')
		return token
	}
	return { send, signUp, ultimabase }
}

const routes = ['/api/classes/RefusalUser', '/api/auth/current'] as const
const invalidSession = {
	body: {
		error: {
			code: 'AUTH_INVALID_SESSION',
			message: 'Invalid session.',
			retryable: false,
		},
	},
	status: 401,
}
const applicationRejected = {
	body: { error: { code: 'HTTP_APPLICATION_REJECTED' } },
	status: 401,
}

// ADR-0341 decision 5: a client can tell that it must sign in again.
describe('session refusals over HTTP', { concurrent: false }, () => {
	it('answers AUTH_INVALID_SESSION for a revoked, stale or forged token', async () => {
		const { send, signUp, ultimabase } = createApplication()
		await ultimabase.start()
		try {
			const revoked = await signUp()
			await send('/api/auth/logout', { Authorization: `Bearer ${revoked}` })
			const stale = await signUp()
			await send('/api/auth/refresh', { Authorization: `Bearer ${stale}` })
			const forged = `ub_s1.${'A'.repeat(43)}`
			for (const token of [revoked, stale, forged, 'not-a-token']) {
				for (const path of routes) {
					expect(
						await send(path, { Authorization: `Bearer ${token}` }),
					).toMatchObject(invalidSession)
				}
			}
		} finally {
			await ultimabase.dispose()
		}
	})

	it('answers AUTH_INVALID_SESSION for an expired token', async () => {
		const { send, signUp, ultimabase } = createApplication()
		await ultimabase.start()
		try {
			const token = await signUp()
			vi.useFakeTimers({ now: Date.now() + 6 * 60_000, toFake: ['Date'] })
			for (const path of routes) {
				expect(
					await send(path, { Authorization: `Bearer ${token}` }),
				).toMatchObject(invalidSession)
			}
		} finally {
			vi.useRealTimers()
			await ultimabase.dispose()
		}
	})

	it('keeps HTTP_APPLICATION_REJECTED for a wrong Master key or a malformed header', async () => {
		const { send, ultimabase } = createApplication()
		await ultimabase.start()
		try {
			for (const headers of [
				{ 'X-UltimaBase-Master-Key': 'not-the-master-key' },
				{ Authorization: 'Basic YWRhOnNlY3JldA==' },
			]) {
				for (const path of routes) {
					expect(await send(path, headers)).toMatchObject(applicationRejected)
				}
			}
		} finally {
			await ultimabase.dispose()
		}
	})
})
