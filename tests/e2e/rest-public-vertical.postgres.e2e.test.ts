import { serve, type ServerType } from '@hono/node-server'
import { ACL } from '@ultimabase/acl-permissions-plugin'
import type { MasterAccessEvent } from '@ultimabase/core'
import { honoServerPlugin } from '@ultimabase/server-hono-plugin'
import { Hono } from 'hono'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../fixtures/postgres-worker-fixture.js'
import {
	invoke,
	loadMinimalExample,
	modelJson,
	readObject,
	readString,
	type MinimalApplication,
	type MinimalExampleModule,
	type MinimalClient,
} from './rest-public-vertical-support.js'

const firstAppId = 'rest-public-first'
const secondAppId = 'rest-public-second'
const auditFailureAppId = 'rest-public-audit-failure'
const disabledMasterAppId = 'rest-public-disabled-master'
const firstMasterKey = 'first-rest-master-secret'
const secondMasterKey = 'second-rest-master-secret'
const articlePath = '/api/v1/classes/ExampleArticle'
const authorPath = '/api/v1/classes/ExampleAuthor'
const operationPath = '/api/v1/operations/example.status'

let firstFixture: PostgresWorkerFixture | undefined
let secondFixture: PostgresWorkerFixture | undefined
let example: MinimalExampleModule | undefined
let firstApplication: MinimalApplication | undefined
let createFirstApplication: (() => MinimalApplication) | undefined
let secondApplication: MinimalApplication | undefined
let auditFailureApplication: MinimalApplication | undefined
let disabledMasterApplication: MinimalApplication | undefined
let listener: ServerType | undefined
let baseUrl = ''
const firstAudits: MasterAccessEvent[] = []
const secondAudits: MasterAccessEvent[] = []

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

const requireApplication = (
	application: MinimalApplication | undefined,
	name: string,
): MinimalApplication => {
	if (application === undefined) {
		throw new TypeError(`${name} REST application is unavailable`)
	}
	return application
}

const responseJson = async (response: Response): Promise<unknown> =>
	response.json()

const jsonRequest = (
	client: MinimalClient,
	path: string,
	method: 'PATCH' | 'POST',
	body: unknown,
): Promise<Response> =>
	client.fetch(path, {
		body: JSON.stringify(body),
		headers: { 'Content-Type': 'application/json' },
		method,
	})

const requireExample = (): MinimalExampleModule => {
	if (example === undefined) {
		throw new TypeError('Minimal REST example is unavailable')
	}
	return example
}

beforeAll(async () => {
	example = await loadMinimalExample()
	const minimal = requireExample()
	const [createdFirstFixture, createdSecondFixture] = await Promise.all([
		createPostgresWorkerFixture({ prefix: 'rest_public_first' }),
		createPostgresWorkerFixture({ prefix: 'rest_public_second' }),
	])
	firstFixture = createdFirstFixture
	secondFixture = createdSecondFixture
	const hono = new Hono()
	const sharedServer = honoServerPlugin({
		app: hono,
		browserPolicyOwner: 'ultimabase',
	})
	createFirstApplication = () =>
		minimal.createMinimalApplication({
			applicationId: firstAppId,
			databaseUrl: createdFirstFixture.connectionUri,
			masterKey: firstMasterKey,
			onMasterUse: (event) => {
				firstAudits.push(event)
			},
			server: sharedServer,
		})
	firstApplication = createFirstApplication()
	secondApplication = minimal.createMinimalApplication({
		applicationId: secondAppId,
		databaseUrl: createdSecondFixture.connectionUri,
		masterKey: secondMasterKey,
		onMasterUse: (event) => {
			secondAudits.push(event)
		},
		server: sharedServer,
	})
	auditFailureApplication = minimal.createMinimalApplication({
		applicationId: auditFailureAppId,
		databaseUrl: createdSecondFixture.connectionUri,
		masterKey: 'audit-failure-secret',
		onMasterUse: () => {
			throw new Error('private audit sink failure')
		},
		server: sharedServer,
	})
	disabledMasterApplication = minimal.createMinimalApplication({
		applicationId: disabledMasterAppId,
		databaseUrl: createdSecondFixture.connectionUri,
		masterKey: 'disabled-master-secret',
		masterTransport: false,
		onMasterUse: () => undefined,
		server: sharedServer,
	})
	await firstApplication.start()
	listener = await startServer(hono)
	const address = listener.address()
	if (typeof address !== 'object' || address === null) {
		throw new TypeError('REST public listener address is unavailable')
	}
	baseUrl = `http://127.0.0.1:${String(address.port)}`
}, 30_000)

