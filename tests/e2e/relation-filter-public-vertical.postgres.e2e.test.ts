import type { ServerType } from '@hono/node-server'
import { getCurrentRequest, type RequestContext } from '@ultimabase/core'
import { ACL } from '@ultimabase/acl-permissions-plugin'
import { honoServerPlugin } from '@ultimabase/server-hono-plugin'
import { Hono } from 'hono'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../fixtures/postgres-worker-fixture.js'
import { RecordingPostgresPool } from '../fixtures/recording-postgres-pool.js'
import {
	closeServer,
	readArray,
	readConnection,
	readGraphqlData,
	readGraphqlField,
	readRecord,
	readRestArticle,
	relationChecksQuery,
	relationNames,
	relationQuery,
	startServer,
} from './relation-filter-public-support.js'
import {
	invoke,
	loadMinimalExample,
	readObject,
	readString,
	type MinimalApplication,
	type MinimalClient,
	type MinimalExampleModule,
} from './rest-public-vertical-support.js'

const applicationId = 'relation-filter-public'
const masterKey = 'relation-filter-public-master'
const articlePath = '/api/v1/classes/ExampleArticle'
const publicAcl = new ACL().grantPublic('delete', 'read', 'update')
const privateAcl = new ACL()

let fixture: PostgresWorkerFixture | undefined
let pool: RecordingPostgresPool | undefined
let example: MinimalExampleModule | undefined
let application: MinimalApplication | undefined
let listener: ServerType | undefined
let anonymousClient: MinimalClient | undefined
let masterClient: MinimalClient | undefined
let sessionClient: MinimalClient | undefined
let sessionToken = ''
let articleId = ''
let unlistedAuthorId = ''

const minimal = (): MinimalExampleModule => {
	if (example === undefined)
		throw new TypeError('Minimal example is unavailable')
	return example
}

const app = (): MinimalApplication => {
	if (application === undefined)
		throw new TypeError('Application is unavailable')
	return application
}

const recorder = (): RecordingPostgresPool => {
	if (pool === undefined) throw new TypeError('Recording pool is unavailable')
	return pool
}

const client = (kind: 'anonymous' | 'master' | 'session'): MinimalClient => {
	const selected =
		kind === 'anonymous'
			? anonymousClient
			: kind === 'master'
				? masterClient
				: sessionClient
	if (selected === undefined)
		throw new TypeError(`${kind} client is unavailable`)
	return selected
}

const createContext = async (
	kind: 'anonymous' | 'master',
): Promise<RequestContext> => {
	const anonymous = readObject(
		await invoke(app(), 'anonymous', [
			{
				requestId: `relation-filter-${kind}`,
				source: 'internal',
			},
		]),
		'anonymous request engine',
	)
	if (kind === 'anonymous') {
		return readObject(
			Reflect.get(anonymous, 'context'),
			'anonymous context',
		) as RequestContext
	}
	const grant = await invoke(app(), 'authorizeMasterKey', [masterKey])
	const master = readObject(
		await invoke(anonymous, 'useMasterKey', [
			grant,
			'Prove relation shaping under Master authority',
		]),
		'master request engine',
	)
	return readObject(
		Reflect.get(master, 'context'),
		'master context',
	) as RequestContext
}

const graphqlHttp = async (
	kind: 'anonymous' | 'master' | 'session',
	document: string,
	variables?: Readonly<Record<string, unknown>>,
): Promise<unknown> => {
	const response = await client(kind).fetch('/graphql', {
		body: JSON.stringify({ query: document, variables }),
		headers: { 'Content-Type': 'application/json' },
		method: 'POST',
	})
	expect(response.status).toBe(200)
	return response.json()
}

const graphqlApplication = async (): Promise<object> =>
	readObject(
		await invoke(app(), 'plugin', ['@ultimabase/graphql-plugin']),
		'GraphQL application',
	)

