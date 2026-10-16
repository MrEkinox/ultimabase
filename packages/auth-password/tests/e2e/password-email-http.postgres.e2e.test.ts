import { randomUUID } from 'node:crypto'

import { accessPlugin } from '@ultimabase/access-plugin'
import { authPlugin } from '@ultimabase/auth-plugin'
import { UltimaBase } from '@ultimabase/core'
import { anonymous } from '@ultimabase/core/plugin'
import { graphqlPlugin } from '@ultimabase/graphql-plugin'
import { httpPlugin } from '@ultimabase/http-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { restPlugin } from '@ultimabase/rest-plugin'
import { isPlainRecord } from '@ultimabase/shared'
import { waitForAfterCommit } from '@ultimabase/testing/plugins'
import type { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../../../../tests/fixtures/postgres-worker-fixture.js'
import { password } from '../../src/index.js'
import { createOutbox, fastPolicy, secret } from './password-fixture.js'

const origin = 'https://client.example'
const cookieName = '__Host-email-session'
let fixture: PostgresWorkerFixture | undefined
const pool = (): Pool => {
	if (fixture === undefined) throw new TypeError('PostgreSQL is unavailable')
	return fixture.pool
}

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture({ prefix: 'auth_email_http' })
}, 30_000)
afterAll(async () => {
	await fixture?.dispose()
})

const createApplication = (
	options: Readonly<{
		cookie?: boolean
		requireVerifiedEmail?: boolean
		sendResetEmail?: (message: Readonly<{ token: string }>) => Promise<void>
	}> = {},
) => {
	const outbox = createOutbox({
		requireVerifiedEmail: options.requireVerifiedEmail ?? false,
	})
	const App = UltimaBase.use(
		postgresPlugin({ pool: pool(), schemaPolicy: 'override' }),
		// REST refuses public writes without a protected policy.
		accessPlugin(),
		authPlugin({
			methods: [
				password({
					identifier: 'email',
					policy: fastPolicy,
					...outbox.flows,
					...(options.sendResetEmail === undefined
						? {}
						: { reset: { sendResetEmail: options.sendResetEmail } }),
				}),
			],
			...(options.cookie === true
				? { http: { cookie: { name: cookieName } } }
				: {}),
		}),
		httpPlugin({
			// `fetch()` has no socket: one proxy hop makes X-Forwarded-For the client.
			trustProxy: 1,
			...(options.cookie === true
				? { browser: { credentials: true, origins: [origin] } }
				: {}),
		}),
		restPlugin({ openapi: true }),
		graphqlPlugin(),
	)
	const EmailUser = App.UserSchema.define({
		className: 'EmailUser',
		fields: (field) => ({ displayName: field.string() }),
	}).with({
		access: {
			read: ({ principal, where }) =>
				where.in('id', principal === undefined ? [] : [principal.id]),
		},
	})
	const ultimabase = new App({ logger: false, schemas: [EmailUser] })
	const send = (
		path: string,
		body: unknown,
		headers: Readonly<Record<string, string>> = {},
	) =>
		ultimabase.plugin(httpPlugin).fetch(
			new Request(`https://api.example.test${path}`, {
				body: JSON.stringify(body),
				headers: {
					'Content-Type': 'application/json',
					'X-Forwarded-For': '198.51.100.7',
					...headers,
				},
				method: 'POST',
			}),
		)
	return { EmailUser, outbox, send, ultimabase }
}

