import { randomUUID } from 'node:crypto'

import { accessPlugin, isSelf } from '@ultimabase/access-plugin'
import { authPlugin } from '@ultimabase/auth-plugin'
import { UltimaBase } from '@ultimabase/core'
import { anonymous } from '@ultimabase/core/plugin'
import { graphqlPlugin } from '@ultimabase/graphql-plugin'
import { httpPlugin } from '@ultimabase/http-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../../../../tests/fixtures/postgres-worker-fixture.js'
import { password } from '../../src/index.js'
import { fastPolicy, secret } from './password-fixture.js'

let fixture: PostgresWorkerFixture | undefined

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture({ prefix: 'auth_unreadable' })
}, 30_000)
afterAll(async () => {
	await fixture?.dispose()
})

/** How the User's read rule treats its own row while a test runs. */
let readRule: 'denied' | 'filtered' | 'self' = 'self'
const otherId = '0199325a-0c00-7000-8000-000000000341'

const createApplication = () => {
	if (fixture === undefined) throw new TypeError('PostgreSQL is unavailable')
	const App = UltimaBase.use(
		postgresPlugin({ pool: fixture.pool, schemaPolicy: 'override' }),
		accessPlugin(),
		authPlugin({
			methods: [password({ identifier: 'email', policy: fastPolicy })],
		}),
		httpPlugin({ trustProxy: 1 }),
		graphqlPlugin(),
	)
	const HiddenUser = App.UserSchema.define({
		className: 'HiddenUser',
	}).with({
		access: {
			read: (input) =>
				readRule === 'self'
					? isSelf(input)
					: readRule === 'filtered'
						? input.where.eq('id', otherId)
						: false,
		},
	})
	const ultimabase = new App({ logger: false, schemas: [HiddenUser] })
	const send = async (
		path: string,
		body: unknown,
		headers: Readonly<Record<string, string>> = {},
	) => {
		const response = await ultimabase.plugin(httpPlugin).fetch(
			new Request(`https://api.example.test/api/auth/${path}`, {
				body: JSON.stringify(body),
				headers: {
					'Content-Type': 'application/json',
					'X-Forwarded-For': '198.51.100.12',
					...headers,
				},
				method: 'POST',
			}),
		)
		return { body: (await response.json()) as unknown, status: response.status }
	}
	return { HiddenUser, send, ultimabase }
}

const notReadable = {
	body: {
		error: {
			code: 'AUTH_USER_NOT_READABLE',
			message:
				'The authentication request could not be completed: the server configuration is invalid.',
			retryable: false,
		},
	},
	status: 500,
}

// ADR-0341 decision 4: a missing own-row rule is named, on every route.
describe.each(['denied', 'filtered'] as const)(
	'a User row its owner cannot read (%s)',
	(rule) => {
		it('fails sign-up, login, refresh and current with AUTH_USER_NOT_READABLE', async () => {
			const { HiddenUser, send, ultimabase } = createApplication()
			const started = await ultimabase.start()
			try {
				readRule = 'self'
				const credentials = {
					email: `ada-${randomUUID()}@example.test`,
					password: secret,
				}
				const { session } = await HiddenUser.signUp(credentials)
				const bearer = { Authorization: `Bearer ${session.token}` }
				readRule = rule

				await expect(
					HiddenUser.signUp({
						email: `bob-${randomUUID()}@example.test`,
						password: secret,
					}),
				).rejects.toMatchObject({
					code: 'AUTH_USER_NOT_READABLE',
					message: expect.stringContaining(
						'HiddenUser.with({ access: { read: isSelf } })',
					),
				})
				await expect(HiddenUser.login(credentials)).rejects.toMatchObject({
					code: 'AUTH_USER_NOT_READABLE',
				})
				expect(
					await send('sign-up', {
						email: `carol-${randomUUID()}@example.test`,
						password: secret,
					}),
				).toMatchObject(notReadable)
				expect(await send('login', credentials)).toMatchObject(notReadable)
				expect(await send('current', null, bearer)).toMatchObject(notReadable)
				expect(await send('refresh', null, bearer)).toMatchObject(notReadable)

				const { context } = anonymous(started, {
					requestId: randomUUID(),
					source: 'internal',
				})
				const graphql = await started
					.plugin('@ultimabase/graphql-plugin')
					.execute({
						context,
						document: `mutation { login(input: { email: "${credentials.email}", password: "${secret}" }) { user { id } } }`,
					})
				expect(JSON.stringify(graphql)).toContain('AUTH_USER_NOT_READABLE')
			} finally {
				readRule = 'self'
				await ultimabase.dispose()
			}
		})
	},
)
