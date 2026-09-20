import { serve, type ServerType } from '@hono/node-server'
import {
	MasterAuthority,
	UltimaBase,
	definePlugin,
	getCurrentRequest,
	requireCapability,
	type MasterAccessEvent,
} from '@ultimabase/core'
import {
	httpApplicationCapability,
	httpApplicationIdHeader,
	httpMasterKeyHeader,
	httpPlugin,
	httpRoute,
	provideHttpEndpoints,
	type HttpApplication,
	type HttpOriginalHeader,
} from '@ultimabase/http-plugin'
import {
	passwordAuthOperations,
	passwordAuthPlugin,
	passwordPrincipal,
	passwordSession,
} from '@ultimabase/password-auth-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { honoServerPlugin } from '@ultimabase/server-hono-plugin'
import { Hono } from 'hono'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../../../../tests/fixtures/postgres-worker-fixture.js'

const password = 'correct horse battery staple'
const browserOrigin = 'https://client.example'
const cookieName = '__Host-ultimabase-session'
const applicationRequirement = requireCapability(
	httpApplicationCapability,
	'^1.0.0',
	{ phase: 'setup' },
)
let fixture: PostgresWorkerFixture | undefined

const getFixture = (): PostgresWorkerFixture => {
	if (fixture === undefined)
		throw new TypeError('Password HTTP PostgreSQL fixture is unavailable')
	return fixture
}

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture({ prefix: 'password_http' })
}, 30_000)

afterAll(async () => {
	await fixture?.dispose()
})
const contextRoutes = definePlugin({
	pluginId: 'fixture.password-http-context',
	version: '1.0.0',
	core: '^0.0.0',
	privileges: [
		{ name: 'transport:expose', reason: 'Exposes HTTP auth context evidence.' },
	],
	capabilities: {
		provides: [
			provideHttpEndpoints({
				contributionId: 'password-context',
				create: () =>
					(['GET', 'POST'] as const).map((method) =>
						httpRoute({
							handle: (request) => {
								const context = getCurrentRequest()
								return Response.json({
									access: context.access.mode,
									authorizationHeader: request.headers.has('Authorization'),
									cookieHeader: request.headers.has('Cookie'),
									principalId:
										context.getValue(passwordPrincipal)?.user.id ?? null,
									sessionId: context.getValue(passwordSession)?.id ?? null,
								})
							},
							method,
							path: '/context',
							protocol: {
								name: 'fixture.password-http-context',
								version: '1',
							},
						}),
					),
			}),
		],
	},
})
interface PasswordHttpApplicationOptions {
	readonly appId: string
	readonly cookie?: boolean
	readonly database?: PostgresWorkerFixture
	readonly hono?: Hono
	readonly masterTransport?: boolean
	readonly onMasterUse?: (event: MasterAccessEvent) => void
}

const createPasswordHttpApplication = (
	options: PasswordHttpApplicationOptions,
) => {
	let http: HttpApplication | undefined
	const capture = definePlugin({
		pluginId: `fixture.password-http-capture.${options.appId}`,
		version: '1.0.0',
		core: '^0.0.0',
		capabilities: { requires: [applicationRequirement] },
		setup: ({ capabilities }) => {
			http = capabilities.get(applicationRequirement)
		},
	})
	const browser =
		options.cookie === true
			? {
					allowedHeaders: [
						httpApplicationIdHeader,
						'Authorization',
						'Content-Type',
						...(options.masterTransport === true ? [httpMasterKeyHeader] : []),
					],
					allowedMethods: ['GET', 'POST'] as const,
					allowedOrigins: [browserOrigin],
					credentials: true,
					maxAgeSeconds: 60,
				}
			: undefined
	const server =
		options.hono === undefined
			? undefined
			: honoServerPlugin({
					app: options.hono,
					browserPolicyOwner: 'ultimabase',
				})
	const ultimabase = new UltimaBase({
		masterAuthority: new MasterAuthority({
			keys: [{ id: 'password-http-master', value: 'master-secret' }],
			onUse: options.onMasterUse ?? (() => undefined),
		}),
		pluginPrivileges: { logger: false },
		plugins: [
			postgresPlugin({
				pool: (options.database ?? getFixture()).pool,
				schemaPolicy: 'override',
			}),
			passwordAuthPlugin({
				...(options.cookie === true
					? {
							http: {
								cookie: { name: cookieName, sameSite: 'lax' as const },
							},
						}
					: {}),
				password: { memoryCostKiB: 19_456, parallelism: 1, timeCost: 2 },
				session: {
					absoluteExpiresInMs: 86_400_000,
					expiresInMs: 300_000,
				},
			}),
			contextRoutes,
			httpPlugin({
				appId: options.appId,
				...(browser === undefined ? {} : { browser }),
				...(options.masterTransport === true
					? { master: { enabled: true as const } }
					: {}),
			}),
			capture,
			...(server === undefined ? [] : [server]),
		],
		schemas: [],
	})
	return {
		getHttp: (): HttpApplication => {
			if (http === undefined)
				throw new TypeError('Password HTTP application is unavailable')
			return http
		},
		ultimabase,
	}
}

