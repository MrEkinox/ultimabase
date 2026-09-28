import {
	MasterAuthority,
	Pointer,
	UltimaBase,
	getCurrentRequest,
	runWithRequestEngine,
	type MasterAccessEvent,
} from '@ultimabase/core'
import {
	PasswordUser,
	passwordAuthOperations,
	passwordAuthPlugin,
	passwordPrincipal,
	passwordSession,
} from '@ultimabase/password-auth-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import {
	restPlugin,
	type RestPluginExports,
	type RestPluginOperationRouteDefinition,
} from '@ultimabase/rest-plugin'
import type { MaybePromise } from '@ultimabase/shared'
import {
	afterAll,
	beforeAll,
	describe,
	expect,
	it,
	vi,
	type Mock,
} from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../../../../tests/fixtures/postgres-worker-fixture.js'

const password = 'correct horse battery staple'
let fixture: PostgresWorkerFixture | undefined

const getFixture = (): PostgresWorkerFixture => {
	if (fixture === undefined)
		throw new TypeError('PostgreSQL fixture is unavailable')
	return fixture
}

const getFirstTableName = (
	rows: readonly Readonly<{ readonly table_name: string }>[],
): string => {
	const name = rows[0]?.table_name
	if (name === undefined) throw new TypeError('Private table is unavailable')
	return name
}

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture({ prefix: 'password_sessions' })
}, 30_000)

afterAll(async () => {
	await fixture?.dispose()
})

const createApplication = (
	options: Readonly<{
		fixture?: PostgresWorkerFixture
		onUse?: Mock<(event: MasterAccessEvent) => MaybePromise<void>>
		policyVersion?: number
	}> = {},
) => {
	const onUse = options.onUse ?? vi.fn<(event: MasterAccessEvent) => void>()
	const plugin = passwordAuthPlugin({
		password: {
			memoryCostKiB: 19_455 + (options.policyVersion ?? 1),
			parallelism: 1,
			policyVersion: options.policyVersion ?? 1,
			timeCost: 2,
		},
		session: {
			absoluteExpiresInMs: 24 * 60 * 60_000,
			expiresInMs: 5 * 60_000,
		},
	})
	const ultimabase = new UltimaBase({
		masterAuthority: new MasterAuthority({
			keys: [{ id: 'password-sign-up', value: 'server-secret' }],
			onUse,
		}),
		pluginPrivileges: { logger: false },
		plugins: [
			postgresPlugin({
				pool: (options.fixture ?? getFixture()).pool,
				schemaPolicy: 'override',
			}),
			plugin,
		],
		schemas: [],
	})
	return { onUse, plugin, ultimabase }
}

