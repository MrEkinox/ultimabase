import {
	accessPlugin,
	fieldAccess,
	provideAccessContributions,
	schemaAccess,
} from '@ultimabase/access-plugin'
import {
	FrameworkError,
	MasterAuthority,
	UltimaBase,
	definePlugin,
	requireCapability,
} from '@ultimabase/core'
import {
	httpPlugin,
	httpApplicationCapability,
	type HttpApplication,
} from '@ultimabase/http-plugin'
import {
	PasswordUserSchema,
	passwordAuthOperations,
	passwordAuthPlugin,
	passwordPrincipal,
	passwordSession,
} from '@ultimabase/password-auth-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { restPlugin } from '@ultimabase/rest-plugin'
import { isPlainRecord } from '@ultimabase/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../../../../tests/fixtures/postgres-worker-fixture.js'

const password = 'correct horse battery staple'
let fixture: PostgresWorkerFixture | undefined
beforeAll(async () => {
	fixture = await createPostgresWorkerFixture({ prefix: 'password_profile' })
}, 30_000)
afterAll(async () => {
	await fixture?.dispose()
})

const record = (value: unknown): Readonly<Record<string, unknown>> => {
	if (!isPlainRecord(value)) throw new TypeError('Expected a response object')
	return value
}
const sessionToken = (result: Readonly<Record<string, unknown>>): string => {
	const token = record(result.session).token
	if (typeof token !== 'string') throw new TypeError('Expected a session token')
	return token
}

const createApplication = () => {
	if (fixture === undefined)
		throw new TypeError('Profile fixture is unavailable')
	let mode: 'allow' | 'deny' | 'missing' | 'fail' = 'allow'
	const reads: {
		readonly userId: string | undefined
		readonly version: number | undefined
		readonly authority: string
	}[] = []
	const User = PasswordUserSchema.define({
		className: 'User',
		fields: (field) => ({
			displayName: field.string({ default: 'Initial' }),
			secret: field.string({ default: 'must stay private' }),
			serial: field.bigint({ default: 9_007_199_254_740_993n }),
			avatar: field.binary({ default: new Uint8Array([1, 2, 3]) }),
		}),
	})
	const policy = definePlugin({
		pluginId: 'fixture.password-profile-policy',
		version: '1.0.0',
		core: '^0.0.0',
		privileges: [
			{
				name: 'runtime:constrain',
				reason: 'Verify User profile authorization and rollback.',
			},
		],
		capabilities: {
			provides: [
				provideAccessContributions('profile', () => {
					const secretField = User.persistedFields.secret
					if (secretField === undefined)
						throw new TypeError('Missing fixture secret field')
					return [
						schemaAccess(User, {
							read: {
								allow: ({ context }) => {
									const userId = context.getValue(passwordPrincipal)?.user.id
									const version =
										context.getValue(passwordSession)?.rotationVersion
									reads.push({
										userId,
										version,
										authority: context.access.mode,
									})
									if (mode === 'fail')
										throw new FrameworkError(
											'INTERNAL_ERROR',
											'Profile read failed',
										)
									return (
										mode !== 'deny' &&
										userId !== undefined &&
										version !== undefined
									)
								},
								where: ({ where }) =>
									mode === 'missing'
										? where.eq('id', '01991f00-0000-7000-8000-000000000000')
										: where.ne('id', '01991f00-0000-7000-8000-000000000000'),
							},
						}),
						fieldAccess(User, secretField, ['secret'], { read: false }),
					]
				}),
			],
		},
	})
	let http: HttpApplication | undefined
	const requirement = requireCapability(httpApplicationCapability, '^1.0.0', {
		phase: 'setup',
	})
	const capture = definePlugin({
		pluginId: 'fixture.profile-http',
		version: '1.0.0',
		core: '^0.0.0',
		capabilities: { requires: [requirement] },
		setup: ({ capabilities }) => {
			http = capabilities.get(requirement)
		},
	})
	const fetchRequest = (path: string, init: RequestInit) => {
		if (http === undefined) throw new TypeError('HTTP fixture unavailable')
		const request = new Request(`https://example.test${path}`, init)
		return http.fetch({
			request,
			originalHeaders: [...request.headers.entries()],
		})
	}
	const ultimabase = new UltimaBase({
		masterAuthority: new MasterAuthority({
			keys: [{ id: 'profile', value: 'profile-master' }],
			onUse: () => undefined,
		}),
		pluginPrivileges: { logger: false },
		plugins: [
			postgresPlugin({ pool: fixture.pool, schemaPolicy: 'override' }),
			passwordAuthPlugin({
				user: User,
				password: { memoryCostKiB: 19_456, parallelism: 1, timeCost: 2 },
			}),
			policy,
			accessPlugin({ default: true }),
			httpPlugin({ appId: 'profile', master: { enabled: true } }),
			restPlugin({
				acknowledgeUnverifiedProtection: true,
				operations: Object.values(passwordAuthOperations),
			}),
			capture,
		],
		schemas: [],
	})
	const request = async (
		name: keyof typeof passwordAuthOperations,
		input: unknown,
		token?: string,
		master = false,
	) => {
		const response = await fetchRequest(
			`/api/v1/operations/${passwordAuthOperations[name].name}`,
			{
				method: 'POST',
				body: JSON.stringify({ input }),
				headers: {
					'Content-Type': 'application/json',
					'X-UltimaBase-Application-Id': 'profile',
					...(token === undefined ? {} : { Authorization: `Bearer ${token}` }),
					...(master ? { 'X-UltimaBase-Master-Key': 'profile-master' } : {}),
				},
			},
		)
		const body: unknown = await response.json()
		return { status: response.status, body: record(body) }
	}
	return {
		ultimabase,
		User,
		fetchRequest,
		reads,
		request,
		setMode: (value: typeof mode) => {
			mode = value
		},
	}
}

