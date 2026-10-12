import { serve, type ServerType } from '@hono/node-server'
import type { MasterAccessEvent } from '@ultimabase/core'
import { honoServerPlugin } from '@ultimabase/hono-server-plugin'
import { Hono } from 'hono'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../fixtures/postgres-worker-fixture.js'
import {
	executeMinimalGraphql,
	invoke,
	loadMinimalExample,
	modelJson,
	type MinimalApplication,
	type MinimalClient,
	type MinimalExampleModule,
} from './rest-public-vertical-support.js'

const appId = 'graphql-cross-transport'
const masterKey = 'graphql-cross-transport-master-secret'
const articlePath = '/api/classes/ExampleArticle'
const operationPath = '/api/operations/status'

let fixture: PostgresWorkerFixture | undefined
let example: MinimalExampleModule | undefined
let application: MinimalApplication | undefined
let client: MinimalClient | undefined
let listener: ServerType | undefined
const audits: MasterAccessEvent[] = []

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

const requireFixture = (): PostgresWorkerFixture => {
	if (fixture === undefined)
		throw new TypeError('Parity database is unavailable')
	return fixture
}

const requireExample = (): MinimalExampleModule => {
	if (example === undefined)
		throw new TypeError('Minimal example is unavailable')
	return example
}

const requireApplication = (): MinimalApplication => {
	if (application === undefined) {
		throw new TypeError('Minimal application is unavailable')
	}
	return application
}

const requireClient = (): MinimalClient => {
	if (client === undefined) throw new TypeError('Minimal client is unavailable')
	return client
}

const readRecord = (
	value: unknown,
	label: string,
): Readonly<Record<string, unknown>> => {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new TypeError(`${label} must be an object`)
	}
	return value as Readonly<Record<string, unknown>>
}

const readGraphqlField = (value: unknown, field: string): unknown => {
	const envelope = readRecord(value, 'GraphQL response')
	const errors = envelope.errors
	if (errors !== undefined) {
		throw new TypeError(`GraphQL response failed: ${JSON.stringify(errors)}`)
	}
	return readRecord(envelope.data, 'GraphQL data')[field]
}

const graphqlHttp = async (
	requestClient: MinimalClient,
	query: string,
	variables?: Readonly<Record<string, unknown>>,
): Promise<unknown> => {
	const response = await requestClient.fetch('/graphql', {
		body: JSON.stringify({ query, variables }),
		headers: { 'Content-Type': 'application/json' },
		method: 'POST',
	})
	expect(response.status).toBe(200)
	return response.json()
}

const normalizedRows = (value: unknown): readonly unknown[] => {
	if (!Array.isArray(value)) throw new TypeError('Expected an article array')
	return value
		.map((item) => {
			const record = readRecord(item, 'article')
			return { slug: record.slug, title: record.title }
		})
		.toSorted((left, right) =>
			String(left.slug).localeCompare(String(right.slug)),
		)
}

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture({ prefix: 'graphql_parity' })
	example = await loadMinimalExample()
	const hono = new Hono()
	const server = honoServerPlugin({
		app: hono,
		browserPolicyOwner: 'ultimabase',
	})
	application = requireExample().createMinimalApplication({
		applicationId: appId,
		databaseUrl: requireFixture().connectionUri,
		masterKey,
		onMasterUse: (event) => audits.push(event),
		server,
	})
	await application.start()
	listener = await startServer(hono)
	const address = listener.address()
	if (typeof address !== 'object' || address === null) {
		throw new TypeError('Parity listener address is unavailable')
	}
	client = requireExample().createMinimalClient({
		applicationId: appId,
		baseUrl: `http://127.0.0.1:${String(address.port)}`,
	})
}, 30_000)

afterAll(async () => {
	if (listener !== undefined) await closeServer(listener)
	await application?.dispose()
	await fixture?.dispose()
})

