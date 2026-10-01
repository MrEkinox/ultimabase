import {
	accessPlugin,
	fieldAccess,
	provideAccessContributions,
	schemaAccess,
} from '@ultimabase/access-plugin'
import {
	MasterAuthority,
	plugin,
	UltimaBase,
	getCurrentRequest,
	type PluginDefinition,
	type PluginSourceState,
	type RequestContext,
	type SchemaDefinition,
} from '@ultimabase/core'
import {
	graphqlPlugin,
	type GraphqlApplication,
} from '@ultimabase/graphql-plugin'
import {
	PasswordUserSchema,
	passwordAuthOperationList,
	passwordAuthPlugin,
	passwordPrincipal,
	passwordSession,
} from '@ultimabase/password-auth-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { isPlainRecord } from '@ultimabase/shared'
import { isObjectType } from 'graphql'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../../../../tests/fixtures/postgres-worker-fixture.js'

const password = 'correct horse battery staple'
const GraphqlAuthRecord = UltimaBase.Schema.define({
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

const executeAnonymous = <
	const TSchemas extends readonly SchemaDefinition[],
	const TPlugins extends readonly PluginDefinition[],
>(
	ultimabase: UltimaBase<TSchemas, TPlugins, PluginSourceState>,
	graphql: GraphqlApplication,
	source: string,
	requestId: string,
	variables?: Readonly<Record<string, unknown>>,
) => {
	const context = ultimabase.anonymous({
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
	`mutation Auth($input: ${field === 'signUp' ? 'PasswordAuthSignUpInput' : 'PasswordAuthCredentialsInput'}!) {
		${field}(input: $input) {
			user { id username displayName secret serial avatar }
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
		let profileVisible = true
		const User = PasswordUserSchema.define({
			className: 'User',
			fields: (field) => ({
				avatar: field.binary({ default: new Uint8Array([1, 2, 3]) }),
				displayName: field.string({ required: true }),
				secret: field.string({ default: 'private' }),
				serial: field.bigint({ default: 9_007_199_254_740_993n }),
			}),
		})
		const profilePolicy = plugin({
			id: 'fixture.graphql-profile-policy',
			version: '1.0.0',
			core: '^0.0.0',
			permissions: {
				'runtime:constrain': 'Verify authenticated profile reads.',
			},
			contributions: [
				provideAccessContributions('profile', () => {
					const secretField = User.persistedFields.secret
					if (secretField === undefined)
						throw new TypeError('Missing fixture secret field')
					return [
						schemaAccess(User, {
							read: ({ context }) =>
								profileVisible &&
								context.access.mode === 'anonymous' &&
								context.getValue(passwordPrincipal) !== undefined &&
								context.getValue(passwordSession) !== undefined,
						}),
						fieldAccess(User, secretField, ['secret'], { read: false }),
					]
				}),
			],
		})
		const passwordPlugin = passwordAuthPlugin({
			user: User,
			password: { memoryCostKiB: 19_456, parallelism: 1, timeCost: 2 },
		})
		const ultimabase = new (UltimaBase.use(
			postgresPlugin({
				pool: getFixture().pool,
				schemaPolicy: 'override',
			}),
			passwordPlugin,
			accessPlugin({ default: true }),
			profilePolicy,
			graphqlPlugin({
				acknowledgeUnverifiedProtection: true,
				operations: passwordAuthOperationList,
			}),
		))({
			masterAuthority: new MasterAuthority({
				keys: [{ id: 'graphql-sign-up', value: 'server-secret' }],
				onUse: () => undefined,
			}),
			pluginPrivileges: { logger: false },
			schemas: [User, GraphqlAuthRecord],
		})
		await ultimabase.start()
		try {
			const graphql = ultimabase.plugin('@ultimabase/graphql-plugin')
			const payload = graphql.schema.getType('PasswordAuthPayload')
			expect(
				isObjectType(payload)
					? payload.getFields().user?.type.toString()
					: undefined,
			).toBe('User!')
			expect(
				isObjectType(payload) ? Object.keys(payload.getFields()).sort() : [],
			).toEqual(['session', 'user'])
			expect(graphql.schema.getType('PasswordAuthPrincipal')).toBeUndefined()
			const obsoleteSelection = await executeAnonymous(
				ultimabase,
				graphql,
				'mutation { refresh { principal { userId } } }',
				'password-graphql-obsolete-principal',
			)
			expect(obsoleteSelection.errors?.[0]?.message).toContain(
				'Cannot query field "principal"',
			)
			for (const input of [
				{ password, username: 'graphql-user' },
				{ password, username: 'graphql-user', displayName: 42 },
			]) {
				const rejected = await executeAnonymous(
					ultimabase,
					graphql,
					authMutation('signUp'),
					'invalid-signup',
					{ input },
				)
				expect(rejected.errors?.length).toBeGreaterThan(0)
			}
			const invalidLogin = await executeAnonymous(
				ultimabase,
				graphql,
				authMutation('login'),
				'invalid-login-fields',
				{ input: { password, username: 'graphql-user', displayName: 'Ada' } },
			)
			expect(invalidLogin.errors?.length).toBeGreaterThan(0)
			expect(graphql.schema.getMutationType()?.getFields()).not.toHaveProperty(
				'createUser',
			)
			const signedUp = await executeAnonymous(
				ultimabase,
				graphql,
				authMutation('signUp'),
				'password-graphql-sign-up',
				{
					input: {
						password,
						username: 'graphql-user',
						displayName: 'Ada',
						serial: '9007199254740993',
						avatar: 'AQID',
					},
				},
			)
			expect(signedUp.errors).toBeUndefined()
			expect(readSessionToken(signedUp.data, 'signUp')).toMatch(/^ub_s1\./u)
			expect(signedUp.data?.signUp).toMatchObject({
				user: {
					username: 'graphql-user',
					displayName: 'Ada',
					secret: null,
					serial: '9007199254740993',
					avatar: 'AQID',
				},
			})
			expect(JSON.stringify(signedUp)).not.toContain('password')

			const rejected = await executeAnonymous(
				ultimabase,
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
			profileVisible = false
			const hidden = await executeAnonymous(
				ultimabase,
				graphql,
				// Omitting user must not bypass the required profile read.
				'mutation Auth($input: PasswordAuthCredentialsInput!) { login(input: $input) { session { token } } }',
				'password-graphql-hidden',
				{ input: { password, username: 'graphql-user' } },
			)
			expect(hidden.errors?.[0]).toMatchObject({
				extensions: { code: 'PERMISSION_DENIED' },
			})
			expect(hidden.data).toBeNull()
			expect(JSON.stringify(hidden)).not.toContain('ub_s1.')
			profileVisible = true

			const loggedIn = await executeAnonymous(
				ultimabase,
				graphql,
				authMutation('login'),
				'password-graphql-login',
				{ input: { password, username: 'GRAPHQL-USER' } },
			)
			const loginToken = readSessionToken(loggedIn.data, 'login')
			expect(loggedIn.errors).toBeUndefined()
			expect(loggedIn.data?.login).toMatchObject({
				user: { displayName: 'Ada' },
			})
			await User.updateOne(
				{
					where: { username: { eq: 'graphql-user' } },
					data: { displayName: 'Updated' },
				},
				{ ultimabase, useMasterKey: true },
			)
			const auth = ultimabase.plugin('@ultimabase/password-auth-plugin')
			profileVisible = false
			const deniedRefresh = await auth.runWithSession(loginToken, () =>
				graphql.execute({
					context: getCurrentRequest(),
					document: 'mutation { refresh { session { token } } }',
				}),
			)
			expect(deniedRefresh.errors?.[0]).toMatchObject({
				extensions: { code: 'PERMISSION_DENIED' },
			})
			expect(deniedRefresh.data).toBeNull()
			profileVisible = true
			let loginContext: RequestContext | undefined
			const refreshed = await auth.runWithSession(loginToken, () => {
				loginContext = getCurrentRequest()
				return graphql.execute({
					context: loginContext,
					document:
						'mutation { refresh { user { displayName secret } session { token } } }',
				})
			})
			expect(refreshed.errors).toBeUndefined()
			expect(refreshed.data?.refresh).toMatchObject({
				user: { displayName: 'Updated', secret: null },
			})
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