const graphqlNetworkless = async (
	kind: 'anonymous' | 'master' | 'session',
	document: string,
	variables?: Readonly<Record<string, unknown>>,
): Promise<unknown> => {
	const graphql = await graphqlApplication()
	const execute = () =>
		invoke(graphql, 'execute', [
			{
				context: getCurrentRequest(),
				document,
				...(variables === undefined ? {} : { variables }),
			},
		])
	if (kind === 'session') {
		const auth = readObject(
			await invoke(app(), 'plugin', ['@ultimabase/password-auth-plugin']),
			'Password Auth application',
		)
		return invoke(auth, 'runWithSession', [sessionToken, execute])
	}
	const context = await createContext(kind)
	return invoke(graphql, 'execute', [
		{
			context,
			document,
			...(variables === undefined ? {} : { variables }),
		},
	])
}

const findRelation = async (
	model: object,
	field: string,
	input: Readonly<Record<string, unknown>> | undefined,
	context: RequestContext,
): Promise<unknown> => {
	const relation = readObject(
		await invoke(model, 'relation', [field]),
		`${field} relation`,
	)
	return invoke(relation, 'findMany', [input, { context }])
}

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture({
		prefix: 'relation_filter_public',
	})
	pool = new RecordingPostgresPool(fixture.pool)
	example = await loadMinimalExample()
	const hono = new Hono()
	application = minimal().createMinimalApplication({
		applicationId,
		databasePool: pool,
		masterKey,
		onMasterUse: () => undefined,
		server: honoServerPlugin({ app: hono, browserPolicyOwner: 'ultimabase' }),
	})
	await application.start()
	listener = await startServer(hono)
	const address = listener.address()
	if (typeof address !== 'object' || address === null) {
		throw new TypeError('Relation-filter listener address is unavailable')
	}
	const baseUrl = `http://127.0.0.1:${String(address.port)}`
	const clientOptions = { applicationId, baseUrl }

	anonymousClient = minimal().createMinimalClient(clientOptions)
	masterClient = minimal().createMinimalClient({ ...clientOptions, masterKey })
	const signedUp = readRecord(
		readGraphqlField(
			await graphqlHttp(
				'anonymous',
				`mutation SignUp($input: PasswordAuthSignUpInput!) {
					signUp(input: $input) { session { token } }
				}`,
				{
					input: {
						password: 'correct horse battery staple',
						username: 'relation-filter-user',
					},
				},
			),
			'signUp',
		),
		'sign-up',
	)
	sessionToken = readString(
		readObject(signedUp.session, 'sign-up session'),
		'token',
	)
	sessionClient = minimal().createMinimalClient({
		...clientOptions,
		sessionToken,
	})

	const master = await createContext('master')
	const createdAuthors = readArray(
		await invoke(minimal().ExampleAuthor, 'createMany', [
			{
				data: [
					{ acl: publicAcl, name: 'A Public' },
					{
						acl: publicAcl,
						audience: 'authenticated',
						name: 'B Authenticated',
					},
					{ acl: publicAcl, listed: false, name: 'C Unlisted' },
					{ acl: publicAcl, name: 'D Access hidden', readable: false },
					{ acl: privateAcl, name: 'E ACL hidden' },
				],
			},
			{ context: master },
		]),
		'created authors',
	).map((author) => readObject(author, 'created author'))
	if (createdAuthors.length !== 5) {
		throw new TypeError('Relation-filter author fixtures are incomplete')
	}
	const authorIds = createdAuthors.map((author) => readString(author, 'id'))
	const unlistedAuthor = createdAuthors[2]
	if (unlistedAuthor === undefined) {
		throw new TypeError('Unlisted author fixture is unavailable')
	}
	unlistedAuthorId = readString(unlistedAuthor, 'id')
	const article = readObject(
		await invoke(minimal().ExampleArticle, 'createOne', [
			{
				data: { acl: publicAcl, slug: 'relation-main', title: 'Relation main' },
				select: { id: true },
			},
			{ context: master },
		]),
		'created article',
	)
	articleId = readString(article, 'id')
	for (const field of ['contributors', 'reviewers']) {
		const relation = readObject(
			await invoke(article, 'relation', [field]),
			`${field} relation`,
		)
		await invoke(relation, 'connect', [authorIds, { context: master }])
	}
	await invoke(minimal().ExampleArticle, 'createOne', [
		{
			data: {
				acl: publicAcl,
				author: { connect: authorIds[0] },
				contributors: { connect: [authorIds[0]] },
				published: false,
				slug: 'relation-unpublished',
				title: 'Relation unpublished',
			},
		},
		{ context: master },
	])
	await invoke(minimal().ExampleArticle, 'createOne', [
		{
			data: {
				acl: publicAcl,
				contributors: { connect: [authorIds[0]] },
				slug: 'relation-second',
				title: 'Relation second',
			},
		},
		{ context: master },
	])
}, 30_000)

