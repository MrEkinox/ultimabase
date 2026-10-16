import {
	UltimaBase,
	applicationRequestExecutionCapability,
	type ApplicationRequestExecutor,
} from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { isPlainRecord } from '@ultimabase/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { graphqlPlugin } from '../../src/plugin.js'
import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../../../../tests/fixtures/postgres-worker-fixture.js'
import {
	type RequestContext,
	defineCapability,
	plugin,
	provideCapability,
	requireCapability,
	type ApplicationCallbackExecutor,
	type PluginIdentity,
} from '@ultimabase/core/plugin'

// No policy plugin: the fixture opts into public writes (ADR-0294).
const GraphqlSchemaApplication = UltimaBase.use(
	graphqlPlugin({ publicWrites: true }),
)
const RelayRecord = GraphqlSchemaApplication.Schema.define({
	className: 'GraphqlRelayPostgresRecord',
	fields: (field) => ({
		label: field.string({ required: true }),
		rank: field.int({ required: true }),
	}),
}).with((plugins) => plugins.graphql(true))

interface ExecutionHarness {
	callbacks?: ApplicationCallbackExecutor
	executor?: ApplicationRequestExecutor
	owner?: PluginIdentity
}

const requestExecutionRequirement = requireCapability(
	applicationRequestExecutionCapability,
	'^1.0.0',
)
const harnessCapability = defineCapability<
	Readonly<{ readonly ready: true }>
>()({
	capabilityId: 'fixture.graphql-relay-postgres-harness',
	version: '1.0.0',
	cardinality: 'single',
	lifetime: 'application',
	compose: ([value]) => value,
})

const createHarnessPlugin = (harness: ExecutionHarness) =>
	plugin({
		core: '^0.0.0',
		id: 'fixture.graphql-relay-postgres-harness',
		version: '1.0.0',
		contributions: [
			provideCapability(harnessCapability, {
				contributionId: 'capture',
				create: ({ callbacks, capabilities, owner }) => {
					harness.callbacks = callbacks
					harness.executor = capabilities.get(requestExecutionRequirement)
					harness.owner = owner
					return { value: { ready: true } }
				},
			}),
			requestExecutionRequirement,
		],
	})

const readHarness = (harness: ExecutionHarness) => {
	if (
		harness.callbacks === undefined ||
		harness.executor === undefined ||
		harness.owner === undefined
	) {
		throw new TypeError('GraphQL PostgreSQL execution harness is unavailable')
	}
	return {
		callbacks: harness.callbacks,
		executor: harness.executor,
		owner: harness.owner,
	}
}

const runAsHarness = <TResult>(
	harness: ExecutionHarness,
	callback: (executor: ApplicationRequestExecutor) => TResult,
): TResult => {
	const ready = readHarness(harness)
	return ready.callbacks.runPlugin(ready.owner, () => callback(ready.executor))
}

const readPage = (data: unknown) => {
	if (!isPlainRecord(data)) throw new TypeError('Missing GraphQL response data')
	const page = data.findManyGraphqlRelayPostgresRecord
	if (!isPlainRecord(page)) throw new TypeError('Missing GraphQL connection')
	const pageInfo = page.pageInfo
	if (!isPlainRecord(pageInfo)) throw new TypeError('Missing GraphQL page info')
	return { page, pageInfo }
}

let fixture: PostgresWorkerFixture | undefined
let context: RequestContext | undefined
let expectedLabels: readonly string[] = []
const harness: ExecutionHarness = {}

const createPostgresApplication = (connectionUri: string) => {
	const Application = GraphqlSchemaApplication.use(
		createHarnessPlugin(harness),
	).use(postgresPlugin({ schemaPolicy: 'override', url: connectionUri }))
	return new Application({
		logger: false,
		schemas: [RelayRecord],
	})
}

let application: ReturnType<typeof createPostgresApplication> | undefined

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture({ prefix: 'graphql_relay' })
	application = createPostgresApplication(fixture.connectionUri)
	await application.start()
	context = runAsHarness(harness, (executor) =>
		executor.createAnonymousContext({
			requestId: 'graphql-relay-postgres',
			source: 'ultimabase.graphql',
		}),
	)
	const created = await RelayRecord.createMany(
		{
			data: [
				{ label: 'equal-a', rank: 3 },
				{ label: 'equal-b', rank: 3 },
				{ label: 'lower', rank: 2 },
				{ label: 'last', rank: 1 },
			],
			select: { id: true, label: true, rank: true },
		},
		{ context },
	)
	const sortable = created.map(({ id, label, rank }) => {
		if (typeof label !== 'string' || typeof rank !== 'number') {
			throw new TypeError('GraphQL PostgreSQL record is malformed')
		}
		return { id, label, rank }
	})
	expectedLabels = sortable
		.sort(
			(left, right) =>
				right.rank - left.rank || left.id.localeCompare(right.id),
		)
		.map(({ label }) => label)
}, 30_000)

afterAll(async () => {
	await application?.dispose()
	await fixture?.dispose()
})

describe(
	'GraphQL Relay pagination with PostgreSQL',
	{ concurrent: false },
	() => {
		it('executes stable duplicate ordering across boundary and empty pages', async () => {
			if (application === undefined || context === undefined) {
				throw new TypeError('GraphQL PostgreSQL fixture is unavailable')
			}
			const requestContext = context
			const graphqlApplication = application.plugin(
				'@ultimabase/graphql-plugin',
			)
			const executePage = async (after?: string) =>
				graphqlApplication.execute({
					context: requestContext,
					document: `
					query Page($after: String) {
						findManyGraphqlRelayPostgresRecord(
							after: $after
							first: 2
							orderBy: [{ field: rank, direction: DESC }]
						) {
							nodes { id label rank }
							edges { cursor node { id } }
							pageInfo { endCursor hasNextPage hasPreviousPage startCursor }
						}
					}
					`,
					variables: after === undefined ? {} : { after },
				})

			const firstResult = await executePage()
			expect(firstResult.errors).toBeUndefined()
			const first = readPage(firstResult.data)
			expect(first.page.nodes).toEqual([
				expect.objectContaining({ label: expectedLabels[0], rank: 3 }),
				expect.objectContaining({ label: expectedLabels[1], rank: 3 }),
			])
			expect(first.pageInfo).toMatchObject({
				hasNextPage: true,
				hasPreviousPage: false,
			})
			if (typeof first.pageInfo.endCursor !== 'string') {
				throw new TypeError('Expected first GraphQL cursor')
			}

			const secondResult = await executePage(first.pageInfo.endCursor)
			expect(secondResult.errors).toBeUndefined()
			const second = readPage(secondResult.data)
			expect(second.page.nodes).toEqual([
				expect.objectContaining({ label: 'lower', rank: 2 }),
				expect.objectContaining({ label: 'last', rank: 1 }),
			])
			expect(second.pageInfo).toMatchObject({
				hasNextPage: false,
				hasPreviousPage: true,
			})
			if (typeof second.pageInfo.endCursor !== 'string') {
				throw new TypeError('Expected second GraphQL cursor')
			}

			const emptyResult = await executePage(second.pageInfo.endCursor)
			expect(emptyResult.errors).toBeUndefined()
			expect(readPage(emptyResult.data)).toMatchObject({
				page: { edges: [], nodes: [] },
				pageInfo: {
					endCursor: null,
					hasNextPage: false,
					hasPreviousPage: true,
					startCursor: null,
				},
			})
		}, 30_000)
	},
)