describe(
	'email flows over HTTP, REST and GraphQL',
	{ concurrent: false },
	() => {
		it('answers reset requests identically and delivers outside the request', async () => {
			let release: () => void = () => undefined
			const gate = new Promise<void>((resolve) => {
				release = resolve
			})
			const delivered: string[] = []
			const { send, ultimabase } = createApplication({
				sendResetEmail: async ({ token }) => {
					await gate
					delivered.push(token)
				},
			})
			await ultimabase.start()
			try {
				const signUp = await send('/api/auth/sign-up', {
					email: 'ada@example.test',
					password: secret,
				})
				expect(signUp.status).toBe(200)
				const answers = await Promise.all(
					['ada@example.test', 'nobody@example.test'].map(async (email) => {
						const response = await send('/api/auth/request-password-reset', {
							email,
						})
						return {
							body: await response.text(),
							headers: [...response.headers.keys()].sort(),
							status: response.status,
						}
					}),
				)
				expect(answers[0]).toStrictEqual(answers[1])
				expect(answers[0]).toMatchObject({
					body: '{"result":{"accepted":true}}',
					status: 200,
				})
				// The responses returned while the delivery was still waiting.
				expect(delivered).toStrictEqual([])
				release()
				await waitForAfterCommit()
				expect(delivered).toHaveLength(1)
				const reset = await send('/api/auth/reset-password', {
					newPassword: 'another correct horse battery staple',
					token: delivered[0],
				})
				expect(await reset.json()).toStrictEqual({ result: { reset: true } })
			} finally {
				release()
				await ultimabase.dispose()
			}
		})

		it('limits requests per address alike and counts invalid tokens per address', async () => {
			vi.useFakeTimers({ now: Date.now(), toFake: ['Date'] })
			const { send, ultimabase } = createApplication()
			await ultimabase.start()
			try {
				await send('/api/auth/sign-up', {
					email: 'bob@example.test',
					password: secret,
				})
				const statuses = async (email: string) => {
					const seen: number[] = []
					for (let request = 0; request < 7; request += 1) {
						seen.push(
							(await send('/api/auth/request-email-verification', { email }))
								.status,
						)
					}
					return seen
				}
				const known = await statuses('bob@example.test')
				expect(known).toStrictEqual([200, 200, 200, 200, 200, 200, 429])
				expect(await statuses('nobody@example.test')).toStrictEqual(known)
				const tokenHeaders = { 'X-Forwarded-For': '198.51.100.9' }
				for (let attempt = 0; attempt < 21; attempt += 1) {
					const rejected = await send(
						'/api/auth/verify-email',
						{ token: `ub_v1.${'A'.repeat(43)}` },
						tokenHeaders,
					)
					expect(rejected.status).toBe(400)
					expect(await rejected.json()).toMatchObject({
						error: { code: 'AUTH_INVALID_TOKEN' },
					})
				}
				const limited = await send(
					'/api/auth/confirm-email-change',
					{ token: `ub_c1.${'A'.repeat(43)}` },
					tokenHeaders,
				)
				expect(limited.status).toBe(429)
			} finally {
				vi.useRealTimers()
				await ultimabase.dispose()
			}
		})

		it('ignores a stale cookie on token routes and clears it after a reset', async () => {
			const { outbox, send, ultimabase } = createApplication({ cookie: true })
			await ultimabase.start()
			try {
				const browser = { Cookie: `${cookieName}=stale`, Origin: origin }
				await send('/api/auth/sign-up', {
					email: 'carol@example.test',
					password: secret,
				})
				await waitForAfterCommit()
				const verified = await send(
					'/api/auth/verify-email',
					{ token: outbox.tokenFor('verification', 'carol@example.test') },
					browser,
				)
				expect(await verified.json()).toStrictEqual({
					result: { verified: true },
				})
				await send(
					'/api/auth/request-password-reset',
					{ email: 'carol@example.test' },
					browser,
				)
				await waitForAfterCommit()
				const reset = await send(
					'/api/auth/reset-password',
					{
						newPassword: 'another correct horse battery staple',
						token: outbox.tokenFor('reset', 'carol@example.test'),
					},
					browser,
				)
				expect(reset.status).toBe(200)
				expect(reset.headers.get('Set-Cookie')).toContain('Max-Age=0')
			} finally {
				await ultimabase.dispose()
			}
		})

		it('signs up without a session or cookie with requireVerifiedEmail, on every transport', async () => {
			const { send, ultimabase } = createApplication({
				cookie: true,
				requireVerifiedEmail: true,
			})
			const started = await ultimabase.start()
			try {
				const browser = await send(
					'/api/auth/sign-up',
					{ email: 'hal@example.test', password: secret },
					{ Origin: origin },
				)
				expect(browser.status).toBe(200)
				expect(browser.headers.has('Set-Cookie')).toBe(false)
				const body = await browser.text()
				expect(body).not.toContain('ub_s1.')
				expect(JSON.parse(body)).toMatchObject({
					result: {
						user: { email: 'hal@example.test', emailVerified: false },
						verificationRequired: true,
					},
				})
				const graphql = started.plugin('@ultimabase/graphql-plugin')
				const context = anonymous(started, {
					requestId: randomUUID(),
					source: 'internal',
				}).context
				expect(
					JSON.stringify(
						await graphql.execute({
							context,
							document:
								'{ __type(name: "PasswordSignUpPendingPayload") { fields { name } } }',
						}),
					),
				).toContain('verificationRequired')
				const openapi = await (
					await ultimabase
						.plugin(httpPlugin)
						.fetch(new Request('https://api.example.test/api/openapi.json'))
				).text()
				expect(openapi).toContain('verificationRequired')
			} finally {
				await ultimabase.dispose()
			}
		})

		it('exposes the email operations through REST and typed GraphQL', async () => {
			const { send, ultimabase } = createApplication()
			const started = await ultimabase.start()
			try {
				const rest = await send('/api/operations/requestPasswordReset', {
					input: { email: 'nobody@example.test' },
				})
				expect(await rest.json()).toStrictEqual({ result: { accepted: true } })
				const restToken = await send('/api/operations/verifyEmail', {
					input: { token: 'not a token' },
				})
				expect(restToken.status).toBe(400)
				expect(await restToken.json()).toMatchObject({
					error: { code: 'AUTH_INVALID_TOKEN' },
				})
				const graphql = started.plugin('@ultimabase/graphql-plugin')
				const context = anonymous(started, {
					requestId: randomUUID(),
					source: 'internal',
				}).context
				const fields = await graphql.execute({
					context,
					document: '{ __type(name: "Mutation") { fields { name } } }',
				})
				const mutationNames = JSON.stringify(fields)
				for (const name of [
					'confirmEmailChange',
					'requestEmailChange',
					'requestEmailVerification',
					'requestPasswordReset',
					'resetPassword',
					'verifyEmail',
				]) {
					expect(mutationNames).toContain(`"${name}"`)
				}
				// The email fields are output only: no create or update input lists them.
				const inputs = (await graphql.execute({
					context,
					document:
						'{ create: __type(name: "EmailUserCreateInput") { inputFields { name } } update: __type(name: "EmailUserUpdateInput") { inputFields { name } } user: __type(name: "EmailUser") { fields { name } } signUp: __type(name: "PasswordSignUpInput") { inputFields { name } } }',
				})) as unknown
				const names = (key: string): readonly string[] => {
					const section: unknown = Reflect.get(
						Reflect.get(Object(inputs), 'data') ?? {},
						key,
					)
					const list: unknown =
						Reflect.get(Object(section), 'inputFields') ??
						Reflect.get(Object(section), 'fields')
					return Array.isArray(list)
						? list.map((entry: unknown) =>
								String(Reflect.get(Object(entry), 'name')),
							)
						: []
				}
				for (const key of ['create', 'update']) {
					expect(names(key).length).toBeGreaterThan(0)
					expect(
						names(key).filter((name) => name.startsWith('email')),
					).toStrictEqual([])
				}
				expect(names('user')).toEqual(
					expect.arrayContaining(['email', 'emailVerified', 'emailVerifiedAt']),
				)
				expect(names('signUp')).toEqual(
					expect.arrayContaining(['email', 'password']),
				)
				const openapi: unknown = await (
					await ultimabase
						.plugin(httpPlugin)
						.fetch(new Request('https://api.example.test/api/openapi.json'))
				).json()
				const schemas: unknown = Reflect.get(
					Object(Reflect.get(Object(openapi), 'components')),
					'schemas',
				)
				for (const name of ['EmailUserCreateInput', 'EmailUserUpdateInput']) {
					const component: unknown = Reflect.get(Object(schemas), name)
					const declared: unknown = Reflect.get(Object(component), 'properties')
					const properties = Object.keys(
						isPlainRecord(declared) ? declared : {},
					)
					expect(properties).toContain('displayName')
					expect(
						properties.filter((property) => property.startsWith('email')),
					).toStrictEqual([])
				}
				expect(JSON.stringify(openapi)).toContain('emailVerified')

				expect(
					await graphql.execute({
						context,
						document:
							'mutation { requestPasswordReset(input: { email: "nobody@example.test" }) { accepted } }',
					}),
				).toEqual({ data: { requestPasswordReset: { accepted: true } } })
				const invalid = await graphql.execute({
					context,
					document:
						'mutation { confirmEmailChange(input: { token: "ub_c1.x" }) { confirmed } }',
				})
				expect(JSON.stringify(invalid)).toContain('AUTH_INVALID_TOKEN')
			} finally {
				await ultimabase.dispose()
			}
		})
	},
)