const directRequest = (
	appId: string,
	path: string,
	options: Readonly<{
		body?: string
		headers?: readonly HttpOriginalHeader[]
		method?: 'GET' | 'POST'
	}> = {},
) => {
	const originalHeaders: readonly HttpOriginalHeader[] = [
		[httpApplicationIdHeader, appId],
		...(options.headers ?? []),
	]
	const headers = new Headers()
	for (const [name, value] of originalHeaders) headers.append(name, value)
	return {
		originalHeaders,
		request: new Request(`https://api.example.test${path}`, {
			...(options.body === undefined ? {} : { body: options.body }),
			headers,
			method: options.method ?? 'GET',
		}),
	}
}

const readJson = (response: Response): Promise<unknown> => response.json()

const readCookiePair = (response: Response): string => {
	const header = response.headers.get('Set-Cookie')
	if (header === null) throw new TypeError('Session cookie is unavailable')
	return header.split(';', 1)[0] ?? ''
}

const closeServer = (server: ServerType): Promise<void> =>
	new Promise((resolve, reject) => {
		server.close((error?: Error) => {
			if (error === undefined) resolve()
			else reject(error)
		})
	})

const startServer = (app: Hono): Promise<ServerType> =>
	new Promise((resolve, reject) => {
		const server = serve(
			{
				fetch: app.fetch,
				hostname: '127.0.0.1',
				overrideGlobalObjects: true,
				port: 0,
			},
			() => {
				server.removeListener('error', reject)
				resolve(server)
			},
		)
		server.once('error', reject)
	})

