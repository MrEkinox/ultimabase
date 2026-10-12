import { serve, type ServerType } from '@hono/node-server'
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
	readObject,
	readString,
	type MinimalApplication,
	type MinimalClient,
	type MinimalExampleModule,
} from './rest-public-vertical-support.js'

const applicationId = 'soft-delete-public-vertical'
const masterKey = 'soft-delete-public-vertical-master'
const articlePath = '/api/classes/ExampleArticle'

let fixture: PostgresWorkerFixture | undefined
let example: MinimalExampleModule | undefined
let application: MinimalApplication | undefined
let client: MinimalClient | undefined
let listener: ServerType | undefined

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

const graphqlHttp = async (
	requestClient: MinimalClient,
	query: string,
	variables?: Readonly<Record<string, unknown>>,
): Promise<Readonly<Record<string, unknown>>> => {
	const response = await requestClient.fetch('/graphql', {
		body: JSON.stringify({ query, variables }),
		headers: { 'Content-Type': 'application/json' },
		method: 'POST',
	})
	expect(response.status).toBe(200)
	return readObject(await response.json(), 'GraphQL response') as Readonly<
		Record<string, unknown>
	>
}

const graphqlData = (
	response: Readonly<Record<string, unknown>>,
	field: string,
): unknown => {
	expect(response.errors).toBeUndefined()
	return Reflect.get(readObject(response.data, 'GraphQL data'), field)
}

const readArray = (value: unknown, label: string): readonly unknown[] => {
	if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`)
	return value as readonly unknown[]
}

const readValue = (value: object, key: string): unknown =>
	Reflect.get(value, key) as unknown

const createArticle = async (slug: string): Promise<string> => {
	const created = readObject(
		await invoke(requireExample().ExampleArticle, 'createOne', [
			{ data: { slug, title: slug } },
		]),
		'created article',
	)
	return readString(created, 'id')
}

const readSessionToken = (
	response: Readonly<Record<string, unknown>>,
): string => {
	const signUp = readObject(graphqlData(response, 'signUp'), 'sign-up result')
	return readString(
		readObject(Reflect.get(signUp, 'session'), 'session'),
		'token',
	)
}

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture({ prefix: 'soft_delete_public' })
	example = await loadMinimalExample()
	const hono = new Hono()
	application = requireExample().createMinimalApplication({
		applicationId,
		databaseUrl: fixture.connectionUri,
		masterKey,
		onMasterUse: () => undefined,
		server: honoServerPlugin({ app: hono, browserPolicyOwner: 'ultimabase' }),
	})
	await application.start()
	listener = await startServer(hono)
	const address = listener.address()
	if (typeof address !== 'object' || address === null) {
		throw new TypeError('Soft-delete listener address is unavailable')
	}
	client = requireExample().createMinimalClient({
		applicationId,
		baseUrl: `http://127.0.0.1:${String(address.port)}`,
	})
}, 30_000)

afterAll(async () => {
	if (listener !== undefined) await closeServer(listener)
	await application?.dispose()
	await fixture?.dispose()
})

