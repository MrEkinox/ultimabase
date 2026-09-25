import { onTestFinished } from 'vitest'
import {
	RequestContextValue,
	Schema,
	UltimaBase,
	databaseAdapterCapability,
	databasePersistencePlanCapability,
	definePlugin,
	provideCapability,
	type DatabaseAdapter,
	type DatabaseOperationAst,
	type DatabaseOperationRequest,
	type DatabaseOperationResult,
	type DatabaseTransactionAdapter,
} from '@ultimabase/core'
import { describe, expect, it } from 'vitest'

import { graphqlPlugin } from './index.js'

const objectId = '01991f00-0000-7000-8000-000000000702'
const viewer = new RequestContextValue<string>(
	'fixture.graphql-virtual.viewer',
	(value) => {
		if (typeof value !== 'string')
			throw new TypeError('Viewer must be a string')
		return value
	},
)

const VirtualRecord = Schema.define({
	className: 'GraphqlVirtualRecord',
	fields: (field) => ({
		title: field.string(),
		displayTitle: field.virtual({
			output: (output) => output.string({ nullable: false }),
			resolve: async ({ context, item }) => {
				await Promise.resolve()
				return `${String(item.title).toUpperCase()}:${context.getValue(viewer) ?? 'anonymous'}`
			},
			select: { title: true },
		}),
		details: field.virtual({
			output: (output) =>
				output.object({
					fields: (nested) => ({
						binary: nested.binary({ nullable: false }),
						huge: nested.bigint({ nullable: false }),
						tags: nested.string({ list: true, nullable: false }),
					}),
					nullable: false,
				}),
			resolve: () => ({
				binary: Uint8Array.from([1, 2, 3]),
				huge: 9_007_199_254_740_993n,
				tags: ['virtual', 'graphql'],
			}),
			select: { id: true },
		}),
		broken: field.virtual({
			output: (output) => output.string(),
			resolve: async () => {
				await Promise.resolve()
				throw new Error('private virtual resolver dependency secret')
			},
			select: { title: true },
		}),
		invalid: field.virtual({
			output: (output) => output.string(),
			resolve: () => 42 as unknown as string,
			select: { title: true },
		}),
		waiting: field.virtual({
			output: (output) => output.string(),
			resolve: ({ context }) =>
				new Promise<string>((_resolve, reject) => {
					context.signal.addEventListener(
						'abort',
						() => {
							reject(new Error(String(context.signal.reason)))
						},
						{ once: true },
					)
				}),
			select: { title: true },
		}),
	}),
})

class VirtualDatabase implements DatabaseAdapter {
	readonly kind = 'database-adapter' as const
	readonly capabilities = {
		persistencePlans: databasePersistencePlanCapability,
	}
	readonly operations: DatabaseOperationAst[] = []
	readonly selections: string[][] = []

	execute<const TOperation extends DatabaseOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): Promise<DatabaseOperationResult<TOperation>> {
		this.operations.push(request.operation)
		this.selections.push(
			request.plan.returning.selection.fields.map(({ field }) => field),
		)
		const row = { id: objectId, title: 'GraphQL virtual' }
		const result: unknown = request.operation.kind === 'find-many' ? [row] : row
		return Promise.resolve(result as DatabaseOperationResult<TOperation>)
	}

	beginTransaction(): Promise<DatabaseTransactionAdapter> {
		return Promise.reject(new TypeError('Virtual fixture does not mutate'))
	}
}

const databasePlugin = (adapter: DatabaseAdapter) =>
	definePlugin({
		core: '^0.0.0',
		pluginId: 'fixture.graphql-virtual-database',
		version: '1.0.0',
		capabilities: [
			provideCapability(databaseAdapterCapability, {
				contributionId: 'database',
				create: () => ({ value: adapter }),
			}),
		],
	})

const createFixture = async () => {
	const adapter = new VirtualDatabase()
	const application = new UltimaBase({
		pluginPrivileges: { logger: false },
		plugins: [
			databasePlugin(adapter),
			graphqlPlugin({ acknowledgeUnverifiedProtection: true }),
		],
		schemas: [VirtualRecord],
	})
	onTestFinished(() => application.dispose())
	await application.start()
	return {
		adapter,
		application,
		graphql: application.application.getPlugin('@ultimabase/graphql-plugin'),
	}
}