afterAll(async () => {
	if (listener !== undefined) await closeServer(listener)
	await application?.dispose()
	await fixture?.dispose()
})

describe(
	'public contextual relation-filter vertical',
	{ concurrent: false },
	() => {
		it('aligns direct rows, cardinality, predicates, inverses, and grouped includes', async () => {
			const anonymous = await createContext('anonymous')
			const article = readObject(
				await invoke(minimal().ExampleArticle, 'findOne', [
					{ select: { id: true }, where: { id: { eq: articleId } } },
					{ context: anonymous },
				]),
				'relation article',
			)
			const callerQuery = {
				take: 10,
				orderBy: { name: 'asc' },
				select: { name: true },
				where: { name: { contains: ' ' } },
			}
			expect(
				relationNames(
					await findRelation(article, 'contributors', callerQuery, anonymous),
				),
			).toStrictEqual(['A Public', 'B Authenticated'])
			expect(
				relationNames(
					await findRelation(article, 'reviewers', callerQuery, anonymous),
				),
			).toStrictEqual(['A Public', 'C Unlisted'])
			const contributors = readObject(
				await invoke(article, 'relation', ['contributors']),
				'contributors relation',
			)
			expect(
				await invoke(contributors, 'count', [
					undefined,
					{ context: anonymous },
				]),
			).toBe(2)
			expect(
				await invoke(contributors, 'exists', [
					{ where: { name: { eq: 'C Unlisted' } } },
					{ context: anonymous },
				]),
			).toBe(false)
			expect(
				await invoke(minimal().ExampleArticle, 'exists', [
					{
						where: {
							id: { eq: articleId },
							contributors: { count: { eq: 2 } },
							reviewers: { every: { audience: { eq: 'public' } } },
						},
					},
					{ context: anonymous },
				]),
			).toBe(true)

			const publicAuthor = readObject(
				await invoke(minimal().ExampleAuthor, 'findOne', [
					{ where: { name: { eq: 'A Public' } } },
					{ context: anonymous },
				]),
				'public author',
			)
			for (const [field, expected] of [
				['articles', 0],
				['contributions', 2],
			] as const) {
				const relation = readObject(
					await invoke(publicAuthor, 'relation', [field]),
					`${field} relation`,
				)
				expect(
					await invoke(relation, 'count', [undefined, { context: anonymous }]),
				).toBe(expected)
			}

			recorder().reset()
			const included = readArray(
				await invoke(minimal().ExampleArticle, 'findMany', [
					{
						include: {
							contributors: {
								orderBy: { name: 'asc' },
								select: { name: true },
							},
						},
						orderBy: { slug: 'asc' },
						select: { slug: true },
					},
					{ context: anonymous },
				]),
				'included articles',
			)
			expect(recorder().selectCount()).toBe(1)
			expect(
				included.map((item) =>
					relationNames(readRecord(item, 'included article').contributors),
				),
			).toStrictEqual([['A Public', 'B Authenticated'], ['A Public']])
		})

		it('returns identical contextual pages through REST, networkless GraphQL, and Yoga', async () => {
			const expectedReviewers = {
				anonymous: ['A Public', 'C Unlisted'],
				master: ['A Public', 'C Unlisted', 'D Access hidden', 'E ACL hidden'],
				session: ['A Public', 'B Authenticated', 'C Unlisted'],
			} as const
			for (const kind of ['anonymous', 'session', 'master'] as const) {
				const rest = await readRestArticle(client(kind), articlePath, articleId)
				expect(relationNames(rest.contributors)).toStrictEqual([
					'B Authenticated',
				])
				expect(relationNames(rest.reviewers)).toStrictEqual(
					expectedReviewers[kind],
				)

				const variables = { id: articleId }
				const networkless = readGraphqlField(
					await graphqlNetworkless(kind, relationQuery, variables),
					'getExampleArticle',
				)
				const yoga = readGraphqlField(
					await graphqlHttp(kind, relationQuery, variables),
					'getExampleArticle',
				)
				expect(yoga).toEqual(networkless)
				expect(readConnection(networkless, 'reviewers').names).toStrictEqual(
					expectedReviewers[kind],
				)
			}

			const first = readGraphqlField(
				await graphqlNetworkless('anonymous', relationQuery, { id: articleId }),
				'getExampleArticle',
			)
			const page = readConnection(first, 'contributors')
			expect(typeof page.endCursor).toBe('string')
			expect(page).toMatchObject({
				hasNextPage: true,
				names: ['A Public'],
			})
			// A relation connection has no `after` position (ADR-0309).
			const nestedAfter = await graphqlNetworkless(
				'anonymous',
				`query { getExampleArticle(id: "${articleId}") { contributors(after: "${String(page.endCursor)}") { nodes { name } } } }`,
				{},
			)
			expect(readRecord(nestedAfter, 'GraphQL response').errors).toBeDefined()

			const restCount = await client('anonymous').fetch(
				`${articlePath}/count`,
				{
					body: JSON.stringify({
						where: {
							contributors: { count: { eq: 2 } },
							id: { eq: articleId },
						},
					}),
					headers: { 'Content-Type': 'application/json' },
					method: 'POST',
				},
			)
			expect(await restCount.json()).toStrictEqual({ count: 1 })
			const restExists = await client('anonymous').fetch(
				`${articlePath}/exists`,
				{
					body: JSON.stringify({
						where: {
							id: { eq: articleId },
							reviewers: { some: { name: { eq: 'C Unlisted' } } },
						},
					}),
					headers: { 'Content-Type': 'application/json' },
					method: 'POST',
				},
			)
			expect(await restExists.json()).toStrictEqual({ exists: true })
			const variables = { id: articleId }
			const graphqlChecks = readGraphqlData(
				await graphqlNetworkless('anonymous', relationChecksQuery, variables),
			)
			expect(graphqlChecks).toMatchObject({
				countExampleArticle: 1,
				existsExampleArticle: true,
			})
			expect(
				readGraphqlData(
					await graphqlHttp('anonymous', relationChecksQuery, variables),
				),
			).toEqual(graphqlChecks)
		})

		it('keeps physical writes independent from filtered mutation projections', async () => {
			const master = await createContext('master')
			const created = readObject(
				await invoke(minimal().ExampleArticle, 'createOne', [
					{
						data: {
							acl: publicAcl,
							contributors: { connect: [unlistedAuthorId] },
							slug: 'relation-hidden-edge',
							title: 'Relation hidden edge',
						},
						include: { contributors: { select: { name: true } } },
						select: { slug: true },
					},
					{ context: master },
				]),
				'created hidden-edge article',
			)
			expect(readRecord(created, 'created article').contributors).toStrictEqual(
				[],
			)

			const database = fixture
			if (database === undefined) throw new TypeError('Database is unavailable')
			const tables = await database.pool.query<{ readonly table_name: string }>(
				`select table_name from information_schema.columns
			 where table_schema = $1 and column_name in ('source_id', 'target_id')
			 and table_name like '%contributors%'
			 group by table_name having count(*) = 2`,
				[database.schemaName],
			)
			const tableName = tables.rows[0]?.table_name
			if (tableName === undefined)
				throw new TypeError('Join table is unavailable')
			const quotedTable = `"${tableName.replaceAll('"', '""')}"`
			const createdId = readString(created, 'id')
			const countEdges = () =>
				database.pool.query<{ readonly count: string }>(
					`select count(*)::text as count from ${quotedTable} where source_id = $1 and target_id = $2`,
					[createdId, unlistedAuthorId],
				)
			expect((await countEdges()).rows).toStrictEqual([{ count: '1' }])
			const relation = readObject(
				await invoke(created, 'relation', ['contributors']),
				'created contributors relation',
			)
			await invoke(relation, 'disconnect', [
				unlistedAuthorId,
				{ context: master },
			])
			expect((await countEdges()).rows).toStrictEqual([{ count: '0' }])
		})
	},
)