describe('Password Auth readable profiles', () => {
	it('returns authorized REST profiles for all three transitions, including a fresh refresh profile', async () => {
		const app = createApplication()
		await app.ultimabase.start()
		try {
			const signUp = await app.request(
				'signUp',
				{ username: 'profile-rest', password },
				undefined,
				true,
			)
			expect(signUp.status).toBe(200)
			const created = record(signUp.body.result)
			const user = record(created.user)
			expect(user).toMatchObject({
				username: 'profile-rest',
				displayName: 'Initial',
				serial: '9007199254740993',
				avatar: { type: 'binary', encoding: 'base64', data: 'AQID' },
			})
			expect(user).not.toHaveProperty('secret')
			expect(app.reads.at(-1)).toStrictEqual({
				authority: 'anonymous',
				userId: user.id,
				version: 0,
			})
			const other = await app.request('signUp', {
				username: 'other-user',
				password,
			})
			const login = await app.request(
				'login',
				{ username: 'profile-rest', password },
				sessionToken(record(other.body.result)),
				true,
			)
			expect(login.status).toBe(200)
			expect(record(login.body.result).user).toEqual(user)
			expect(app.reads.at(-1)).toStrictEqual({
				authority: 'anonymous',
				userId: user.id,
				version: 0,
			})
			await app.User.updateOne(
				{
					where: { username: { eq: 'profile-rest' } },
					data: { displayName: 'Updated' },
				},
				{ ultimabase: app.ultimabase, useMasterKey: true },
			)
			const loginToken = sessionToken(record(login.body.result))
			const refresh = await app.request('refresh', null, loginToken, true)
			expect(refresh.status).toBe(200)
			expect(record(refresh.body.result).user).toMatchObject({
				id: user.id,
				displayName: 'Updated',
			})
			expect(record(record(refresh.body.result).user)).not.toHaveProperty(
				'secret',
			)
			expect(app.reads.at(-1)).toStrictEqual({
				authority: 'anonymous',
				userId: user.id,
				version: 1,
			})
			expect(sessionToken(record(refresh.body.result))).not.toBe(loginToken)
			expect((await app.request('refresh', null, loginToken)).status).toBe(401)
			// Returning a supporting User never adds root User CRUD or private data.
			expect(
				(
					await app.fetchRequest('/api/v1/classes/User', {
						headers: { 'X-UltimaBase-Application-Id': 'profile' },
					})
				).status,
			).toBe(404)
			expect(JSON.stringify(signUp.body)).not.toContain('must stay private')
			expect(JSON.stringify(signUp.body)).not.toContain('passwordVerifier')
		} finally {
			await app.ultimabase.dispose()
		}
	})

	it.each(['deny', 'missing'] as const)(
		'keeps sessions usable when the profile is %s',
		async (mode) => {
			const app = createApplication()
			app.setMode(mode)
			await app.ultimabase.start()
			try {
				for (const operation of ['signUp', 'login'] as const) {
					const response = await app.request(operation, {
						username: `profile-${mode}`,
						password,
					})
					expect(response.status).toBe(200)
					expect(record(response.body.result).user).toBeNull()
					const refreshed = await app.request(
						'refresh',
						null,
						sessionToken(record(response.body.result)),
					)
					expect(refreshed.status).toBe(200)
					expect(record(refreshed.body.result).user).toBeNull()
					expect(
						(
							await app.request(
								'logout',
								null,
								sessionToken(record(refreshed.body.result)),
							)
						).body,
					).toEqual({ result: { revoked: true } })
				}
			} finally {
				await app.ultimabase.dispose()
			}
		},
	)

	it('rolls back signup and token rotation on unexpected profile failures', async () => {
		const app = createApplication()
		await app.ultimabase.start()
		try {
			app.setMode('fail')
			expect(
				(
					await app.request('signUp', {
						username: 'rollback-profile',
						password,
					})
				).status,
			).toBe(500)
			app.setMode('allow')
			const created = await app.request('signUp', {
				username: 'rollback-profile',
				password,
			})
			expect(created.status).toBe(200)
			const token = sessionToken(record(created.body.result))
			app.setMode('fail')
			expect((await app.request('refresh', null, token)).status).toBe(500)
			app.setMode('allow')
			expect((await app.request('refresh', null, token)).status).toBe(200)
		} finally {
			await app.ultimabase.dispose()
		}
	})
})
