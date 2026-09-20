import {
	MasterAuthority,
	UltimaBase,
	getCurrentRequest,
	runWithRequestEngine,
	definePlugin,
} from '@ultimabase/core'
import {
	accessPlugin,
	provideAccessContributions,
	schemaAccess,
} from '@ultimabase/access-plugin'
import {
	PasswordUserSchema,
	passwordAuthPlugin,
	passwordAuthOperations,
	passwordPrincipal,
	type PasswordUserReference,
} from '@ultimabase/password-auth-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../../../../tests/fixtures/postgres-worker-fixture.js'

const password = 'correct horse battery staple'
let fixture: PostgresWorkerFixture | undefined
beforeAll(async () => {
	fixture = await createPostgresWorkerFixture({
		prefix: 'password_user_methods',
	})
}, 30_000)
afterAll(async () => {
	await fixture?.dispose()
})

const getFixture = (): PostgresWorkerFixture => {
	if (fixture === undefined)
		throw new TypeError('PostgreSQL fixture is unavailable')
	return fixture
}

const createUser = () =>
	PasswordUserSchema.define({
		className: 'User',
		fields: (field) => ({
			displayName: field.string({ default: 'Ada Lovelace' }),
		}),
	})
const createApplication = (
	User: PasswordUserReference,
	database = getFixture(),
) => {
	let allow = true
	const policy = definePlugin({
		pluginId: 'fixture.password-user-method-policy',
		version: '1.0.0',
		core: '^0.0.0',
		privileges: [
			{
				name: 'runtime:constrain',
				reason: 'Verify required profile reads through static auth methods.',
			},
		],
		capabilities: {
			provides: [
				provideAccessContributions('profile', () => [
					schemaAccess(User, {
						read: {
							allow: ({ context }) =>
								allow &&
								context.access.mode === 'anonymous' &&
								context.getValue(passwordPrincipal) !== undefined,
						},
					}),
				]),
			],
		},
	})
	const ultimabase = new UltimaBase({
		schemas: [],
		pluginPrivileges: { logger: false },
		masterAuthority: new MasterAuthority({
			keys: [{ id: 'test', value: 'server-only-test-key' }],
			onUse: () => undefined,
		}),
		plugins: [
			postgresPlugin({ pool: database.pool, schemaPolicy: 'override' }),
			passwordAuthPlugin({
				user: User,
				password: { memoryCostKiB: 19_456, parallelism: 1, timeCost: 2 },
			}),
			policy,
			accessPlugin({ default: true }),
		],
	})
	return {
		ultimabase,
		setReadable: (value: boolean) => {
			allow = value
		},
	}
}

