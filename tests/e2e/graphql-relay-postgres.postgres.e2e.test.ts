import {
	Schema,
	UltimaBase,
	applicationRequestExecutionCapability,
	defineCapability,
	definePlugin,
	provideCapability,
	requireCapability,
	type ApplicationCallbackExecutor,
	type ApplicationRequestExecutor,
	type PluginIdentity,
	type RequestContext,
} from '@ultimabase/core'
import type { GraphqlSchemaExposureOption } from '@ultimabase/graphql-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { isPlainRecord } from '@ultimabase/shared'
import { graphql, type GraphQLResolveInfo } from 'graphql'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { readGraphqlConnectionRuntime } from '../../packages/graphql-plugin/src/application.js'
import { graphqlPlugin } from '../../packages/graphql-plugin/src/plugin.js'
import { normalizeGraphqlReadOperation } from '../../packages/graphql-plugin/src/read-normalization.js'
import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from './postgres-worker-fixture.js'

declare module '@ultimabase/core' {
	interface UltimaBaseGeneratedSchemaOptions {
		readonly graphql?: GraphqlSchemaExposureOption
	}
}

const RelayRecord = Schema.define({
	className: 'GraphqlRelayPostgresRecord',
	fields: (field) => ({
		label: field.string({ required: true }),
		rank: field.int({ required: true }),
	}),
	graphql: true,
})

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
	definePlugin({
		core: '^0.0.0',
		pluginId: 'fixture.graphql-relay-postgres-harness',
		version: '1.0.0',
		capabilities: {
			requires: [requestExecutionRequirement],
			provides: [
				provideCapability(harnessCapability, {
					contributionId: 'capture',
					create: ({ callbacks, capabilities, owner }) => {
						harness.callbacks = callbacks
						harness.executor = capabilities.get(requestExecutionRequirement)
						harness.owner = owner
						return { value: { ready: true } }
					},
				}),
			],
		},
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

const createPostgresApplication = (connectionUri: string) =>
	new UltimaBase({
		pluginPrivileges: { logger: false },
		plugins: [
			graphqlPlugin(),
			createHarnessPlugin(harness),
			postgresPlugin({
				schemaPolicy: 'override',
				url: connectionUri,
			}),
		],
		schemas: [RelayRecord],
	})

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
		{ context, ultimabase: application },
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
			const graphqlApplication = application.application.getPlugin(
				'@ultimabase/graphql-plugin',
			)
			const connections = readGraphqlConnectionRuntime(graphqlApplication)
			const executePage = async (after?: string) =>
				graphql({
					schema: graphqlApplication.schema,
					source: `
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
					variableValues: after === undefined ? {} : { after },
					rootValue: {
						findManyGraphqlRelayPostgresRecord: async (
							args: Readonly<Record<string, unknown>>,
							_context: unknown,
							info: GraphQLResolveInfo,
						) => {
							const operation = normalizeGraphqlReadOperation(
								RelayRecord,
								'findMany',
								args,
								info,
								{ connections },
							)
							const rows = await runAsHarness(harness, (executor) =>
								executor.executeRead(requestContext, operation),
							)
							const prepared = connections.prepare({
								arguments: args,
								relationPath: [],
								schema: RelayRecord,
								typeName: 'GraphqlRelayPostgresRecord',
							})
							return connections.page(prepared.page, rows)
						},
					},
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
