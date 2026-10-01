import { serve, type ServerType } from '@hono/node-server'
import { honoServerPlugin } from '@ultimabase/server-hono-plugin'
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

const appId = 'nested-write-public-vertical'
const articlePath = '/api/v1/classes/ExampleArticle'
const masterKey = 'nested-write-public-master-secret'

let application: MinimalApplication | undefined
let client: MinimalClient | undefined
let example: MinimalExampleModule | undefined
let fixture: PostgresWorkerFixture | undefined
let listener: ServerType | undefined

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

const requireApplication = (): MinimalApplication => {
	if (application === undefined)
		throw new TypeError('Application is unavailable')
	return application
}

const requireClient = (): MinimalClient => {
	if (client === undefined) throw new TypeError('Client is unavailable')
	return client
}

const requireExample = (): MinimalExampleModule => {
	if (example === undefined) throw new TypeError('Example is unavailable')
	return example
}

const requireFixture = (): PostgresWorkerFixture => {
	if (fixture === undefined) throw new TypeError('Database is unavailable')
	return fixture
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

const readString = (value: unknown, key: string): string => {
	const entry = readRecord(value, 'record')[key]
	if (typeof entry !== 'string') throw new TypeError(`${key} must be a string`)
	return entry
}

const readGraphqlField = (value: unknown, field: string): unknown => {
	const envelope = readRecord(value, 'GraphQL response')
	if (envelope.errors !== undefined) {
		throw new TypeError(
			`GraphQL response failed: ${JSON.stringify(envelope.errors)}`,
		)
	}
	return readRecord(envelope.data, 'GraphQL data')[field]
}

const graphqlHttp = async (
	query: string,
	variables: Readonly<Record<string, unknown>>,
): Promise<unknown> => {
	const response = await requireClient().fetch('/graphql', {
		body: JSON.stringify({ query, variables }),
		headers: { 'Content-Type': 'application/json' },
		method: 'POST',
	})
	expect(response.status).toBe(200)
	return response.json()
}

const relationNodes = (value: unknown): readonly unknown[] => {
	if (Array.isArray(value)) return value
	const connection = readRecord(value, 'contributors connection')
	if (!Array.isArray(connection.nodes)) {
		throw new TypeError('Contributors must be an array or GraphQL connection')
	}
	return connection.nodes
}

const contributorId = (value: unknown, name: string): string => {
	const article = readRecord(value, 'article')
	const contributor = relationNodes(article.contributors)
		.map((item) => readRecord(item, 'contributor'))
		.find((item) => item.name === name)
	if (contributor === undefined) throw new TypeError(`${name} is unavailable`)
	return readString(contributor, 'id')
}

const normalizeArticle = (value: unknown) => {
	const article = readRecord(value, 'article')
	const author = readRecord(article.author, 'author')
	const contributors = relationNodes(article.contributors)
		.map((item) => readString(item, 'name'))
		.toSorted()
	return {
		author: readString(author, 'name'),
		contributors,
		slug: readString(article, 'slug'),
		title: readString(article, 'title'),
	}
}

const seedAuthor = async (name: string): Promise<string> => {
	const author = await invoke(requireExample().ExampleAuthor, 'createOne', [
		{ data: { name } },
	])
	return readString(author, 'id')
}

const createMutation = `mutation Create($input: ExampleArticleCreateInput!) {
	createExampleArticle(input: $input) {
		id slug title author { name }
		contributors(first: 10) { nodes { id name } }
	}
}`

const updateMutation = `mutation Update($input: ExampleArticleUpdateOneInput!) {
	updateExampleArticle(input: $input) {
		id slug title author { name }
		contributors(first: 10) { nodes { id name } }
	}
}`

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture({ prefix: 'nested_public' })
	example = await loadMinimalExample()
	const hono = new Hono()
	application = requireExample().createMinimalApplication({
		applicationId: appId,
		databaseUrl: requireFixture().connectionUri,
		masterKey,
		onMasterUse: () => undefined,
		server: honoServerPlugin({ app: hono, browserPolicyOwner: 'ultimabase' }),
	})
	await application.start()
	listener = await startServer(hono)
	const address = listener.address()
	if (typeof address !== 'object' || address === null) {
		throw new TypeError('Listener address is unavailable')
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

describe('public nested-write vertical', { concurrent: false }, () => {
	it('persists the same recursive aggregate through every public entry point', async () => {
		const app = requireApplication()
		const minimal = requireExample()

		const directAuthorId = await seedAuthor('Connected author')
		const directExistingId = await seedAuthor('Existing contributor')
		const directCreated = await invoke(minimal.ExampleArticle, 'createOne', [
			{
				data: {
					author: { connect: directAuthorId },
					contributors: {
						connect: [directExistingId],
						create: [{ name: 'Created contributor' }],
					},
					slug: 'a-direct',
					title: '  Aggregate  ',
				},
				include: { author: {}, contributors: {} },
			},
		])
		const directCreatedJson = await modelJson(directCreated)
		const directUpdated = await invoke(minimal.ExampleArticle, 'updateOne', [
			{
				data: {
					contributors: {
						disconnect: [directExistingId],
						update: [
							{
								data: { name: 'Updated contributor' },
								id: contributorId(directCreatedJson, 'Created contributor'),
							},
						],
					},
					title: '  Aggregate updated  ',
				},
				id: readString(directCreated, 'id'),
				include: { author: {}, contributors: {} },
			},
		])

		const restAuthorId = await seedAuthor('Connected author')
		const restExistingId = await seedAuthor('Existing contributor')
		const restCreatedResponse = await requireClient().fetch(
			`${articlePath}?include=author,contributors`,
			{
				body: JSON.stringify({
					author: { connect: restAuthorId },
					contributors: {
						connect: [restExistingId],
						create: [{ name: 'Created contributor' }],
					},
					slug: 'b-rest',
					title: '  Aggregate  ',
				}),
				headers: { 'Content-Type': 'application/json' },
				method: 'POST',
			},
		)
		expect(restCreatedResponse.status).toBe(201)
		const restCreated = readRecord(
			readRecord(await restCreatedResponse.json(), 'REST create').result,
			'REST article',
		)
		const restUpdatedResponse = await requireClient().fetch(
			`${articlePath}/${readString(restCreated, 'id')}?include=author,contributors`,
			{
				body: JSON.stringify({
					contributors: {
						disconnect: [restExistingId],
						update: [
							{
								data: { name: 'Updated contributor' },
								id: contributorId(restCreated, 'Created contributor'),
							},
						],
					},
					title: '  Aggregate updated  ',
				}),
				headers: { 'Content-Type': 'application/json' },
				method: 'PATCH',
			},
		)
		expect(restUpdatedResponse.status).toBe(200)
		const restUpdated = readRecord(
			readRecord(await restUpdatedResponse.json(), 'REST update').result,
			'REST article',
		)

		const networklessAuthorId = await seedAuthor('Connected author')
		const networklessExistingId = await seedAuthor('Existing contributor')
		const networklessCreated = readGraphqlField(
			await executeMinimalGraphql(
				app,
				createMutation,
				'nested-public-networkless-create',
				{
					input: {
						author: { connect: networklessAuthorId },
						contributors: {
							connect: [networklessExistingId],
							create: [{ name: 'Created contributor' }],
						},
						slug: 'c-networkless',
						title: '  Aggregate  ',
					},
				},
			),
			'createExampleArticle',
		)
		const networklessUpdated = readGraphqlField(
			await executeMinimalGraphql(
				app,
				updateMutation,
				'nested-public-networkless-update',
				{
					input: {
						data: {
							contributors: {
								disconnect: [networklessExistingId],
								update: [
									{
										data: { name: { set: 'Updated contributor' } },
										id: contributorId(
											networklessCreated,
											'Created contributor',
										),
									},
								],
							},
							title: { set: '  Aggregate updated  ' },
						},
						id: readString(networklessCreated, 'id'),
					},
				},
			),
			'updateExampleArticle',
		)

		const yogaAuthorId = await seedAuthor('Connected author')
		const yogaExistingId = await seedAuthor('Existing contributor')
		const yogaCreated = readGraphqlField(
			await graphqlHttp(createMutation, {
				input: {
					author: { connect: yogaAuthorId },
					contributors: {
						connect: [yogaExistingId],
						create: [{ name: 'Created contributor' }],
					},
					slug: 'd-yoga',
					title: '  Aggregate  ',
				},
			}),
			'createExampleArticle',
		)
		const yogaUpdated = readGraphqlField(
			await graphqlHttp(updateMutation, {
				input: {
					data: {
						contributors: {
							disconnect: [yogaExistingId],
							update: [
								{
									data: { name: { set: 'Updated contributor' } },
									id: contributorId(yogaCreated, 'Created contributor'),
								},
							],
						},
						title: { set: '  Aggregate updated  ' },
					},
					id: readString(yogaCreated, 'id'),
				},
			}),
			'updateExampleArticle',
		)

		const expected = {
			author: 'Connected author',
			contributors: ['Updated contributor'],
			title: 'Aggregate updated',
		}
		for (const [slug, result] of [
			['a-direct', await modelJson(directUpdated)],
			['b-rest', restUpdated],
			['c-networkless', networklessUpdated],
			['d-yoga', yogaUpdated],
		] as const) {
			expect(normalizeArticle(result)).toEqual({ ...expected, slug })
		}

		const persisted = await invoke(minimal.ExampleArticle, 'findMany', [
			{
				include: { author: {}, contributors: {} },
				limit: 10,
				orderBy: { slug: 'asc' },
			},
		])
		if (!Array.isArray(persisted))
			throw new TypeError('Articles are unavailable')
		const persistedJson = await Promise.all(persisted.map(modelJson))
		expect(persistedJson.map(normalizeArticle)).toEqual(
			['a-direct', 'b-rest', 'c-networkless', 'd-yoga'].map((slug) => ({
				...expected,
				slug,
			})),
		)
	}, 30_000)
})