describe('GraphQL virtual networkless execution', () => {
	it('selects Core virtuals in connections and serializes nested output values', async () => {
		const fixture = await createFixture()
		const context = fixture.application.engine
			.anonymous({ requestId: 'graphql-virtual', source: 'test' })
			.context.withValue(viewer, 'member')
		const result = await fixture.graphql.execute({
			context,
			document: `query {
				findManyGraphqlVirtualRecord(first: 1) {
					nodes {
						displayTitle
						details { binary huge tags }
					}
				}
			}`,
		})

		expect(result.errors).toBeUndefined()
		expect(result.data).toEqual({
			findManyGraphqlVirtualRecord: {
				nodes: [
					{
						details: {
							binary: 'AQID',
							huge: '9007199254740993',
							tags: ['virtual', 'graphql'],
						},
						displayTitle: 'GRAPHQL VIRTUAL:member',
					},
				],
			},
		})
		expect(fixture.adapter.operations).toHaveLength(1)
		expect(new Set(fixture.adapter.selections[0])).toStrictEqual(
			new Set(['id', 'title']),
		)
		await fixture.application.dispose()
	})

	it('uses the safe GraphQL boundary for resolver and output failures', async () => {
		const fixture = await createFixture()
		const context = fixture.application.engine.anonymous({
			requestId: 'graphql-virtual-errors',
			source: 'test',
		}).context
		for (const testCase of [
			{ code: 'INTERNAL_ERROR', field: 'broken' },
			{ code: 'VALIDATION_ERROR', field: 'invalid' },
		] as const) {
			const result = await fixture.graphql.execute({
				context,
				document: `{ findOneGraphqlVirtualRecord { ${testCase.field} } }`,
			})
			expect(result.errors?.[0]?.extensions).toMatchObject({
				code: testCase.code,
				requestId: 'graphql-virtual-errors',
			})
			expect(JSON.stringify(result)).not.toMatch(
				/dependency|private|resolver|secret|title/u,
			)
		}
		await fixture.application.dispose()
	})

	it('propagates cancellation through the Core resolver scope', async () => {
		const fixture = await createFixture()
		const controller = new AbortController()
		const pending = fixture.graphql.execute({
			context: fixture.application.engine.anonymous({
				requestId: 'graphql-virtual-cancel',
				signal: controller.signal,
				source: 'test',
			}).context,
			document: '{ findOneGraphqlVirtualRecord { waiting } }',
		})
		controller.abort(new Error('client cancellation secret'))
		await expect(pending).resolves.toMatchObject({
			errors: [
				{
					extensions: {
						code: 'OPERATION_CANCELLED',
						requestId: 'graphql-virtual-cancel',
					},
				},
			],
		})
		await fixture.application.dispose()
	})

	it('keeps virtual resolution bound to one application context', async () => {
		const first = await createFixture()
		const firstContext = first.application.engine
			.anonymous({ requestId: 'graphql-virtual-first', source: 'test' })
			.context.withValue(viewer, 'first')
		const document = '{ findOneGraphqlVirtualRecord { displayTitle } }'
		const firstResult = await first.graphql.execute({
			context: firstContext,
			document,
		})
		await first.application.dispose()
		const second = await createFixture()
		const secondContext = second.application.engine
			.anonymous({ requestId: 'graphql-virtual-second', source: 'test' })
			.context.withValue(viewer, 'second')

		await expect(
			second.graphql.execute({ context: firstContext, document }),
		).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
		const secondResult = await second.graphql.execute({
			context: secondContext,
			document,
		})
		expect(firstResult.data).toEqual({
			findOneGraphqlVirtualRecord: {
				displayTitle: 'GRAPHQL VIRTUAL:first',
			},
		})
		expect(secondResult.data).toEqual({
			findOneGraphqlVirtualRecord: {
				displayTitle: 'GRAPHQL VIRTUAL:second',
			},
		})

		await Promise.all([
			first.application.dispose(),
			second.application.dispose(),
		])
	})
})