describe('Password User authentication methods', () => {
	it('requires declared signup fields and keeps login limited to credentials', async () => {
		const User = PasswordUserSchema.define({
			className: 'User',
			fields: (field) => ({
				displayName: field.string({ required: true }),
				locale: field.string({ required: true, default: 'fr' }),
				avatar: field.binary(),
			}),
		})
		const { ultimabase } = createApplication(User)
		await ultimabase.start()
		try {
			const credentials = { username: 'schema-signup', password }
			for (const input of [
				credentials,
				{ ...credentials, displayName: 42 },
				{ ...credentials, displayName: 'Ada', unknownField: true },
			]) {
				await expect(
					ultimabase.operation(passwordAuthOperations.signUp).execute(input),
				).rejects.toMatchObject({ code: 'PASSWORD_AUTH_SIGN_UP_REJECTED' })
			}
			// Reusing the rejected identity proves failed creations left no credential behind.
			const result = await User.signUp(
				{
					...credentials,
					displayName: 'Ada',
					avatar: new Uint8Array([4, 5, 6]),
				},
				{ ultimabase },
			)
			expect(result.user).toMatchObject({
				displayName: 'Ada',
				locale: 'fr',
				avatar: new Uint8Array([4, 5, 6]),
			})
			expect(result.user).not.toHaveProperty('password')
			await expect(
				User.login(credentials, { ultimabase }),
			).resolves.toMatchObject({ user: { id: result.user.id } })
			const extra = { ...credentials, displayName: 'Ada' }
			await expect(
				ultimabase.operation(passwordAuthOperations.login).execute(extra),
			).rejects.toThrow()
		} finally {
			await ultimabase.dispose()
		}
	})

	it('does not install authentication merely by declaring the User class', async () => {
		const User = createUser()
		const ultimabase = new UltimaBase({
			schemas: [User],
			pluginPrivileges: { logger: false },
			plugins: [
				postgresPlugin({ pool: getFixture().pool, schemaPolicy: 'override' }),
			],
		})
		await ultimabase.start()
		try {
			await expect(
				User.signUp({ username: 'uninstalled', password }, { ultimabase }),
			).rejects.toThrow('Unknown application operation')
			await expect(User.logout('token', { ultimabase })).rejects.toThrow()
			await expect(
				User.count(
					{ where: { username: { eq: 'uninstalled' } } },
					{ ultimabase },
				),
			).resolves.toBe(0)
		} finally {
			await ultimabase.dispose()
		}
	})

	it('runs the four methods through built exports with explicit and ambient ownership', async () => {
		const User = createUser()
		const { ultimabase } = createApplication(User)
		await ultimabase.start()
		try {
			const signedUp = await User.signUp(
				{ username: ' Ada ', password },
				{ ultimabase },
			)
			expect(signedUp.user).toBeInstanceOf(User)
			expect(signedUp.user).toMatchObject({
				username: 'ada',
				displayName: 'Ada Lovelace',
			})
			expect(signedUp.principal.user.schema).toBe(User)
			const login = await runWithRequestEngine(
				ultimabase.engine.anonymous({ requestId: 'login', source: 'internal' }),
				() => User.login({ username: 'ADA', password }),
			)
			expect(login.user.id).toBe(signedUp.user.id)
			expect(login.session.token).not.toBe(signedUp.session.token)
			const auth = ultimabase.application.getPlugin(
				'@ultimabase/password-auth-plugin',
			)
			const refreshed = await auth.runWithSession(
				signedUp.session.token,
				async () => {
					const originalRequest = getCurrentRequest()
					const result = await User.refresh(login.session.token)
					// The helper restores the caller's scope after the isolated session operation.
					expect(getCurrentRequest()).toBe(originalRequest)
					return result
				},
			)
			expect(refreshed.session.id).toBe(login.session.id)
			await expect(
				User.refresh(login.session.token, { ultimabase }),
			).rejects.toMatchObject({ code: 'PASSWORD_AUTH_INVALID_SESSION' })
			await expect(
				User.logout(refreshed.session.token, { ultimabase }),
			).resolves.toEqual({ revoked: true })
			await expect(
				User.logout(refreshed.session.token, { ultimabase }),
			).rejects.toMatchObject({ code: 'PASSWORD_AUTH_INVALID_SESSION' })
			await expect(
				auth.runWithSession(signedUp.session.token, () =>
					User.logout(signedUp.session.token),
				),
			).resolves.toEqual({ revoked: true })
			await expect(
				User.login(
					{ username: 'ada', password: 'incorrect password value' },
					{ ultimabase },
				),
			).rejects.toMatchObject({ code: 'PASSWORD_AUTH_INVALID_CREDENTIALS' })
		} finally {
			await ultimabase.dispose()
		}
		await expect(
			User.login({ username: 'ada', password }, { ultimabase }),
		).rejects.toThrow('started UltimaBase')
	})

	it('requires the exact configured User and rejects a foreign active application', async () => {
		const User = createUser()
		const OtherUser = createUser()
		const { ultimabase } = createApplication(User)
		await ultimabase.start()
		const other = new UltimaBase({ schemas: [], plugins: [] })
		try {
			await expect(
				OtherUser.signUp({ username: 'wrong-user', password }, { ultimabase }),
			).rejects.toThrow('not installed')
			await runWithRequestEngine(
				ultimabase.engine.anonymous({
					requestId: 'foreign',
					source: 'internal',
				}),
				async () => {
					await expect(
						User.login(
							{ username: 'wrong-user', password },
							{ ultimabase: other },
						),
					).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
				},
			)
		} finally {
			await Promise.all([ultimabase.dispose(), other.dispose()])
		}
	})

	it('isolates the same class across concurrent applications and rejects foreign tokens', async () => {
		const database = await createPostgresWorkerFixture({
			prefix: 'password_user_foreign',
		})
		const User = createUser()
		const first = createApplication(User).ultimabase
		const second = createApplication(User, database).ultimabase
		await Promise.all([first.start(), second.start()])
		try {
			const [left, right] = await Promise.all(
				[first, second].map((app) =>
					runWithRequestEngine(
						app.engine.anonymous({ requestId: 'parallel', source: 'internal' }),
						() => User.signUp({ username: 'same-name', password }),
					),
				),
			)
			if (left === undefined || right === undefined)
				throw new TypeError('Both application results are required')
			expect(left.user.id).not.toBe(right.user.id)
			await expect(
				User.refresh(left.session.token, { ultimabase: second }),
			).rejects.toMatchObject({ code: 'PASSWORD_AUTH_INVALID_SESSION' })
			await expect(
				User.logout(right.session.token, { ultimabase: first }),
			).rejects.toMatchObject({ code: 'PASSWORD_AUTH_INVALID_SESSION' })
			await expect(
				User.refresh(left.session.token, { ultimabase: first }),
			).resolves.toMatchObject({ user: { id: left.user.id } })
			await expect(
				User.refresh(right.session.token, { ultimabase: second }),
			).resolves.toMatchObject({ user: { id: right.user.id } })
		} finally {
			await Promise.all([first.dispose(), second.dispose()])
			await database.dispose()
		}
	})

	it('preserves required profile rollback for signup, login, and refresh', async () => {
		const User = createUser()
		const app = createApplication(User)
		const options = { ultimabase: app.ultimabase }
		await app.ultimabase.start()
		try {
			const credentials = { username: 'rollback', password }
			app.setReadable(false)
			await expect(User.signUp(credentials, options)).rejects.toMatchObject({
				code: 'PERMISSION_DENIED',
			})
			app.setReadable(true)
			const signedUp = await User.signUp(credentials, options)
			app.setReadable(false)
			await expect(User.login(credentials, options)).rejects.toMatchObject({
				code: 'PERMISSION_DENIED',
			})
			await expect(
				User.refresh(signedUp.session.token, options),
			).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
			app.setReadable(true)
			// A failed rotation leaves the original credential usable.
			await expect(
				User.refresh(signedUp.session.token, options),
			).resolves.toMatchObject({ user: { id: signedUp.user.id } })
		} finally {
			await app.ultimabase.dispose()
		}
	})
})