afterAll(async () => {
	if (listener !== undefined) await closeServer(listener)
	await Promise.allSettled([
		firstApplication?.dispose(),
		secondApplication?.dispose(),
		auditFailureApplication?.dispose(),
		disabledMasterApplication?.dispose(),
	])
	await Promise.allSettled([firstFixture?.dispose(), secondFixture?.dispose()])
})

describe(
	'public REST client to PostgreSQL vertical',
	{ concurrent: false },
	() => {
		it('matches direct Runtime across CRUD, query, relationships, and bulk', async () => {
			const minimal = requireExample()
			const anonymous = minimal.createMinimalClient({
				applicationId: firstAppId,
				baseUrl,
			})
			const authorResponse = await jsonRequest(anonymous, authorPath, 'POST', {
				name: 'Ada',
			})
			expect(authorResponse.status).toBe(201)
			const authorBody = (await responseJson(authorResponse)) as {
				readonly result: Readonly<{ readonly id: string }>
			}
			const authorId = authorBody.result.id

			const createdResponse = await jsonRequest(
				anonymous,
				`${articlePath}?select=id,title`,
				'POST',
				{
					author: { connect: authorId },
					slug: 'public-one',
					title: '  Public one  ',
				},
			)
			expect(createdResponse.status).toBe(201)
			const createdBody = (await responseJson(createdResponse)) as {
				readonly result: Readonly<{
					readonly id: string
					readonly title: string
				}>
			}
			expect(createdBody.result.title).toBe('Public one')
			const articleId = createdBody.result.id

			const legacyPointer = await jsonRequest(
				anonymous,
				`${articlePath}/${articleId}`,
				'PATCH',
				{
					author: {
						className: 'ExampleAuthor',
						id: authorId,
						type: 'pointer',
					},
				},
			)
			expect(legacyPointer.status).toBe(400)
			expect(await responseJson(legacyPointer)).toMatchObject({
				error: { code: 'REST_MUTATION_INVALID_INPUT' },
			})

			const duplicateRelation = await jsonRequest(
				anonymous,
				`${articlePath}/${articleId}`,
				'PATCH',
				{
					contributors: { connect: [authorId, authorId] },
				},
			)
			expect(duplicateRelation.status).toBe(422)
			expect(await responseJson(duplicateRelation)).toMatchObject({
				error: { code: 'VALIDATION_ERROR' },
			})

			const article = await invoke(minimal.ExampleArticle, 'findOne', [
				{ where: { id: { eq: articleId } } },
				{ useMasterKey: true },
			])
			if (article === null)
				throw new TypeError('Created REST article is missing')
			const relation = await invoke(
				readObject(article, 'created article'),
				'relation',
				['contributors'],
			)
			await invoke(readObject(relation, 'contributors relation'), 'connect', [
				authorId,
				{ useMasterKey: true },
			])

			const queryInput = {
				include: {
					author: { select: { name: true } },
					contributors: { select: { name: true } },
				},
				limit: 5,
				offset: 0,
				orderBy: { title: 'asc' },
				select: { author: true, slug: true, title: true },
				where: { slug: { eq: 'public-one' } },
			} as const
			const queryResponse = await jsonRequest(
				anonymous,
				`${articlePath}/query`,
				'POST',
				queryInput,
			)
			expect(queryResponse.status).toBe(200)
			const queryBody = await responseJson(queryResponse)
			const direct = await invoke(minimal.ExampleArticle, 'findMany', [
				queryInput,
			])
			if (!Array.isArray(direct)) {
				throw new TypeError('Direct Runtime query must return an array')
			}
			const directBody = {
				results: await Promise.all(direct.map(modelJson)),
			}
			expect(JSON.stringify(queryBody)).toBe(JSON.stringify(directBody))
			expect(queryBody).toMatchObject({
				results: [
					{
						author: { name: 'Ada' },
						contributors: [{ name: 'Ada' }],
						title: 'Public one',
					},
				],
			})

			const count = await anonymous.fetch(`${articlePath}/count`)
			expect(await responseJson(count)).toStrictEqual({ count: 1 })
			const first = await jsonRequest(
				anonymous,
				`${articlePath}/first`,
				'POST',
				{ where: { id: { eq: articleId } } },
			)
			expect(await responseJson(first)).toMatchObject({
				result: { id: articleId },
			})
			const exists = await jsonRequest(
				anonymous,
				`${articlePath}/exists`,
				'POST',
				{ where: { id: { eq: articleId } } },
			)
			expect(await responseJson(exists)).toStrictEqual({ exists: true })

			const updated = await jsonRequest(
				anonymous,
				`${articlePath}/${articleId}?select=id,title`,
				'PATCH',
				{ title: 'Updated title' },
			)
			expect(updated.status).toBe(200)
			expect(await responseJson(updated)).toMatchObject({
				result: { title: 'Updated title' },
			})
			const upserted = await jsonRequest(
				anonymous,
				`${articlePath}/upsert`,
				'POST',
				{
					create: { slug: 'public-one', title: 'Unused' },
					update: { title: 'Upserted title' },
					where: { slug: { eq: 'public-one' } },
				},
			)
			expect(upserted.status).toBe(200)
			expect(await responseJson(upserted)).toMatchObject({
				result: { title: 'Upserted title' },
			})
			const deleteCandidate = await jsonRequest(
				anonymous,
				articlePath,
				'POST',
				{
					slug: 'delete-one',
					title: 'Delete one',
				},
			)
			const deleteCandidateBody = readObject(
				await responseJson(deleteCandidate),
				'delete candidate response',
			)
			const deleteCandidateResult = readObject(
				Reflect.get(deleteCandidateBody, 'result'),
				'delete candidate',
			)
			const deleted = await anonymous.fetch(
				`${articlePath}/${readString(deleteCandidateResult, 'id')}?select=slug`,
				{ method: 'DELETE' },
			)
			const deletedBody = await responseJson(deleted)
			expect({ body: deletedBody, status: deleted.status }).toMatchObject({
				body: { result: { slug: 'delete-one' } },
				status: 200,
			})

			const bulkCreated = await jsonRequest(
				anonymous,
				`${articlePath}/bulk/create`,
				'POST',
				{
					data: [
						{ slug: 'bulk-a', title: 'Bulk A' },
						{ slug: 'bulk-b', title: 'Bulk B' },
					],
					select: { slug: true },
				},
			)
			expect(bulkCreated.status).toBe(201)
			expect(await responseJson(bulkCreated)).toMatchObject({
				results: [{ slug: 'bulk-a' }, { slug: 'bulk-b' }],
			})
			const bulkDeleted = await jsonRequest(
				anonymous,
				`${articlePath}/bulk/delete`,
				'POST',
				{
					select: { slug: true },
					where: [{ slug: { eq: 'bulk-a' } }, { slug: { eq: 'bulk-b' } }],
				},
			)
			expect(bulkDeleted.status).toBe(200)
			expect(await responseJson(bulkDeleted)).toMatchObject({
				results: [{ slug: 'bulk-a' }, { slug: 'bulk-b' }],
			})

			const invalid = await jsonRequest(anonymous, articlePath, 'POST', {
				slug: 'invalid-title',
				title: 'x',
			})
			expect(invalid.status).toBe(422)
			expect(await responseJson(invalid)).toMatchObject({
				error: { code: 'VALIDATION_ERROR' },
			})
		})

		it('binds browser, application, Master, operation, and isolation boundaries', async () => {
			const minimal = requireExample()
			const first = minimal.createMinimalClient({
				applicationId: firstAppId,
				baseUrl,
			})
			const firstMaster = minimal.createMinimalClient({
				applicationId: firstAppId,
				baseUrl,
				masterKey: firstMasterKey,
			})
			const second = minimal.createMinimalClient({
				applicationId: secondAppId,
				baseUrl,
			})

			const preflight = await fetch(`${baseUrl}${articlePath}`, {
				headers: {
					'Access-Control-Request-Headers':
						'Content-Type, X-UltimaBase-Application-Id, X-UltimaBase-Master-Key',
					'Access-Control-Request-Method': 'POST',
					Origin: 'http://localhost:5173',
				},
				method: 'OPTIONS',
			})
			expect(preflight.status).toBe(204)
			expect(preflight.headers.get('access-control-allow-origin')).toBe(
				'http://localhost:5173',
			)

			const directHidden = readObject(
				await invoke(minimal.ExampleArticle, 'createOne', [
					{
						data: {
							acl: new ACL(),
							published: false,
							slug: 'master-only',
							title: 'Master only',
						},
					},
					{
						useMasterKey: true,
					},
				]),
				'hidden article',
			)
			const directHiddenId = readString(directHidden, 'id')
			const anonymousHidden = await first.fetch(
				`${articlePath}/${directHiddenId}`,
			)
			expect(anonymousHidden.status).toBe(404)

			const masterRequestId = 'rest-public-master-request'
			const masterHidden = await firstMaster.fetch(
				`${articlePath}/${directHiddenId}?select=id,slug,title,published`,
				{ headers: { 'X-UltimaBase-Request-Id': masterRequestId } },
			)
			expect(masterHidden.status).toBe(200)
			expect(await responseJson(masterHidden)).toMatchObject({
				result: { published: false, slug: 'master-only' },
			})
			expect(firstAudits).toContainEqual(
				expect.objectContaining({
					keyId: firstAppId,
					requestId: masterRequestId,
					source: 'ultimabase.rest',
				}),
			)

			const anonymousOperation = await jsonRequest(
				first,
				operationPath,
				'POST',
				{ input: null },
			)
			expect(await responseJson(anonymousOperation)).toStrictEqual({
				result: { authority: 'anonymous', principalId: null },
			})
			const masterOperation = await jsonRequest(
				firstMaster,
				operationPath,
				'POST',
				{ input: null },
			)
			expect(await responseJson(masterOperation)).toStrictEqual({
				result: { authority: 'master', principalId: null },
			})

			await requireApplication(firstApplication, 'first').dispose()
			await requireApplication(secondApplication, 'second').start()
			const secondCreated = await jsonRequest(second, articlePath, 'POST', {
				slug: 'second-only',
				title: 'Second only',
			})
			expect(secondCreated.status).toBe(201)
			const foreignMasterRejected = await minimal
				.createMinimalClient({
					applicationId: secondAppId,
					baseUrl,
					masterKey: firstMasterKey,
				})
				.fetch(operationPath, {
					body: JSON.stringify({ input: null }),
					headers: { 'Content-Type': 'application/json' },
					method: 'POST',
				})
			await requireApplication(secondApplication, 'second').dispose()
			if (createFirstApplication === undefined)
				throw new TypeError('First application factory is unavailable')
			firstApplication = createFirstApplication()
			await firstApplication.start()
			const isolated = await jsonRequest(
				first,
				`${articlePath}/query`,
				'POST',
				{ where: { slug: { eq: 'second-only' } } },
			)
			expect(await responseJson(isolated)).toStrictEqual({ results: [] })
			expect(secondAudits).toStrictEqual([])

			const forged = await jsonRequest(first, articlePath, 'POST', {
				access: { mode: 'master' },
				slug: 'forged-authority',
				title: 'Forged authority',
				useMasterKey: true,
			})
			expect(forged.status).toBe(422)
			const forgedLookup = await jsonRequest(
				firstMaster,
				`${articlePath}/query`,
				'POST',
				{ where: { slug: { eq: 'forged-authority' } } },
			)
			expect(await responseJson(forgedLookup)).toStrictEqual({ results: [] })
			const rejectedResponses = await Promise.all([
				fetch(`${baseUrl}${articlePath}`),
				fetch(`${baseUrl}${articlePath}`, {
					headers: { 'X-UltimaBase-Application-Id': 'missing-app' },
				}),
				minimal
					.createMinimalClient({
						applicationId: firstAppId,
						baseUrl,
						masterKey: 'invalid-master-secret',
					})
					.fetch(articlePath),
			])
			rejectedResponses.push(foreignMasterRejected)
			await firstApplication.dispose()
			await requireApplication(auditFailureApplication, 'audit failure').start()
			rejectedResponses.push(
				await minimal
					.createMinimalClient({
						applicationId: auditFailureAppId,
						baseUrl,
						masterKey: 'audit-failure-secret',
					})
					.fetch(articlePath),
			)
			await requireApplication(
				auditFailureApplication,
				'audit failure',
			).dispose()
			await requireApplication(
				disabledMasterApplication,
				'disabled Master',
			).start()
			rejectedResponses.push(
				await minimal
					.createMinimalClient({
						applicationId: disabledMasterAppId,
						baseUrl,
						masterKey: 'disabled-master-secret',
					})
					.fetch(articlePath),
			)
			await requireApplication(
				disabledMasterApplication,
				'disabled Master',
			).dispose()
			for (const response of rejectedResponses) {
				const serialized = await response.text()
				expect(response.status).toBe(401)
				expect(serialized).toContain('HTTP_APPLICATION_REJECTED')
				expect(serialized).not.toMatch(
					/first-rest-master-secret|invalid-master-secret|audit-failure-secret|disabled-master-secret|private audit/u,
				)
			}
		})
	},
)
