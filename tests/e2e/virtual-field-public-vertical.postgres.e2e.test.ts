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

const appId = 'virtual-field-public-vertical'
const articlePath = '/api/v1/classes/ExampleArticle'
const masterKey = 'virtual-field-public-master-secret'
const virtualSelection =
	'id,displayTitle,labels,optionalSubtitle,summary,viewerLabel'

let application: MinimalApplication | undefined
let baseUrl: string | undefined
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

const requireBaseUrl = (): string => {
	if (baseUrl === undefined) throw new TypeError('Server URL is unavailable')
	return baseUrl
}

const requireClient = (): MinimalClient => {
	if (client === undefined) throw new TypeError('Client is unavailable')
	return client
}

const requireExample = (): MinimalExampleModule => {
	if (example === undefined) throw new TypeError('Example is unavailable')
	return example
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

const nestedArticleInput = (slug: string, contributor: string) => ({
	contributors: { create: [{ name: contributor }] },
	presentation: {
		subtitle: 'A public virtual field',
		tags: ['public', 'virtual'],
	},
	slug,
	title: '  Virtual result  ',
})

const expectedVirtualResult = (slug: string, id: string) => ({
	displayTitle: 'Article: Virtual result',
	id,
	labels: ['public', 'virtual'],
	optionalSubtitle: 'A public virtual field',
	summary: {
		labels: ['public', 'virtual'],
		subtitle: 'A public virtual field',
		title: 'Virtual result',
	},
	viewerLabel: `anonymous:${slug}`,
})

const virtualMutation = `mutation Create($input: ExampleArticleCreateInput!) {
	createExampleArticle(input: $input) {
		id
		displayTitle
		labels
		optionalSubtitle
		summary { labels subtitle title }
		viewerLabel
	}
}`

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture({ prefix: 'virtual_public' })
	example = await loadMinimalExample()
	const hono = new Hono()
	application = requireExample().createMinimalApplication({
		applicationId: appId,
		databaseUrl: fixture.connectionUri,
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
	baseUrl = `http://127.0.0.1:${String(address.port)}`
	client = requireExample().createMinimalClient({
		applicationId: appId,
		baseUrl,
	})
}, 30_000)

afterAll(async () => {
	if (listener !== undefined) await closeServer(listener)
	await application?.dispose()
	await fixture?.dispose()
})

describe('public virtual-field vertical', { concurrent: false }, () => {
	it('returns one nested mutation result through every public entry point', async () => {
		const minimal = requireExample()
		const app = requireApplication()
		const directSlug = 'a-virtual-direct'
		const direct = await invoke(minimal.ExampleArticle, 'createOne', [
			{
				data: nestedArticleInput(directSlug, 'Direct virtual contributor'),
				select: {
					displayTitle: true,
					labels: true,
					optionalSubtitle: true,
					summary: true,
					viewerLabel: true,
				},
			},
			{ ultimabase: app },
		])
		const directJson = readRecord(await modelJson(direct), 'direct result')
		expect(directJson).toStrictEqual(
			expectedVirtualResult(directSlug, readString(directJson, 'id')),
		)

		const restSlug = 'b-virtual-rest'
		const restResponse = await requireClient().fetch(
			`${articlePath}?select=${virtualSelection}`,
			{
				body: JSON.stringify(
					nestedArticleInput(restSlug, 'REST virtual contributor'),
				),
				headers: { 'Content-Type': 'application/json' },
				method: 'POST',
			},
		)
		expect(restResponse.status).toBe(201)
		const rest = readRecord(
			readRecord(await restResponse.json(), 'REST envelope').result,
			'REST result',
		)
		expect(rest).toStrictEqual(
			expectedVirtualResult(restSlug, readString(rest, 'id')),
		)

		const networklessSlug = 'c-virtual-networkless'
		const networkless = readRecord(
			readGraphqlField(
				await executeMinimalGraphql(
					app,
					virtualMutation,
					'virtual-public-networkless',
					{
						input: nestedArticleInput(
							networklessSlug,
							'Networkless virtual contributor',
						),
					},
				),
				'createExampleArticle',
			),
			'networkless result',
		)
		expect(networkless).toEqual(
			expectedVirtualResult(networklessSlug, readString(networkless, 'id')),
		)

		const yogaSlug = 'd-virtual-yoga'
		const yoga = readRecord(
			readGraphqlField(
				await graphqlHttp(requireClient(), virtualMutation, {
					input: nestedArticleInput(yogaSlug, 'Yoga virtual contributor'),
				}),
				'createExampleArticle',
			),
			'Yoga result',
		)
		expect(yoga).toEqual(
			expectedVirtualResult(yogaSlug, readString(yoga, 'id')),
		)

		const contributors = await invoke(minimal.ExampleAuthor, 'findMany', [
			{
				orderBy: { name: 'asc' },
				select: { name: true },
				where: { name: { endsWith: 'virtual contributor' } },
			},
			{ ultimabase: app },
		])
		if (!Array.isArray(contributors)) {
			throw new TypeError('Contributor query must return an array')
		}
		expect(
			contributors.map((value) => readString(value, 'name')),
		).toStrictEqual([
			'Direct virtual contributor',
			'Networkless virtual contributor',
			'REST virtual contributor',
			'Yoga virtual contributor',
		])
	}, 30_000)

	it('uses exact anonymous, authenticated, and audited Master contexts', async () => {
		const minimal = requireExample()
		const slug = 'virtual-context'
		const created = await invoke(minimal.ExampleArticle, 'createOne', [
			{
				data: { slug, title: 'Context title' },
				select: { id: true },
			},
			{ ultimabase: requireApplication() },
		])
		const articleId = readString(created, 'id')

		const anonymous = await requireClient().fetch(
			`${articlePath}/${articleId}?select=id,viewerLabel`,
		)
		expect(anonymous.status).toBe(200)
		expect(await anonymous.json()).toStrictEqual({
			result: { id: articleId, viewerLabel: `anonymous:${slug}` },
		})

		const denied = await requireClient().fetch(
			`${articlePath}/${articleId}?select=authenticatedTitle`,
		)
		expect(denied.status).toBe(200)
		const deniedBody = await denied.text()
		expect(JSON.parse(deniedBody)).toStrictEqual({ result: { id: articleId } })
		expect(deniedBody).not.toContain('Context title')

		const signUp = readRecord(
			readGraphqlField(
				await graphqlHttp(
					requireClient(),
					`mutation SignUp($input: PasswordAuthSignUpInput!) {
						signUp(input: $input) { session { token } }
					}`,
					{
						input: {
							password: 'correct horse battery staple',
							username: 'virtual-public-user',
						},
					},
				),
				'signUp',
			),
			'sign-up result',
		)
		const token = readString(signUp.session, 'token')
		const authenticatedClient = minimal.createMinimalClient({
			applicationId: appId,
			baseUrl: requireBaseUrl(),
			sessionToken: token,
		})
		const authenticated = await authenticatedClient.fetch(
			`${articlePath}/${articleId}?select=id,authenticatedTitle,viewerLabel`,
		)
		expect(authenticated.status).toBe(200)
		expect(await authenticated.json()).toStrictEqual({
			result: {
				authenticatedTitle: 'Context title',
				id: articleId,
				viewerLabel: `authenticated:${slug}`,
			},
		})

		const masterClient = minimal.createMinimalClient({
			applicationId: appId,
			baseUrl: requireBaseUrl(),
			masterKey,
		})
		const master = await masterClient.fetch(
			`${articlePath}/${articleId}?select=id,authenticatedTitle,viewerLabel`,
		)
		expect(master.status).toBe(200)
		expect(await master.json()).toStrictEqual({
			result: {
				authenticatedTitle: 'Context title',
				id: articleId,
				viewerLabel: `master:${slug}`,
			},
		})
	}, 30_000)

	it('keeps stable order across more than two async resolver batches', async () => {
		const minimal = requireExample()
		const batchSize = 33
		await invoke(minimal.ExampleArticle, 'createMany', [
			{
				data: Array.from({ length: batchSize }, (_, index) => ({
					presentation: { tags: [`tag-${String(index).padStart(2, '0')}`] },
					slug: `virtual-batch-${String(index).padStart(2, '0')}`,
					title: `Batch ${String(index).padStart(2, '0')}`,
				})),
				select: { id: true },
			},
			{ ultimabase: requireApplication() },
		])

		const rows = await invoke(minimal.ExampleArticle, 'findMany', [
			{
				limit: batchSize,
				orderBy: { slug: 'asc' },
				select: { summary: true },
				where: { slug: { startsWith: 'virtual-batch-' } },
			},
			{ ultimabase: requireApplication() },
		])
		if (!Array.isArray(rows))
			throw new TypeError('Batch query must return an array')
		const summaries = rows.map((value) => {
			const summary = readRecord(
				readRecord(value, 'batch row').summary,
				'summary',
			)
			return {
				labels: summary.labels,
				title: summary.title,
			}
		})
		expect(summaries).toStrictEqual(
			Array.from({ length: batchSize }, (_, index) => ({
				labels: [`tag-${String(index).padStart(2, '0')}`],
				title: `Batch ${String(index).padStart(2, '0')}`,
			})),
		)
	}, 30_000)
})