describe(
	'Password Auth sessions with PostgreSQL',
	{ concurrent: false },
	() => {
		it('signs up, logs in without enumeration, and propagates anonymous identity', async () => {
			const application = createApplication()
			await application.ultimabase.start()
			try {
				for (const operation of [
					passwordAuthOperations.logout,
					passwordAuthOperations.refresh,
				] as const) {
					await expect(
						application.ultimabase.operation(operation).execute(null),
					).rejects.toMatchObject({ code: 'PASSWORD_AUTH_INVALID_SESSION' })
				}
				const signUp = await application.ultimabase
					.operation(passwordAuthOperations.signUp)
					.execute({ password, username: ' Ada ' })
				expect(signUp.session.token).toMatch(/^ub_s1\.[A-Za-z0-9_-]{43}$/u)
				expect(Pointer.is(signUp.principal.user)).toBe(true)
				expect(application.onUse).toHaveBeenCalledOnce()
				expect(application.onUse.mock.calls[0]?.[0]).toMatchObject({
					kind: 'master-access',
					previousAccess: { mode: 'anonymous' },
				})

				await expect(
					application.ultimabase
						.operation(passwordAuthOperations.signUp)
						.execute({ password, username: 'ADA' }),
				).rejects.toMatchObject({ code: 'PASSWORD_AUTH_SIGN_UP_REJECTED' })
				await expect(
					application.ultimabase
						.operation(passwordAuthOperations.login)
						.execute({ password: 'incorrect password value', username: 'ada' }),
				).rejects.toMatchObject({ code: 'PASSWORD_AUTH_INVALID_CREDENTIALS' })
				await expect(
					application.ultimabase
						.operation(passwordAuthOperations.login)
						.execute({ password, username: 'unknown-user' }),
				).rejects.toMatchObject({ code: 'PASSWORD_AUTH_INVALID_CREDENTIALS' })

				const login = await application.ultimabase
					.operation(passwordAuthOperations.login)
					.execute({ password, username: 'ADA' })
				expect(login.principal.user.id).toBe(signUp.principal.user.id)
				expect(login.session.token).not.toBe(signUp.session.token)
				expect(application.onUse).toHaveBeenCalledTimes(2)

				const auth = application.ultimabase.plugin(
					'@ultimabase/password-auth-plugin',
				)
				const observed = await auth.runWithSession(login.session.token, () => {
					const context = getCurrentRequest()
					return {
						access: context.access.mode,
						principal: context.getValue(passwordPrincipal),
						session: context.getValue(passwordSession),
					}
				})
				expect(observed.access).toBe('anonymous')
				expect(observed.principal?.user.id).toBe(signUp.principal.user.id)
				expect(observed.session).toMatchObject({
					id: login.session.id,
					rotationVersion: 0,
				})
				expect(observed.session).not.toHaveProperty('token')
			} finally {
				await application.ultimabase.dispose()
			}
		})

		it('rotates concurrently, revokes exactly one session, and expires tokens', async () => {
			const application = createApplication()
			await application.ultimabase.start()
			try {
				const created = await application.ultimabase
					.operation(passwordAuthOperations.signUp)
					.execute({ password, username: 'grace' })
				const auth = application.ultimabase.plugin(
					'@ultimabase/password-auth-plugin',
				)
				let arrivals = 0
				let release: (() => void) | undefined
				const barrier = new Promise<void>((resolve) => {
					release = resolve
				})
				const refresh = () =>
					auth.runWithSession(created.session.token, async () => {
						arrivals += 1
						if (arrivals === 2) release?.()
						await barrier
						return application.ultimabase
							.operation(passwordAuthOperations.refresh)
							.execute(null)
					})
				const outcomes = await Promise.allSettled([refresh(), refresh()])
				const successful = outcomes.filter(
					(
						outcome,
					): outcome is PromiseFulfilledResult<
						Awaited<ReturnType<typeof refresh>>
					> => outcome.status === 'fulfilled',
				)
				const failed = outcomes.filter(
					(outcome): outcome is PromiseRejectedResult =>
						outcome.status === 'rejected',
				)
				if (successful.length !== 1) {
					throw new AggregateError(
						failed.map(() => new Error('Concurrent refresh failed')),
						'Concurrent refresh did not produce one winner',
					)
				}
				expect(successful).toHaveLength(1)
				expect(failed).toHaveLength(1)
				expect(failed[0]?.reason).toMatchObject({
					code: 'PASSWORD_AUTH_INVALID_SESSION',
				})
				await expect(
					auth.runWithSession(created.session.token, () => undefined),
				).rejects.toMatchObject({ code: 'PASSWORD_AUTH_INVALID_SESSION' })

				const rotated = successful[0]?.value
				if (rotated === undefined)
					throw new TypeError('Rotation did not succeed')
				const independent = await application.ultimabase
					.operation(passwordAuthOperations.login)
					.execute({ password, username: 'grace' })
				await auth.runWithSession(rotated.session.token, () =>
					application.ultimabase
						.operation(passwordAuthOperations.logout)
						.execute(null),
				)
				await expect(
					auth.runWithSession(rotated.session.token, () => undefined),
				).rejects.toMatchObject({ code: 'PASSWORD_AUTH_INVALID_SESSION' })
				await expect(
					auth.runWithSession(independent.session.token, () => 'active'),
				).resolves.toBe('active')
				const clock = vi
					.spyOn(Date, 'now')
					.mockReturnValue(Date.parse(independent.session.expiresAt) + 1)
				await expect(
					auth.runWithSession(independent.session.token, () => undefined),
				).rejects.toMatchObject({ code: 'PASSWORD_AUTH_INVALID_SESSION' })
				clock.mockRestore()
			} finally {
				vi.restoreAllMocks()
				await application.ultimabase.dispose()
			}
		})

		it('serializes refresh against account-wide session revocation', async () => {
			const application = createApplication()
			await application.ultimabase.start()
			try {
				const created = await application.ultimabase
					.operation(passwordAuthOperations.signUp)
					.execute({ password, username: 'global-revocation' })
				const auth = application.ultimabase.plugin(
					'@ultimabase/password-auth-plugin',
				)
				let arrivals = 0
				let release: (() => void) | undefined
				const barrier = new Promise<void>((resolve) => {
					release = resolve
				})
				const enter = async <TResult>(handler: () => Promise<TResult>) => {
					arrivals += 1
					if (arrivals === 2) release?.()
					await barrier
					return handler()
				}
				const refresh = auth.runWithSession(created.session.token, () =>
					enter(() =>
						application.ultimabase
							.operation(passwordAuthOperations.refresh)
							.execute(null),
					),
				)
				const logoutEverywhere = auth.runWithSession(
					created.session.token,
					() =>
						enter(() =>
							application.ultimabase
								.operation(passwordAuthOperations.logoutEverywhere)
								.execute(null),
						),
				)
				const [refreshOutcome, logoutOutcome] = await Promise.allSettled([
					refresh,
					logoutEverywhere,
				])
				expect(logoutOutcome).toMatchObject({
					status: 'fulfilled',
					value: { revoked: true },
				})
				await expect(
					auth.runWithSession(created.session.token, () => undefined),
				).rejects.toMatchObject({ code: 'PASSWORD_AUTH_INVALID_SESSION' })
				if (refreshOutcome.status === 'fulfilled') {
					await expect(
						auth.runWithSession(
							refreshOutcome.value.session.token,
							() => undefined,
						),
					).rejects.toMatchObject({ code: 'PASSWORD_AUTH_INVALID_SESSION' })
				} else {
					expect(refreshOutcome.reason).toMatchObject({
						code: 'PASSWORD_AUTH_INVALID_SESSION',
					})
				}
			} finally {
				await application.ultimabase.dispose()
			}
		})

		it('stores digests rather than raw bearer tokens', async () => {
			const application = createApplication()
			await application.ultimabase.start()
			try {
				const created = await application.ultimabase
					.operation(passwordAuthOperations.signUp)
					.execute({ password, username: 'linus' })
				// The portable collection fingerprint hides its table name, so inspect text only.
				const privateTables = await getFixture().pool.query<{
					readonly table_name: string
				}>(
					`SELECT table_name FROM information_schema.columns
				 WHERE table_schema = current_schema() AND column_name = 'tokenDigest'`,
				)
				const stored = await getFixture().pool.query<{
					readonly tokenDigest: string
				}>(
					`SELECT "tokenDigest" FROM "${getFirstTableName(privateTables.rows)}"`,
				)
				expect(stored.rows[0]?.tokenDigest).toMatch(/^[a-f0-9]{64}$/u)
				expect(stored.rows[0]?.tokenDigest).not.toContain(created.session.token)
				const user = await PasswordUser.get(
					{ id: created.principal.user.id },
					{ ultimabase: application.ultimabase, useMasterKey: true },
				)
				await user.delete({}, { useMasterKey: true })
				const auth = application.ultimabase.plugin(
					'@ultimabase/password-auth-plugin',
				)
				await expect(
					auth.runWithSession(created.session.token, () => undefined),
				).rejects.toMatchObject({ code: 'PASSWORD_AUTH_INVALID_SESSION' })
			} finally {
				await application.ultimabase.dispose()
			}
		})

		it('aborts sign-up before public or private writes when Master audit fails', async () => {
			const audit = vi.fn(() => Promise.reject(new Error('audit unavailable')))
			const application = createApplication({ onUse: audit })
			await application.ultimabase.start()
			try {
				await expect(
					application.ultimabase
						.operation(passwordAuthOperations.signUp)
						.execute({ password, username: 'audit-failure' }),
				).rejects.toMatchObject({ code: 'PLUGIN_OPERATION_INVALID' })
				expect(audit).toHaveBeenCalledOnce()
				await expect(
					application.ultimabase
						.operation(passwordAuthOperations.login)
						.execute({ password, username: 'audit-failure' }),
				).rejects.toMatchObject({ code: 'PASSWORD_AUTH_INVALID_CREDENTIALS' })
			} finally {
				await application.ultimabase.dispose()
			}
		})

		it('inherits an existing Master request without a second elevation', async () => {
			const application = createApplication()
			await application.ultimabase.start()
			try {
				const anonymous = application.ultimabase.anonymous({
					requestId: 'master-sign-up',
					source: 'internal',
				})
				const master = await anonymous.useMasterKey(
					application.ultimabase.authorizeMasterKey('server-secret'),
					'Trusted server sign-up',
				)
				await runWithRequestEngine(master, () =>
					application.ultimabase
						.operation(passwordAuthOperations.signUp)
						.execute({ password, username: 'master-user' }),
				)
				expect(application.onUse).toHaveBeenCalledOnce()
			} finally {
				await application.ultimabase.dispose()
			}
		})

		it('upgrades a stale password verifier during successful login', async () => {
			const initial = createApplication({ policyVersion: 1 })
			await initial.ultimabase.start()
			try {
				await initial.ultimabase
					.operation(passwordAuthOperations.signUp)
					.execute({ password, username: 'upgrade-user' })
			} finally {
				await initial.ultimabase.dispose()
			}

			const upgraded = createApplication({ policyVersion: 2 })
			await upgraded.ultimabase.start()
			try {
				const login = await upgraded.ultimabase
					.operation(passwordAuthOperations.login)
					.execute({ password, username: 'upgrade-user' })
				expect(typeof login.principal.user.id).toBe('string')
				const credentialTable = await getFixture().pool.query<{
					readonly table_name: string
				}>(
					`SELECT table_name FROM information_schema.columns
				 WHERE table_schema = current_schema() AND column_name = 'passwordVerifier'`,
				)
				const stored = await getFixture().pool.query<{
					readonly policyVersion: string
				}>(`SELECT "policyVersion" FROM "${getFirstTableName(credentialTable.rows)}"
			   WHERE username = 'upgrade-user'`)
				expect(stored.rows[0]?.policyVersion).toBe('2')
				expect(upgraded.onUse).not.toHaveBeenCalled()
			} finally {
				await upgraded.ultimabase.dispose()
			}
		})

		it('rejects a well-formed token issued by another application', async () => {
			await using foreignFixture = await createPostgresWorkerFixture({
				prefix: 'password_sessions_foreign',
			})
			const first = createApplication()
			const second = createApplication({ fixture: foreignFixture })
			await first.ultimabase.start()
			try {
				const created = await first.ultimabase
					.operation(passwordAuthOperations.signUp)
					.execute({ password, username: 'isolated-user' })
				await first.ultimabase.dispose()
				await second.ultimabase.start()
				const foreignAuth = second.ultimabase.plugin(
					'@ultimabase/password-auth-plugin',
				)
				await expect(
					foreignAuth.runWithSession(created.session.token, () => undefined),
				).rejects.toMatchObject({ code: 'PASSWORD_AUTH_INVALID_SESSION' })
			} finally {
				await Promise.all([
					first.ultimabase.dispose(),
					second.ultimabase.dispose(),
				])
			}
		})

		it('binds all four operations to REST only when explicitly selected', async () => {
			const plugin = passwordAuthPlugin({
				password: { memoryCostKiB: 19_456, parallelism: 1, timeCost: 2 },
			})
			const ultimabase = new UltimaBase({
				masterAuthority: new MasterAuthority({
					keys: [{ id: 'rest-sign-up', value: 'server-secret' }],
					onUse: () => undefined,
				}),
				pluginPrivileges: { logger: false },
				plugins: [
					postgresPlugin({ pool: getFixture().pool, schemaPolicy: 'override' }),
					plugin,
					restPlugin({
						operations: [
							passwordAuthOperations.signUp,
							passwordAuthOperations.login,
							passwordAuthOperations.logout,
							passwordAuthOperations.refresh,
						],
					}),
				],
				schemas: [],
			})
			await ultimabase.start()
			try {
				const rest: RestPluginExports = ultimabase.plugin(
					'@ultimabase/rest-plugin',
				)
				const routes = rest.routeGraph.routes.filter(
					(route) => route.kind === 'rest-plugin-operation-route',
				)
				expect(routes.map(({ operation }) => operation).sort()).toStrictEqual(
					[
						passwordAuthOperations.signUp.name,
						passwordAuthOperations.login.name,
						passwordAuthOperations.logout.name,
						passwordAuthOperations.refresh.name,
					].sort(),
				)
				expect(rest.operationTransport).toBeDefined()
				const signUpRoute = routes.find(
					(route): route is RestPluginOperationRouteDefinition =>
						route.operation === passwordAuthOperations.signUp.name,
				)
				if (
					signUpRoute === undefined ||
					rest.operationTransport === undefined
				) {
					throw new TypeError(
						'Password Auth REST operation route is unavailable',
					)
				}
				const result: unknown = await rest.operationTransport.execute(
					ultimabase.anonymous({
						requestId: 'password-rest-operation',
						source: 'rest',
					}).context,
					signUpRoute,
					new Request('https://example.test/operation', {
						body: JSON.stringify({
							input: { password, username: 'rest-user' },
						}),
						headers: { 'content-type': 'application/json' },
						method: 'POST',
					}),
					rest.readLimits,
				)
				expect(result).toMatchObject({
					user: { username: 'rest-user' },
				})
				expect(result).not.toHaveProperty('principal')
				expect(JSON.stringify(result)).toMatch(/"token":"ub_s1\./u)
			} finally {
				await ultimabase.dispose()
			}
		})
	},
)
