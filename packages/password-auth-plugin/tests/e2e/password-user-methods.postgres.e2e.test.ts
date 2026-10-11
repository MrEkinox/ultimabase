import {
	MasterAuthority,
	UltimaBase,
	getCurrentRequest,
	runWithRequestEngine,
	plugin,
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
import { anonymous } from '@ultimabase/core/plugin'

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
	PasswordUserSchema.define(UltimaBase.Schema, {
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
	const policy = plugin({
		id: 'fixture.password-user-method-policy',
		version: '1.0.0',
		core: '^0.0.0',
		permissions: {
			'runtime:constrain':
				'Verify required profile reads through static auth methods.',
		},
		contributions: [
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
	})
	const ultimabase = new (UltimaBase.use(
		postgresPlugin({ pool: database.pool, schemaPolicy: 'override' }),
		passwordAuthPlugin({
			user: User,
			password: { memoryCostKiB: 19_456, parallelism: 1, timeCost: 2 },
		}),
		policy,
		accessPlugin({ default: true }),
	))({
		schemas: [User],
		logger: false,
		masterAuthority: new MasterAuthority({
			keys: [{ id: 'test', value: 'server-only-test-key' }],
			onUse: () => undefined,
		}),
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
			const result = await User.signUp({
				...credentials,
				displayName: 'Ada',
				avatar: new Uint8Array([4, 5, 6]),
			})
			expect(result.user).toMatchObject({
				displayName: 'Ada',
				locale: 'fr',
				avatar: new Uint8Array([4, 5, 6]),
			})
			expect(result.user).not.toHaveProperty('password')
			await expect(
				User.exists(
					{ where: { id: { eq: result.user.id } } },
					{ useMasterKey: true },
				),
			).resolves.toBe(true)
			await expect(User.login(credentials)).resolves.toMatchObject({
				user: { id: result.user.id },
			})
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
		const ultimabase = new (UltimaBase.use(
			postgresPlugin({ pool: getFixture().pool, schemaPolicy: 'override' }),
		))({ schemas: [User], logger: false })
		await ultimabase.start()
		try {
			await expect(
				User.signUp({ username: 'uninstalled', password }),
			).rejects.toThrow('Unknown application operation')
			await expect(User.logout('token')).rejects.toThrow()
			await expect(
				User.count({ where: { username: { eq: 'uninstalled' } } }),
			).resolves.toBe(0)
		} finally {
			await ultimabase.dispose()
		}
	})

	it('runs authentication through direct and request-local ownership', async () => {
		const User = createUser()
		const { ultimabase } = createApplication(User)
		await ultimabase.start()
		try {
			const signedUp = await User.signUp({ username: ' Ada ', password })
			expect(Object.getPrototypeOf(signedUp.user)).toBe(Object.prototype)
			expect(signedUp.user).toMatchObject({
				username: 'ada',
				displayName: 'Ada Lovelace',
			})
			expect(signedUp.principal.user.schema).toBe(User)
			const login = await runWithRequestEngine(
				anonymous(ultimabase, { requestId: 'login', source: 'internal' }),
				() => User.login({ username: 'ADA', password }),
			)
			expect(login.user.id).toBe(signedUp.user.id)
			expect(login.session.token).not.toBe(signedUp.session.token)
			const auth = ultimabase.plugin('@ultimabase/password-auth-plugin')
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
			await expect(User.refresh(login.session.token)).rejects.toMatchObject({
				code: 'PASSWORD_AUTH_INVALID_SESSION',
			})
			await expect(User.logout(refreshed.session.token)).resolves.toEqual({
				revoked: true,
			})
			await expect(User.logout(refreshed.session.token)).rejects.toMatchObject({
				code: 'PASSWORD_AUTH_INVALID_SESSION',
			})
			await expect(
				auth.runWithSession(signedUp.session.token, () =>
					User.logout(signedUp.session.token),
				),
			).resolves.toEqual({ revoked: true })
			await expect(
				User.login({ username: 'ada', password: 'incorrect password value' }),
			).rejects.toMatchObject({ code: 'PASSWORD_AUTH_INVALID_CREDENTIALS' })
		} finally {
			await ultimabase.dispose()
		}
		await expect(
			User.login({ username: 'ada', password }),
		).rejects.toMatchObject({ code: 'MISSING_EXECUTION_CONTEXT' })
	})

	it('reads the current User, changes its password, and revokes account sessions', async () => {
		const User = createUser()
		const { ultimabase } = createApplication(User)
		await ultimabase.start()
		try {
			const signedUp = await User.signUp({
				username: 'account-security',
				password,
			})
			const current = await User.login({
				username: 'account-security',
				password,
			})
			const other = await User.login({ username: 'account-security', password })
			const auth = ultimabase.plugin('@ultimabase/password-auth-plugin')
			await expect(User.current()).rejects.toMatchObject({
				code: 'PASSWORD_AUTH_INVALID_SESSION',
			})
			await auth.runWithSession(current.session.token, async () => {
				await expect(User.current()).resolves.toMatchObject({
					id: signedUp.user.id,
					username: 'account-security',
				})
				await expect(
					User.changePassword({
						currentPassword: 'incorrect password value',
						newPassword: 'replacement password value',
					}),
				).rejects.toMatchObject({
					code: 'PASSWORD_AUTH_PASSWORD_CHANGE_REJECTED',
				})
				await expect(
					User.changePassword({
						currentPassword: password,
						newPassword: 'replacement password value',
					}),
				).resolves.toEqual({ changed: true })
			})
			await expect(
				auth.runWithSession(signedUp.session.token, () => undefined),
			).rejects.toMatchObject({ code: 'PASSWORD_AUTH_INVALID_SESSION' })
			await expect(
				auth.runWithSession(other.session.token, () => undefined),
			).rejects.toMatchObject({ code: 'PASSWORD_AUTH_INVALID_SESSION' })
			await expect(
				auth.runWithSession(current.session.token, () => 'current'),
			).resolves.toBe('current')
			await expect(
				User.login({ username: 'account-security', password }),
			).rejects.toMatchObject({ code: 'PASSWORD_AUTH_INVALID_CREDENTIALS' })
			const replacement = await User.login({
				username: 'account-security',
				password: 'replacement password value',
			})
			await auth.runWithSession(current.session.token, () =>
				User.logoutEverywhere(),
			)
			for (const token of [current.session.token, replacement.session.token]) {
				await expect(
					auth.runWithSession(token, () => undefined),
				).rejects.toMatchObject({ code: 'PASSWORD_AUTH_INVALID_SESSION' })
			}
		} finally {
			await ultimabase.dispose()
		}
	})

	it('requires the exact configured User and rejects a foreign active application', async () => {
		const User = createUser()
		const OtherUser = createUser()
		const { ultimabase } = createApplication(User)
		const { ultimabase: other } = createApplication(OtherUser)
		try {
			await ultimabase.start()
			await expect(
				OtherUser.signUp({ username: 'wrong-user', password }),
			).rejects.toThrow('not installed')
			await ultimabase.dispose()
			await other.start()
			await runWithRequestEngine(
				anonymous(other, {
					requestId: 'foreign',
					source: 'internal',
				}),
				async () => {
					await expect(
						User.login({ username: 'wrong-user', password }),
					).rejects.toThrow('not installed')
				},
			)
		} finally {
			await Promise.all([ultimabase.dispose(), other.dispose()])
		}
	})

	it('isolates the same class across sequential applications and rejects foreign tokens', async () => {
		await using database = await createPostgresWorkerFixture({
			prefix: 'password_user_foreign',
		})
		const User = createUser()
		let first = createApplication(User).ultimabase
		let second = createApplication(User, database).ultimabase
		await first.start()
		try {
			const left = await runWithRequestEngine(
				anonymous(first, { requestId: 'first', source: 'internal' }),
				() => User.signUp({ username: 'same-name', password }),
			)
			await first.dispose()
			await second.start()
			const right = await runWithRequestEngine(
				anonymous(second, { requestId: 'second', source: 'internal' }),
				() => User.signUp({ username: 'same-name', password }),
			)
			expect(left.user.id).not.toBe(right.user.id)
			await expect(User.refresh(left.session.token)).rejects.toMatchObject({
				code: 'PASSWORD_AUTH_INVALID_SESSION',
			})
			await second.dispose()
			first = createApplication(User).ultimabase
			await first.start()
			await expect(User.logout(right.session.token)).rejects.toMatchObject({
				code: 'PASSWORD_AUTH_INVALID_SESSION',
			})
			await expect(User.refresh(left.session.token)).resolves.toMatchObject({
				user: { id: left.user.id },
			})
			await first.dispose()
			second = createApplication(User, database).ultimabase
			await second.start()
			await expect(User.refresh(right.session.token)).resolves.toMatchObject({
				user: { id: right.user.id },
			})
		} finally {
			await Promise.all([first.dispose(), second.dispose()])
		}
	})

	it('preserves required profile rollback for signup, login, and refresh', async () => {
		const User = createUser()
		const app = createApplication(User)
		await app.ultimabase.start()
		try {
			const credentials = { username: 'rollback', password }
			app.setReadable(false)
			await expect(User.signUp(credentials)).rejects.toMatchObject({
				code: 'PERMISSION_DENIED',
			})
			app.setReadable(true)
			const signedUp = await User.signUp(credentials)
			app.setReadable(false)
			await expect(User.login(credentials)).rejects.toMatchObject({
				code: 'PERMISSION_DENIED',
			})
			await expect(User.refresh(signedUp.session.token)).rejects.toMatchObject({
				code: 'PERMISSION_DENIED',
			})
			app.setReadable(true)
			// A failed rotation leaves the original credential usable.
			await expect(User.refresh(signedUp.session.token)).resolves.toMatchObject(
				{ user: { id: signedUp.user.id } },
			)
		} finally {
			await app.ultimabase.dispose()
		}
	})
})