describe('Password Auth HTTP session resolution', { concurrent: false }, () => {
	it('resolves Bearer, preserves anonymous and Master state, and fails closed', async () => {
		const audits: MasterAccessEvent[] = []
		const application = createPasswordHttpApplication({
			appId: 'password-bearer',
			masterTransport: true,
			onMasterUse: (event) => audits.push(event),
		})
		await application.ultimabase.start()
		try {
			const signedUp = await application.ultimabase
				.operation(passwordAuthOperations.signUp)
				.execute({ password, username: 'bearer-user' })
			const http = application.getHttp()
			const anonymous = await http.fetch(
				directRequest('password-bearer', '/context'),
			)
			expect(await readJson(anonymous)).toMatchObject({
				access: 'anonymous',
				principalId: null,
				sessionId: null,
			})

			const authenticated = await http.fetch(
				directRequest('password-bearer', '/context', {
					headers: [
						['Authorization', `Bearer ${signedUp.session.token}`],
						[httpMasterKeyHeader, 'master-secret'],
					],
				}),
			)
			expect(await readJson(authenticated)).toStrictEqual({
				access: 'master',
				authorizationHeader: false,
				cookieHeader: false,
				principalId: signedUp.principal.user.id,
				sessionId: signedUp.session.id,
			})
			expect(audits).toHaveLength(2)

			for (const value of [
				'Basic value',
				'Bearer malformed',
				`Bearer ub_s1.${'a'.repeat(43)}`,
			]) {
				const response = await http.fetch(
					directRequest('password-bearer', '/context', {
						headers: [['Authorization', value]],
					}),
				)
				expect(response.status).toBe(401)
				expect(await readJson(response)).toMatchObject({
					error: { code: 'HTTP_APPLICATION_REJECTED' },
				})
			}

			const expiring = await application.ultimabase
				.operation(passwordAuthOperations.login)
				.execute({ password, username: 'bearer-user' })
			const clock = vi
				.spyOn(Date, 'now')
				.mockReturnValue(Date.parse(expiring.session.expiresAt))
			try {
				const expired = await http.fetch(
					directRequest('password-bearer', '/context', {
						headers: [['Authorization', `Bearer ${expiring.session.token}`]],
					}),
				)
				expect(expired.status).toBe(401)
			} finally {
				clock.mockRestore()
			}

			const concurrent = await Promise.all(
				Array.from({ length: 4 }, () =>
					http.fetch(
						directRequest('password-bearer', '/context', {
							headers: [['Authorization', `Bearer ${signedUp.session.token}`]],
						}),
					),
				),
			)
			expect(concurrent.map((response) => response.status)).toStrictEqual([
				200, 200, 200, 200,
			])

			const auth = application.ultimabase.application.getPlugin(
				'@ultimabase/password-auth-plugin',
			)
			await auth.runWithSession(signedUp.session.token, () =>
				application.ultimabase
					.operation(passwordAuthOperations.logout)
					.execute(null),
			)
			const revoked = await http.fetch(
				directRequest('password-bearer', '/context', {
					headers: [['Authorization', `Bearer ${signedUp.session.token}`]],
				}),
			)
			expect(revoked.status).toBe(401)
			expect(JSON.stringify(await readJson(revoked))).not.toContain(
				signedUp.session.token,
			)
		} finally {
			await application.ultimabase.dispose()
		}
	})

	it('owns secure cookie routes, CSRF proofs, rotation, and stale-cookie recovery', async () => {
		const application = createPasswordHttpApplication({
			appId: 'password-cookie',
			cookie: true,
		})
		await application.ultimabase.start()
		try {
			const http = application.getHttp()
			const proofHeaders: readonly HttpOriginalHeader[] = [
				['Content-Type', 'application/json'],
				['Origin', browserOrigin],
			]
			const signUp = await http.fetch(
				directRequest('password-cookie', '/auth/v1/sign-up', {
					body: JSON.stringify({ password, username: 'cookie-user' }),
					headers: proofHeaders,
					method: 'POST',
				}),
			)
			expect(signUp.status).toBe(200)
			const signUpCookieHeader = signUp.headers.get('Set-Cookie') ?? ''
			expect(signUpCookieHeader).toContain(`${cookieName}=ub_s1.`)
			expect(signUpCookieHeader).toContain('Path=/')
			expect(signUpCookieHeader).toContain('HttpOnly')
			expect(signUpCookieHeader).toContain('Secure')
			expect(signUpCookieHeader).toContain('SameSite=Lax')
			expect(signUpCookieHeader).not.toContain('Domain=')
			const firstCookie = readCookiePair(signUp)
			const signUpBody = await readJson(signUp)
			expect(JSON.stringify(signUpBody)).not.toContain('ub_s1.')

			const authenticated = await http.fetch(
				directRequest('password-cookie', '/context', {
					headers: [['Cookie', firstCookie]],
				}),
			)
			const authenticatedBody = await readJson(authenticated)
			if (typeof authenticatedBody !== 'object' || authenticatedBody === null) {
				throw new TypeError('Cookie authentication response must be an object')
			}
			expect(Reflect.get(authenticatedBody, 'access')).toBe('anonymous')
			expect(Reflect.get(authenticatedBody, 'cookieHeader')).toBe(false)
			expect(Reflect.get(authenticatedBody, 'principalId')).toEqual(
				expect.any(String),
			)
			expect(Reflect.get(authenticatedBody, 'sessionId')).toEqual(
				expect.any(String),
			)

			const missingProof = await http.fetch(
				directRequest('password-cookie', '/context', {
					headers: [
						['Content-Type', 'application/json'],
						['Cookie', firstCookie],
					],
					method: 'POST',
				}),
			)
			expect(missingProof.status).toBe(401)

			const refresh = await http.fetch(
				directRequest('password-cookie', '/auth/v1/refresh', {
					headers: [...proofHeaders, ['Cookie', firstCookie]],
					method: 'POST',
				}),
			)
			expect(refresh.status).toBe(200)
			const rotatedCookie = readCookiePair(refresh)
			expect(rotatedCookie).not.toBe(firstCookie)
			expect(JSON.stringify(await readJson(refresh))).not.toContain('ub_s1.')

			const oldCookie = await http.fetch(
				directRequest('password-cookie', '/context', {
					headers: [['Cookie', firstCookie]],
				}),
			)
			expect(oldCookie.status).toBe(401)

			const ambiguous = await http.fetch(
				directRequest('password-cookie', '/context', {
					headers: [
						[
							'Authorization',
							rotatedCookie.replace(`${cookieName}=`, 'Bearer '),
						],
						['Cookie', rotatedCookie],
					],
				}),
			)
			expect(ambiguous.status).toBe(401)

			const recovered = await http.fetch(
				directRequest('password-cookie', '/auth/v1/login', {
					body: JSON.stringify({ password, username: 'cookie-user' }),
					headers: [...proofHeaders, ['Cookie', firstCookie]],
					method: 'POST',
				}),
			)
			expect(recovered.status).toBe(200)
			const recoveredCookie = readCookiePair(recovered)
			expect(recoveredCookie).not.toBe(firstCookie)

			const logout = await http.fetch(
				directRequest('password-cookie', '/auth/v1/logout', {
					headers: [...proofHeaders, ['Cookie', recoveredCookie]],
					method: 'POST',
				}),
			)
			expect(logout.status).toBe(200)
			expect(logout.headers.get('Set-Cookie')).toContain('Max-Age=0')
			expect(await readJson(logout)).toStrictEqual({
				result: { revoked: true },
			})

			const rejectedOrigin = await http.fetch(
				directRequest('password-cookie', '/auth/v1/login', {
					body: JSON.stringify({ password, username: 'cookie-user' }),
					headers: [
						['Content-Type', 'application/json'],
						['Origin', 'https://foreign.example'],
					],
					method: 'POST',
				}),
			)
			expect(rejectedOrigin.status).toBe(401)
		} finally {
			await application.ultimabase.dispose()
		}
	})

	it('rejects a session issued by another application', async () => {
		const foreignFixture = await createPostgresWorkerFixture({
			prefix: 'password_http_foreign',
		})
		const first = createPasswordHttpApplication({ appId: 'password-first' })
		const second = createPasswordHttpApplication({
			appId: 'password-second',
			database: foreignFixture,
		})
		await first.ultimabase.start()
		try {
			const signedUp = await first.ultimabase
				.operation(passwordAuthOperations.signUp)
				.execute({ password, username: 'isolated-http-user' })
			await first.ultimabase.dispose()
			await second.ultimabase.start()
			const response = await second.getHttp().fetch(
				directRequest('password-second', '/context', {
					headers: [['Authorization', `Bearer ${signedUp.session.token}`]],
				}),
			)
			expect(response.status).toBe(401)
		} finally {
			await Promise.all([
				first.ultimabase.dispose(),
				second.ultimabase.dispose(),
			])
			await foreignFixture.dispose()
		}
	})

	it('matches direct Fetch resolution on a real Hono listener', async () => {
		const hono = new Hono()
		const application = createPasswordHttpApplication({
			appId: 'password-hono',
			hono,
		})
		await application.ultimabase.start()
		const listener = await startServer(hono)
		try {
			const address = listener.address()
			if (typeof address !== 'object' || address === null) {
				throw new TypeError('Password Hono listener address is unavailable')
			}
			const signedUp = await application.ultimabase
				.operation(passwordAuthOperations.signUp)
				.execute({ password, username: 'hono-user' })
			const authorization = `Bearer ${signedUp.session.token}`
			const direct = await application.getHttp().fetch(
				directRequest('password-hono', '/context', {
					headers: [['Authorization', authorization]],
				}),
			)
			const network = await fetch(
				`http://127.0.0.1:${String(address.port)}/context`,
				{
					headers: {
						Authorization: authorization,
						[httpApplicationIdHeader]: 'password-hono',
					},
				},
			)
			expect(network.status).toBe(direct.status)
			expect(await readJson(network)).toStrictEqual(await readJson(direct))

			const invalidNetwork = await fetch(
				`http://127.0.0.1:${String(address.port)}/context`,
				{
					headers: {
						Authorization: 'Bearer malformed',
						[httpApplicationIdHeader]: 'password-hono',
					},
				},
			)
			expect(invalidNetwork.status).toBe(401)
			expect(await readJson(invalidNetwork)).toMatchObject({
				error: { code: 'HTTP_APPLICATION_REJECTED' },
			})
		} finally {
			await closeServer(listener)
			await application.ultimabase.dispose()
		}
	})

	it('rejects cookie mode without the exact credentialed browser policy', async () => {
		const application = new UltimaBase({
			masterAuthority: new MasterAuthority({
				keys: [{ id: 'policy', value: 'master-secret' }],
				onUse: () => undefined,
			}),
			pluginPrivileges: { logger: false },
			plugins: [
				postgresPlugin({ pool: getFixture().pool, schemaPolicy: 'override' }),
				passwordAuthPlugin({
					http: { cookie: { name: cookieName } },
				}),
				httpPlugin({ appId: 'password-cookie-policy' }),
			],
			schemas: [],
		})
		await expect(application.start()).rejects.toThrow(
			'Password Auth cookie mode requires credentialed exact origins',
		)
		await application.dispose()
	})
})