describe(
	'minimal cross-transport GraphQL parity',
	{ concurrent: false },
	() => {
		it('shares one logical mutation and read pipeline across all four entry points', async () => {
			const minimal = requireExample()
			const app = requireApplication()
			await invoke(minimal.ExampleArticle, 'createOne', [
				{ data: { slug: 'a-direct', title: '  Direct  ' } },
			])

			const restCreated = await requireClient().fetch(articlePath, {
				body: JSON.stringify({ slug: 'b-rest', title: '  REST  ' }),
				headers: { 'Content-Type': 'application/json' },
				method: 'POST',
			})
			expect(restCreated.status).toBe(201)

			const mutation = `mutation Create($input: ExampleArticleCreateInput!) {
			createExampleArticle(input: $input) { slug title }
		}`
			const networklessCreated = await executeMinimalGraphql(
				app,
				mutation,
				'parity-networkless-create',
				{ input: { slug: 'c-networkless', title: '  Networkless  ' } },
			)
			expect(
				readGraphqlField(networklessCreated, 'createExampleArticle'),
			).toEqual({
				slug: 'c-networkless',
				title: 'Networkless',
			})

			const yogaCreated = await graphqlHttp(requireClient(), mutation, {
				input: { slug: 'd-yoga', title: '  Yoga  ' },
			})
			expect(readGraphqlField(yogaCreated, 'createExampleArticle')).toEqual({
				slug: 'd-yoga',
				title: 'Yoga',
			})

			const directRows = await invoke(minimal.ExampleArticle, 'findMany', [
				{
					take: 10,
					orderBy: { slug: 'asc' },
					select: { slug: true, title: true },
				},
			])
			if (!Array.isArray(directRows)) {
				throw new TypeError('Direct article query must return an array')
			}
			const directJson = await Promise.all(directRows.map(modelJson))

			const restRead = await requireClient().fetch(`${articlePath}/query`, {
				body: JSON.stringify({
					take: 10,
					orderBy: { slug: 'asc' },
					select: { slug: true, title: true },
				}),
				headers: { 'Content-Type': 'application/json' },
				method: 'POST',
			})
			const restRows = readRecord(
				await restRead.json(),
				'REST response',
			).results

			const query = `query Articles {
			findManyExampleArticle(first: 10, orderBy: [{ field: slug, direction: ASC }]) {
				nodes { slug title }
			}
		}`
			const networklessRead = readRecord(
				readGraphqlField(
					await executeMinimalGraphql(app, query, 'parity-networkless-read'),
					'findManyExampleArticle',
				),
				'networkless connection',
			).nodes
			const yogaRead = readRecord(
				readGraphqlField(
					await graphqlHttp(requireClient(), query),
					'findManyExampleArticle',
				),
				'Yoga connection',
			).nodes

			const expected = [
				{ slug: 'a-direct', title: 'Direct' },
				{ slug: 'b-rest', title: 'REST' },
				{ slug: 'c-networkless', title: 'Networkless' },
				{ slug: 'd-yoga', title: 'Yoga' },
			]
			expect(normalizedRows(directJson)).toEqual(expected)
			expect(normalizedRows(restRows)).toEqual(expected)
			expect(normalizedRows(networklessRead)).toEqual(expected)
			expect(normalizedRows(yogaRead)).toEqual(expected)
		}, 30_000)

		it('preserves operation, authority, exposure, and safe selection boundaries', async () => {
			const app = requireApplication()
			const anonymousRest = await requireClient().fetch(operationPath, {
				body: JSON.stringify({ input: null }),
				headers: { 'Content-Type': 'application/json' },
				method: 'POST',
			})
			expect(await anonymousRest.json()).toStrictEqual({
				result: { authority: 'anonymous', principalId: null },
			})

			const statusQuery = '{ status { authority principalId } }'
			const networkless = readGraphqlField(
				await executeMinimalGraphql(app, statusQuery, 'parity-status'),
				'status',
			)
			const yoga = readGraphqlField(
				await graphqlHttp(requireClient(), statusQuery),
				'status',
			)
			expect(networkless).toEqual({ authority: 'anonymous', principalId: null })
			expect(yoga).toEqual(networkless)

			const address = listener?.address()
			if (typeof address !== 'object' || address === null) {
				throw new TypeError('Parity listener address is unavailable')
			}
			const baseUrl = `http://127.0.0.1:${String(address.port)}`
			const password = 'correct horse battery staple'
			const signUpMutation = `mutation SignUp($input: PasswordSignUpInput!) {
			signUp(input: $input) {
				user { id }
				session { token }
			}
		}`
			const signedUp = readRecord(
				readGraphqlField(
					await graphqlHttp(requireClient(), signUpMutation, {
						input: { password, username: 'parity-user' },
					}),
					'signUp',
				),
				'GraphQL sign-up',
			)
			const user = readRecord(signedUp.user, 'GraphQL user')
			expect(signedUp).not.toHaveProperty('principal')
			const session = readRecord(signedUp.session, 'GraphQL session')
			if (typeof user.id !== 'string' || typeof session.token !== 'string') {
				throw new TypeError('GraphQL sign-up result is incomplete')
			}
			const sessionClient = requireExample().createMinimalClient({
				applicationId: appId,
				baseUrl,
				sessionToken: session.token,
			})
			const authenticatedRest = await sessionClient.fetch(operationPath, {
				body: JSON.stringify({ input: null }),
				headers: { 'Content-Type': 'application/json' },
				method: 'POST',
			})
			expect(await authenticatedRest.json()).toStrictEqual({
				result: { authority: 'anonymous', principalId: user.id },
			})
			expect(
				readGraphqlField(
					await graphqlHttp(sessionClient, statusQuery),
					'status',
				),
			).toEqual({ authority: 'anonymous', principalId: user.id })

			const invalidLogin = await graphqlHttp(
				requireClient(),
				`mutation Login($input: PasswordLoginInput!) {
				login(input: $input) { user { id } }
			}`,
				{ input: { password: 'wrong password', username: 'parity-user' } },
			)
			expect(invalidLogin).toMatchObject({
				errors: [{ extensions: { code: 'AUTH_INVALID_CREDENTIALS' } }],
			})
			expect(JSON.stringify(invalidLogin)).not.toContain('wrong password')

			const refreshed = readRecord(
				readGraphqlField(
					await graphqlHttp(
						sessionClient,
						'mutation { refresh { session { token } } }',
					),
					'refresh',
				),
				'GraphQL refresh',
			)
			const refreshedSession = readRecord(
				refreshed.session,
				'GraphQL refreshed session',
			)
			if (typeof refreshedSession.token !== 'string') {
				throw new TypeError('GraphQL refresh token is unavailable')
			}
			expect(refreshedSession.token).not.toBe(session.token)
			const refreshedClient = requireExample().createMinimalClient({
				applicationId: appId,
				baseUrl,
				sessionToken: refreshedSession.token,
			})
			expect(
				readGraphqlField(
					await graphqlHttp(refreshedClient, 'mutation { logout { revoked } }'),
					'logout',
				),
			).toEqual({ revoked: true })

			const cookieLogin = await requireClient().fetch('/api/auth/login', {
				body: JSON.stringify({ password, username: 'parity-user' }),
				headers: {
					'Content-Type': 'application/json',
					Origin: 'http://localhost:5173',
				},
				method: 'POST',
			})
			expect(cookieLogin.status).toBe(200)
			const cookie = cookieLogin.headers.get('Set-Cookie')?.split(';', 1)[0]
			if (cookie === undefined)
				throw new TypeError('Login cookie is unavailable')
			expect(JSON.stringify(await cookieLogin.json())).not.toContain('ub_s1.')
			const cookieStatus = await requireClient().fetch('/graphql', {
				body: JSON.stringify({ query: statusQuery }),
				headers: {
					'Content-Type': 'application/json',
					Cookie: cookie,
					Origin: 'http://localhost:5173',
				},
				method: 'POST',
			})
			expect(readGraphqlField(await cookieStatus.json(), 'status')).toEqual({
				authority: 'anonymous',
				principalId: user.id,
			})

			const master = requireExample().createMinimalClient({
				applicationId: appId,
				baseUrl,
				masterKey,
			})
			const masterStatus = readGraphqlField(
				await graphqlHttp(master, statusQuery),
				'status',
			)
			expect(masterStatus).toEqual({ authority: 'master', principalId: null })
			expect(audits).toContainEqual(
				expect.objectContaining({ keyId: appId, source: 'ultimabase.graphql' }),
			)

			const hiddenTypes = await executeMinimalGraphql(
				app,
				'{ user: __type(name: "ExampleUser") { name } role: __type(name: "ExampleRole") { name } query: __type(name: "Query") { fields { name } } mutation: __type(name: "Mutation") { fields { name } } }',
				'parity-private-schema',
			)
			const exposure = readRecord(
				readRecord(hiddenTypes, 'private schema response').data,
				'private schema data',
			)
			// The User type exists for authentication results, without CRUD roots.
			expect(exposure.user).toEqual({ name: 'ExampleUser' })
			expect(exposure.role).toEqual({ name: 'ExampleRole' })
			expect(JSON.stringify([exposure.query, exposure.mutation])).not.toMatch(
				/(?:get|find|count|exists|create|update|delete|upsert).*Example(?:Role|User)/u,
			)

			// ADR-0323: without the header a request reaches the only application.
			const missingApp = await fetch(`${baseUrl}/graphql`, {
				body: JSON.stringify({ query: statusQuery }),
				headers: { 'Content-Type': 'application/json' },
				method: 'POST',
			})
			expect(missingApp.status).toBe(200)
			const unknownApp = await fetch(`${baseUrl}/graphql`, {
				body: JSON.stringify({ query: statusQuery }),
				headers: {
					'Content-Type': 'application/json',
					'X-UltimaBase-Application-Id': 'unknown-app',
				},
				method: 'POST',
			})
			expect(unknownApp.status).toBe(404)

			const invalidSecret = 'must-not-appear-in-errors'
			const rejected = await requireExample()
				.createMinimalClient({
					applicationId: appId,
					baseUrl,
					masterKey: invalidSecret,
				})
				.fetch('/graphql', {
					body: JSON.stringify({ query: statusQuery }),
					headers: { 'Content-Type': 'application/json' },
					method: 'POST',
				})
			expect(rejected.status).toBe(401)
			expect(await rejected.text()).not.toContain(invalidSecret)
		}, 30_000)
	},
)