describe('documented official soft-delete public vertical', () => {
	it('publishes the one-row request commands and keeps purge private', async () => {
		const rest = readObject(
			await invoke(requireApplication(), 'plugin', ['@ultimabase/rest-plugin']),
			'REST application',
		)
		const routeGraph = readObject(
			Reflect.get(rest, 'routeGraph'),
			'route graph',
		)
		const routes = readArray(readValue(routeGraph, 'routes'), 'REST routes')
		const schemaMutationPaths = routes
			.filter(
				(route): route is Readonly<Record<string, unknown>> =>
					typeof route === 'object' &&
					route !== null &&
					readValue(route, 'kind') === 'rest-schema-mutation-route',
			)
			.map((route) => readValue(route, 'path'))
			.sort()
		// Restore routes exist but Access refuses them (`restoreOne: false`).
		expect(schemaMutationPaths).toStrictEqual([
			'/api/classes/ExampleArticle/{id}/restore-one',
			'/api/classes/ExampleArticle/{id}/soft-delete-one',
			'/api/classes/ExampleAuthor/{id}/restore-one',
			'/api/classes/ExampleAuthor/{id}/soft-delete-one',
		])

		const graphql = readObject(
			await invoke(requireApplication(), 'plugin', [
				'@ultimabase/graphql-plugin',
			]),
			'GraphQL application',
		)
		const sdl = await invoke(graphql, 'printSchema', [])
		expect(sdl).toEqual(expect.any(String))
		expect(sdl).toContain('softDeleteOneExampleArticle(')
		expect(sdl).toContain('softDeleteOneExampleAuthor(')
		expect(sdl).not.toContain('softDeleteOneExamplePrivateNote')
		expect(sdl).not.toMatch(/purge(?:One|Many)Example/u)
		expect(sdl).not.toMatch(/(?:softDelete|restore)ManyExample/u)
	})

	it('joins Access, Hooks, direct calls, REST, GraphQL, Yoga, and PostgreSQL', async () => {
		const minimal = requireExample()
		const app = requireApplication()
		const deniedId = await createArticle('anonymous-denied')
		const deniedRest = await requireClient().fetch(
			`${articlePath}/${deniedId}/soft-delete-one`,
			{
				body: JSON.stringify({ select: { id: true } }),
				headers: { 'Content-Type': 'application/json' },
				method: 'POST',
			},
		)
		expect(deniedRest.status).toBe(403)
		expect(await deniedRest.json()).toMatchObject({
			error: { code: 'PERMISSION_DENIED', retryable: false },
		})

		const deniedGraphql = readObject(
			await executeMinimalGraphql(
				app,
				`mutation Denied($id: ID!) {
					softDeleteOneExampleArticle(input: { id: $id }) { id }
				}`,
				'soft-delete-networkless-denied',
				{ id: deniedId },
			),
			'networkless GraphQL response',
		)
		expect(deniedGraphql).toMatchObject({
			errors: [{ extensions: { code: 'PERMISSION_DENIED' } }],
		})

		const sessionToken = readSessionToken(
			await graphqlHttp(
				requireClient(),
				`mutation SignUp($input: PasswordAuthSignUpInput!) {
					signUp(input: $input) { session { token } }
				}`,
				{
					input: {
						password: 'correct horse battery staple',
						username: 'soft-delete-user',
					},
				},
			),
		)
		const authenticated = minimal.createMinimalClient({
			applicationId,
			baseUrl: requireClientBaseUrl(),
			sessionToken,
		})

		const schemaId = await createArticle('direct-schema')
		const modelId = await createArticle('direct-model')
		const restId = await createArticle('rest-explicit')
		const yogaId = await createArticle('yoga-explicit')
		await expect(
			minimal.softDeleteArticle(app, schemaId, sessionToken),
		).resolves.toMatchObject({ id: schemaId, isDeleted: true })
		// ADR-0310: results have no methods; the class command deletes this row too.
		await expect(
			minimal.softDeleteArticle(app, modelId, sessionToken),
		).resolves.toMatchObject({ id: modelId, isDeleted: true })

		const restDeleted = await authenticated.fetch(
			`${articlePath}/${restId}/soft-delete-one`,
			{
				body: JSON.stringify({ select: { id: true, isDeleted: true } }),
				headers: { 'Content-Type': 'application/json' },
				method: 'POST',
			},
		)
		expect(restDeleted.status).toBe(200)
		expect(await restDeleted.json()).toMatchObject({
			result: { id: restId, isDeleted: true },
		})

		const yogaDeleted = await graphqlHttp(
			authenticated,
			`mutation SoftDelete($id: ID!) {
				softDeleteOneExampleArticle(input: { id: $id }) { id isDeleted }
			}`,
			{ id: yogaId },
		)
		expect(graphqlData(yogaDeleted, 'softDeleteOneExampleArticle')).toEqual({
			id: yogaId,
			isDeleted: true,
		})

		const hidden = await invoke(minimal.ExampleArticle, 'findMany', [
			{
				where: { id: { in: [schemaId, modelId, restId, yogaId] } },
			},
		])
		expect(hidden).toStrictEqual([])

		await expect(minimal.restoreArticle(schemaId)).resolves.toMatchObject({
			id: schemaId,
			isDeleted: false,
		})
		await expect(minimal.purgeArticle(modelId)).resolves.toMatchObject({
			id: modelId,
			isDeleted: true,
		})

		const hardDeleteId = await createArticle('retained-hard-delete')
		const hardDeleted = await requireClient().fetch(
			`${articlePath}/${hardDeleteId}`,
			{ method: 'DELETE' },
		)
		expect(hardDeleted.status).toBe(200)

		const author = readObject(
			await invoke(minimal.ExampleAuthor, 'createOne', [
				{ data: { name: 'Replace mode author' } },
			]),
			'created author',
		)
		const authorId = readString(author, 'id')
		await expect(minimal.softDeleteAuthor(authorId)).resolves.toMatchObject({
			id: authorId,
		})
		const storedAuthor = await fixture?.pool.query<{ isDeleted: boolean }>(
			`select is_deleted as "isDeleted" from example_authors where id = $1`,
			[authorId],
		)
		expect(storedAuthor?.rows).toStrictEqual([{ isDeleted: true }])

		const events = readArray(
			await invoke(minimal.ExampleSoftDeleteEvent, 'findMany', [
				{
					orderBy: { createdAt: 'asc' },
					select: {
						logicalOperation: true,
						persistenceEffect: true,
						schemaName: true,
						targetId: true,
					},
				},
				{ useMasterKey: true },
			]),
			'Audit events',
		)
		const observed = events.map((event) => {
			const record = readObject(event, 'audit event')
			return [
				readValue(record, 'logicalOperation'),
				readValue(record, 'persistenceEffect'),
				readValue(record, 'schemaName'),
				readValue(record, 'targetId'),
			]
		})
		expect(observed).toEqual(
			expect.arrayContaining([
				['softDeleteOne', 'update', 'ExampleArticle', schemaId],
				['softDeleteOne', 'update', 'ExampleArticle', modelId],
				['softDeleteOne', 'update', 'ExampleArticle', restId],
				['softDeleteOne', 'update', 'ExampleArticle', yogaId],
				['restoreOne', 'update', 'ExampleArticle', schemaId],
				['purgeOne', 'delete', 'ExampleArticle', modelId],
				['delete', 'delete', 'ExampleArticle', hardDeleteId],
				['delete', 'update', 'ExampleAuthor', authorId],
			]),
		)
		expect(observed.filter((entry) => entry[3] === schemaId)).toHaveLength(2)
		expect(observed.filter((entry) => entry[3] === modelId)).toHaveLength(2)
	})
})

const requireClientBaseUrl = (): string => {
	const address = listener?.address()
	if (typeof address !== 'object' || address === null) {
		throw new TypeError('Soft-delete listener address is unavailable')
	}
	return `http://127.0.0.1:${String(address.port)}`
}
