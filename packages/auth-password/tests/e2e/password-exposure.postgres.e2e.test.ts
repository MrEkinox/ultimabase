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
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../../../../tests/fixtures/postgres-worker-fixture.js'
import { password } from '../../src/index.js'
import { fastPolicy, secret } from './password-fixture.js'

let fixture: PostgresWorkerFixture | undefined

const createApplication = (identifier: 'email' | 'username') => {
	if (fixture === undefined) throw new TypeError('PostgreSQL is unavailable')
	const App = UltimaBase.use(
		postgresPlugin({ pool: fixture.pool, schemaPolicy: 'override' }),
		accessPlugin(),
		authPlugin({ methods: [password({ identifier, policy: fastPolicy })] }),
		httpPlugin({ trustProxy: 1 }),
		restPlugin({ openapi: true }),
		graphqlPlugin(),
	)
	const className = `Exposed${identifier === 'email' ? 'Email' : 'Name'}User`
	const ExposedUser = App.UserSchema.define({ className }).with({
		access: {
			read: ({ principal, where }) =>
				where.in('id', principal === undefined ? [] : [principal.id]),
		},
	})
	const ultimabase = new App({ logger: false, schemas: [ExposedUser] })
	const send = (path: string, body: unknown, method = 'POST') =>
		ultimabase.plugin(httpPlugin).fetch(
			new Request(`https://api.example.test${path}`, {
				...(method === 'GET' ? {} : { body: JSON.stringify(body) }),
				headers: {
					'Content-Type': 'application/json',
					'X-Forwarded-For': '198.51.100.9',
				},
				method,
			}),
		)
	return { className, send, ultimabase }
}

// ADR-0341 decision 2: the auth plugin binds its operations to its own routes
// and to GraphQL, so REST does not serve them a second time.
describe.each(['email', 'username'] as const)(
	'authentication exposure with the %s identifier',
	(identifier) => {
		// One database schema per identifier: their auth storage differs.
		beforeAll(async () => {
			fixture = await createPostgresWorkerFixture({
				prefix: `auth_exposure_${identifier}`,
			})
		}, 30_000)
		afterAll(async () => {
			await fixture?.dispose()
		})

		it('is served once over HTTP, under /api/auth, and unchanged in GraphQL', async () => {
			const { className, send, ultimabase } = createApplication(identifier)
			const started = await ultimabase.start()
			try {
				const credentials =
					identifier === 'email'
						? { email: `ada-${randomUUID()}@example.test`, password: secret }
						: { password: secret, username: `ada-${randomUUID()}` }
				expect((await send('/api/auth/sign-up', credentials)).status).toBe(200)
				expect((await send('/api/auth/login', credentials)).status).toBe(200)
				for (const name of ['signUp', 'login', 'current', 'refresh']) {
					const duplicate = await send(`/api/operations/${name}`, {
						input: credentials,
					})
					expect(duplicate.status).toBe(404)
				}
				const openapi = await (
					await send('/api/openapi.json', undefined, 'GET')
				).text()
				expect(openapi).not.toContain('/api/operations/')
				// ADR-0341 decision 3: with an email identifier, authentication
				// closes the User's generic create; transports do not publish it.
				const userPath = `/api/classes/${className}`
				const create = await send(userPath, { password: secret })
				expect(create.status).toBe(identifier === 'email' ? 405 : 403)
				const document: unknown = JSON.parse(openapi)
				const paths = isPlainRecord(document) ? document.paths : undefined
				const collection = isPlainRecord(paths)
					? paths[`/classes/${className}`]
					: undefined
				expect(
					isPlainRecord(collection) ? Object.keys(collection).sort() : [],
				).toEqual(identifier === 'email' ? ['get'] : ['get', 'post'])

				const graphql = started.plugin('@ultimabase/graphql-plugin')
				const { context } = anonymous(started, {
					requestId: randomUUID(),
					source: 'internal',
				})
				const roots = JSON.stringify(
					await graphql.execute({
						context,
						document:
							'{ mutation: __type(name: "Mutation") { fields { name } } query: __type(name: "Query") { fields { name } } }',
					}),
				)
				for (const name of ['signUp', 'login', 'refresh', 'current']) {
					expect(roots).toContain(`"${name}"`)
				}
				expect(roots.includes(`"create${className}"`)).toBe(
					identifier === 'username',
				)
			} finally {
				await ultimabase.dispose()
			}
		})
	},
)
