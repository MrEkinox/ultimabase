import {
	MasterAuthority,
	Schema,
	UltimaBase,
	getCurrentRequest,
	type FrameworkEngine,
	type RequestContext,
} from '@ultimabase/core'
import {
	graphqlPlugin,
	type GraphqlApplication,
} from '@ultimabase/graphql-plugin'
import {
	passwordAuthOperations,
	passwordAuthPlugin,
} from '@ultimabase/password-auth-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { isPlainRecord } from '@ultimabase/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../../../../tests/fixtures/postgres-worker-fixture.js'

const password = 'correct horse battery staple'
const GraphqlAuthRecord = Schema.define({
	className: 'GraphqlAuthRecord',
	fields: (field) => ({ value: field.string() }),
})
let fixture: PostgresWorkerFixture | undefined

const getFixture = (): PostgresWorkerFixture => {
	if (fixture === undefined) {
		throw new TypeError('Password GraphQL PostgreSQL fixture is unavailable')
	}
	return fixture
}

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture({ prefix: 'password_graphql' })
}, 30_000)

afterAll(async () => {
	await fixture?.dispose()
})

const executeAnonymous = (
	engine: FrameworkEngine,
	graphql: GraphqlApplication,
	source: string,
	requestId: string,
	variables?: Readonly<Record<string, unknown>>,
) => {
	const context = engine.anonymous({
		requestId,
		source: 'ultimabase.graphql',
	}).context
	return graphql.execute({
		context,
		document: source,
		...(variables === undefined ? {} : { variables }),
	})
}

const authMutation = (field: 'login' | 'signUp') =>
	`mutation Auth($input: PasswordAuthCredentialsInput!) {
		${field}(input: $input) {
			principal { userId }
			session { id token expiresAt absoluteExpiresAt }
		}
	}`

const readSessionToken = (data: unknown, field: string): string => {
	const payload = isPlainRecord(data) ? data[field] : undefined
	const session = isPlainRecord(payload) ? payload.session : undefined
	const token = isPlainRecord(session) ? session.token : undefined
	if (typeof token !== 'string') {
		throw new TypeError(`GraphQL ${field} did not return a session token`)
	}
	return token
}

describe('Password Auth GraphQL operations with PostgreSQL', () => {
	it('signs up, logs in, refreshes, logs out, and masks credentials', async () => {
		const passwordPlugin = passwordAuthPlugin({
			password: { memoryCostKiB: 19_456, parallelism: 1, timeCost: 2 },
		})
		const ultimabase = new UltimaBase({
			masterAuthority: new MasterAuthority({
				keys: [{ id: 'graphql-sign-up', value: 'server-secret' }],
				onUse: () => undefined,
			}),
			pluginPrivileges: { logger: false },
			plugins: [
				postgresPlugin({
					pool: getFixture().pool,
					schemaPolicy: 'override',
				}),
				passwordPlugin,
				graphqlPlugin({
					acknowledgeUnverifiedProtection: true,
					operations: [
						passwordAuthOperations.signUp,
						passwordAuthOperations.login,
						passwordAuthOperations.refresh,
						passwordAuthOperations.logout,
					],
				}),
			],
			schemas: [GraphqlAuthRecord],
		})
		await ultimabase.start()
		try {
			const graphql = ultimabase.application.getPlugin(
				'@ultimabase/graphql-plugin',
			)
			const signedUp = await executeAnonymous(
				ultimabase.engine,
				graphql,
				authMutation('signUp'),
				'password-graphql-sign-up',
				{ input: { password, username: 'graphql-user' } },
			)
			expect(signedUp.errors).toBeUndefined()
			expect(readSessionToken(signedUp.data, 'signUp')).toMatch(/^ub_s1\./u)
			expect(JSON.stringify(signedUp)).not.toContain('password')

			const rejected = await executeAnonymous(
				ultimabase.engine,
				graphql,
				authMutation('login'),
				'password-graphql-rejected',
				{ input: { password: 'wrong password', username: 'graphql-user' } },
			)
			expect(rejected.errors?.[0]).toMatchObject({
				extensions: {
					code: 'PASSWORD_AUTH_INVALID_CREDENTIALS',
					requestId: 'password-graphql-rejected',
				},
				message: 'Invalid credentials.',
			})
			expect(JSON.stringify(rejected)).not.toContain('wrong password')

			const loggedIn = await executeAnonymous(
				ultimabase.engine,
				graphql,
				authMutation('login'),
				'password-graphql-login',
				{ input: { password, username: 'GRAPHQL-USER' } },
			)
			const loginToken = readSessionToken(loggedIn.data, 'login')
			const auth = ultimabase.application.getPlugin(
				'@ultimabase/password-auth-plugin',
			)
			let loginContext: RequestContext | undefined
			const refreshed = await auth.runWithSession(loginToken, () => {
				loginContext = getCurrentRequest()
				return graphql.execute({
					context: loginContext,
					document:
						'mutation { refresh { principal { userId } session { token } } }',
				})
			})
			expect(refreshed.errors).toBeUndefined()
			const refreshToken = readSessionToken(refreshed.data, 'refresh')
			expect(refreshToken).not.toBe(loginToken)
			if (loginContext === undefined) {
				throw new TypeError('GraphQL login context was not captured')
			}
			const reused = await graphql.execute({
				context: loginContext,
				document: 'mutation { refresh { session { token } } }',
			})
			expect(reused.errors?.[0]).toMatchObject({
				extensions: { code: 'PASSWORD_AUTH_INVALID_SESSION' },
				message: 'Invalid session.',
			})

			const loggedOut = await auth.runWithSession(refreshToken, () =>
				graphql.execute({
					context: getCurrentRequest(),
					document: 'mutation { logout { revoked } }',
				}),
			)
			expect(loggedOut.data?.logout).toMatchObject({ revoked: true })
			await expect(
				auth.runWithSession(refreshToken, () => undefined),
			).rejects.toMatchObject({ code: 'PASSWORD_AUTH_INVALID_SESSION' })
		} finally {
			await ultimabase.dispose()
		}
	})
})
