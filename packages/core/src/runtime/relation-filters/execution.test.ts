import {
	addSchemaField,
	RequestContextValue,
	createApplication,
	definePlugin,
	relationField,
	type RelationWhereResolver,
	Schema,
} from '../../index.js'
import { describe, expect, it } from 'vitest'

import { provideTestDatabaseAdapter } from '../../../tests/runtime/fixtures/database-adapter-capability.js'
import { RecordingDatabaseAdapter } from '../../../tests/runtime/fixtures/recording-database-adapter.js'
import { provideTestRuntimeConstraint } from '../../../tests/runtime/fixtures/runtime-capabilities.js'
import { QueryBuilder } from '../../query/query/query.js'
import { normalizeWhereInput } from '../../query/filters/where.js'
import { materializeSchemaModel } from '../../schema/schema/model.js'
import { runWithRequestEngine } from '../context/active-framework-context.js'
import { RequestContext, requestSources } from '../context/request-context.js'
import { MasterAuthority } from '../master/master-authority.js'
import { createFrameworkEngine } from '../application/create-framework-engine.js'
import { protectedPolicy } from '../enforcement/protected-policy.js'
import { readApplicationPluginOwner } from '../../plugins/callback-execution.js'
import { RuntimeRelationFilterResolver } from './execution.js'

const sourceId = '0198f090-2a50-7000-8000-000000000091'
const targetId = '0198f090-2a50-7000-8000-000000000092'
const principalValue = new RequestContextValue<Readonly<{ id: string }>>(
	'fixture.relation-principal',
	(value) => {
		if (typeof value !== 'object' || value === null) {
			throw new TypeError('Fixture principal must be an object')
		}
		const id: unknown = Reflect.get(value, 'id')
		if (typeof id !== 'string') {
			throw new TypeError('Fixture principal id must be a string')
		}
		return Object.freeze({ id })
	},
)

const databasePlugin = (adapter: RecordingDatabaseAdapter) =>
	definePlugin({
		core: '^0.0.0',
		pluginId: 'fixture.relation-filter-database',
		version: '0.0.0',
		capabilities: [provideTestDatabaseAdapter(adapter)],
	})

describe('Runtime relation filters', () => {
	it('applies a precompiled static declaration without a caller predicate', async () => {
		const Target = Schema.define({
			className: 'StaticRelationTarget',
			fields: (field) => ({ visible: field.boolean() }),
		})
		const Source = Schema.define({
			className: 'StaticRelationSource',
			fields: (field) => ({
				targets: field.relation({
					target: 'StaticRelationTarget',
					where: { visible: { eq: true } },
				}),
			}),
		})
		const adapter = new RecordingDatabaseAdapter(
			[{ status: 'fulfilled', value: 0 }],
			[],
		)
		const application = await createApplication({
			plugins: [databasePlugin(adapter)],
			schemas: [Source, Target],
		})
		const framework = createFrameworkEngine(application)
		const request = framework.anonymous({
			requestId: 'static-relation-filter',
			source: requestSources.internal,
		})

		try {
			await runWithRequestEngine(request, () =>
				materializeSchemaModel(Source, { id: sourceId })
					.relation('targets')
					.count(),
			)
			expect(adapter.rootRequests[0]?.rowFilter).toMatchObject({
				field: 'visible',
				kind: 'equal',
				value: true,
			})
		} finally {
			await application.dispose()
		}
	})

	it('resolves every direct terminal under its exact context and keeps caller syntax separate', async () => {
		const contexts: RequestContext[] = []
		const Target = Schema.define({
			className: 'FilteredRelationTarget',
			fields: (field) => ({
				label: field.string(),
				visibility: field.string(),
			}),
		})
		const Source = Schema.define({
			className: 'FilteredRelationSource',
			fields: (field) => ({
				targets: field.relation({
					target: 'FilteredRelationTarget',
					where: (({ context, where }) => {
						contexts.push(context)
						const principal = context.getValue(principalValue)
						return context.access.mode === 'master'
							? where.eq('visibility', 'master')
							: where.ne('id', principal?.id ?? 'anonymous')
					}) as RelationWhereResolver<typeof Target>,
				}),
			}),
		})
		const trace: string[] = []
		const adapter = new RecordingDatabaseAdapter(
			[
				{ status: 'fulfilled', value: [] },
				{ status: 'fulfilled', value: null },
				{ status: 'fulfilled', value: null },
				{ status: 'fulfilled', value: 0 },
				{ status: 'fulfilled', value: false },
				{ status: 'fulfilled', value: 0 },
			],
			trace,
		)
		const application = await createApplication({
			plugins: [databasePlugin(adapter)],
			schemas: [Source, Target],
		})
		const authority = new MasterAuthority({
			keys: [{ id: 'fixture', value: 'secret' }],
			onUse: () => undefined,
		})
		const framework = createFrameworkEngine(application, {
			masterAuthority: authority,
		})
		const context = RequestContext.anonymous({
			requestId: 'relation-filter-terminals',
			source: requestSources.internal,
		}).withValue(principalValue, { id: targetId })
		const request = framework.withContext(context)
		const source = materializeSchemaModel(Source, { id: sourceId })
		const relation = source.relation('targets')

		try {
			await runWithRequestEngine(request, async () => {
				await expect(
					relation.findMany({ where: { label: { eq: 'caller' } } }),
				).resolves.toStrictEqual([])
				await expect(relation.findOne()).resolves.toBeNull()
				await expect(relation.get({ id: targetId })).rejects.toMatchObject({
					code: 'NOT_FOUND',
				})
				await expect(relation.count()).resolves.toBe(0)
				await expect(relation.exists()).resolves.toBe(false)
				await expect(relation.count({}, { useMasterKey: true })).resolves.toBe(
					0,
				)
			})

			expect(contexts).toHaveLength(6)
			expect(contexts.slice(0, 5).every((value) => value === context)).toBe(
				true,
			)
			expect(contexts[5]?.access.mode).toBe('master')
			expect(
				adapter.rootRequests.map(({ operation }) => operation.kind),
			).toStrictEqual([
				'find-many',
				'find-one',
				'get',
				'count',
				'exists',
				'count',
			])
			expect(adapter.rootRequests[0]).toMatchObject({
				operation: {
					query: {
						where: {
							expression: {
								field: 'label',
								kind: 'equal',
								value: 'caller',
							},
						},
					},
				},
				relation: {
					fieldPath: ['targets'],
					source: Source,
					sourceObjectId: sourceId,
					target: Target,
				},
				rowFilter: {
					field: 'id',
					kind: 'not-equal',
					value: targetId,
				},
			})
			expect(adapter.rootRequests[5]?.rowFilter).toMatchObject({
				field: 'visibility',
				kind: 'equal',
				value: 'master',
			})
		} finally {
			await application.dispose()
		}
	})

	it('fails invalid synchronous results and cancellation before adapter work', async () => {
		let invocations = 0
		const Target = Schema.define({
			className: 'InvalidRelationTarget',
			fields: (field) => ({ label: field.string() }),
		})
		const asyncResolver = (({
			where,
		}: Parameters<RelationWhereResolver<typeof Target>>[0]) => {
			invocations += 1
			return Promise.resolve(where.eq('label', 'invalid'))
		}) as unknown as RelationWhereResolver<typeof Target>
		const Source = Schema.define({
			className: 'InvalidRelationSource',
			fields: (field) => ({
				targets: field.relation({
					target: 'InvalidRelationTarget',
					where: asyncResolver,
				}),
			}),
		})
		const adapter = new RecordingDatabaseAdapter([], [])
		const application = await createApplication({
			plugins: [databasePlugin(adapter)],
			schemas: [Source, Target],
		})
		const framework = createFrameworkEngine(application)
		const source = materializeSchemaModel(Source, { id: sourceId })

		try {
			const request = framework.anonymous({
				requestId: 'invalid-relation-filter',
				source: requestSources.internal,
			})
			await expect(
				runWithRequestEngine(request, () => source.relation('targets').count()),
			).rejects.toMatchObject({ code: 'INTERNAL_ERROR' })
			expect(invocations).toBe(1)
			expect(adapter.rootRequests).toStrictEqual([])

			const controller = new AbortController()
			controller.abort()
			const cancelled = framework.anonymous({
				requestId: 'cancelled-relation-filter',
				signal: controller.signal,
				source: requestSources.internal,
			})
			await expect(
				runWithRequestEngine(cancelled, () =>
					source.relation('targets').count(),
				),
			).rejects.toMatchObject({ code: 'OPERATION_CANCELLED' })
			expect(invocations).toBe(1)
			expect(adapter.rootRequests).toStrictEqual([])
		} finally {
			await application.dispose()
		}
	})

	it('runs traversal and target policy before shaping, then ANDs protected row scope', async () => {
		const trace: string[] = []
		const Target = Schema.define({
			className: 'OrderedRelationTarget',
			fields: (field) => ({
				label: field.string(),
				visibility: field.string(),
			}),
		})
		const Source = Schema.define({
			className: 'OrderedRelationSource',
			fields: (field) => ({
				targets: field.relation({
					target: 'OrderedRelationTarget',
					where: (({ where }) => {
						trace.push('relation-where')
						return where.eq('visibility', 'declared')
					}) as RelationWhereResolver<typeof Target>,
				}),
			}),
		})
		const adapter = new RecordingDatabaseAdapter(
			[{ status: 'fulfilled', value: [] }],
			trace,
		)
		const policy = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.relation-filter-policy',
			version: '0.0.0',
			privileges: [
				{
					name: 'runtime:constrain',
					reason: 'Proves monotonic relation-filter ordering.',
				},
			],
			capabilities: [
				provideTestRuntimeConstraint(
					'ordered-relation-policy',
					protectedPolicy({
						evaluate: () => {
							trace.push('target-policy')
							return {
								rowFilter: normalizeWhereInput(Target, {
									visibility: { ne: 'policy-hidden' },
								}),
							}
						},
						operations: ['find-many'],
						relation: () => {
							trace.push('source-relation-policy')
							return true
						},
						schema: Target,
					}),
				),
			],
		})
		const application = await createApplication({
			plugins: [policy, databasePlugin(adapter)],
			schemas: [Source, Target],
		})
		const framework = createFrameworkEngine(application)
		const request = framework.anonymous({
			requestId: 'ordered-relation-filter',
			source: requestSources.internal,
		})
		const source = materializeSchemaModel(Source, { id: sourceId })

		try {
			await runWithRequestEngine(request, () =>
				source.relation('targets').findMany(),
			)

			expect(trace).toStrictEqual([
				'source-relation-policy',
				'target-policy',
				'relation-where',
				'execute:find-many',
			])
			expect(adapter.rootRequests[0]?.rowFilter).toMatchObject({
				expressions: [
					{ field: 'visibility', kind: 'equal', value: 'declared' },
					{ field: 'visibility', kind: 'not-equal', value: 'policy-hidden' },
				],
				kind: 'and',
			})
		} finally {
			await application.dispose()
		}
	})

	it('reuses one normalized expression within an operation and isolates application lifetimes', async () => {
		let invocations = 0
		const Target = Schema.define({
			className: 'CachedRelationTarget',
			fields: (field) => ({ label: field.string() }),
		})
		const Source = Schema.define({
			className: 'CachedRelationSource',
			fields: (field) => ({
				targets: field.relation({
					target: 'CachedRelationTarget',
					where: (({ where }) => {
						invocations += 1
						return where.eq('label', 'cached')
					}) as RelationWhereResolver<typeof Target>,
				}),
			}),
		})
		const adapter = new RecordingDatabaseAdapter([], [])
		const application = await createApplication({
			plugins: [databasePlugin(adapter)],
			schemas: [Source, Target],
		})
		const resolver = new RuntimeRelationFilterResolver(application)
		const context = RequestContext.anonymous({
			requestId: 'cached-relation-filter',
			source: requestSources.internal,
		})
		const operation = {
			kind: 'count' as const,
			query: new QueryBuilder(Target).ast,
		}
		const relation = {
			fieldPath: ['targets'],
			source: Source,
			target: Target,
		}

		const first = await resolver.resolve(context, operation, relation)
		const second = await resolver.resolve(context, operation, relation)

		expect(first).toBe(second)
		expect(invocations).toBe(1)
		await application.dispose()
		await expect(
			resolver.resolve(context, operation, relation),
		).rejects.toThrow(
			'Framework engine requires its initialized active application; received disposed',
		)
		expect(invocations).toBe(1)
	})

	it('never evaluates read shaping for physical membership commands', async () => {
		let invocations = 0
		const now = '2026-09-11T10:00:00.000Z'
		const Target = Schema.define({
			className: 'MutationRelationTarget',
			fields: (field) => ({ label: field.string() }),
		})
		const Source = Schema.define({
			className: 'MutationRelationSource',
			fields: (field) => ({
				targets: field.relation({
					target: 'MutationRelationTarget',
					where: (({ where }) => {
						invocations += 1
						return where.eq('label', 'visible')
					}) as RelationWhereResolver<typeof Target>,
				}),
			}),
		})
		const targetRecord = {
			createdAt: now,
			id: targetId,
			label: 'hidden',
			updatedAt: now,
		}
		const sourceRecord = {
			createdAt: now,
			id: sourceId,
			updatedAt: now,
		}
		const mutationResult = {
			materializations: [
				{
					current: sourceRecord,
					kind: 'update' as const,
					previous: sourceRecord,
				},
			],
			status: 'fulfilled' as const,
			target: sourceRecord,
			value: sourceRecord,
		}
		const adapter = new RecordingDatabaseAdapter(
			[
				{ status: 'fulfilled', value: targetRecord },
				mutationResult,
				{ status: 'fulfilled', value: targetRecord },
				mutationResult,
				mutationResult,
				mutationResult,
			],
			[],
		)
		const application = await createApplication({
			plugins: [databasePlugin(adapter)],
			schemas: [Source, Target],
		})
		const framework = createFrameworkEngine(application)
		const request = framework.anonymous({
			requestId: 'relation-membership',
			source: requestSources.internal,
		})
		const relation = materializeSchemaModel(Source, sourceRecord).relation(
			'targets',
		)

		try {
			await runWithRequestEngine(request, async () => {
				await relation.connect(targetId)
				await relation.disconnect(targetId)
				await relation.set([])
				await relation.clear()
			})

			expect(invocations).toBe(0)
			expect(
				adapter.transactions
					.flatMap(({ requests }) => requests)
					.map((request) => ({
						kind: request.operation.kind,
						rowFilter: request.rowFilter,
					})),
			).toHaveLength(6)
		} finally {
			await application.dispose()
		}
	})

	it('attributes a plugin-contributed relation resolver to its exact instance', async () => {
		const Target = Schema.define({
			className: 'AttributedRelationTarget',
			fields: (field) => ({ visible: field.boolean() }),
		})
		const Source = Schema.define({
			className: 'AttributedRelationSource',
			fields: () => ({}),
		})
		const adapter = new RecordingDatabaseAdapter(
			[{ status: 'fulfilled', value: 0 }],
			[],
		)
		let observedOwner: unknown
		const contributor = definePlugin({
			core: '^0.0.0',
			instanceId: 'primary',
			pluginId: 'fixture.relation-filter-contributor',
			version: '0.0.0',
			privileges: [
				{
					name: 'schema:declare',
					reason: 'Adds the attributed relation field under test.',
				},
			],
			declare: ({ schemas }) => {
				schemas.patch({
					operations: [
						addSchemaField({
							contributionId: 'visible-targets',
							field: relationField({
								target: () => Target,
								where: ({ where }) => {
									observedOwner = readApplicationPluginOwner(application)
									return where.eq('visible', true)
								},
							}),
							name: 'targets',
						}),
					],
					targets: schemas.select({ className: Source.className }),
				})
			},
		})
		const application = await createApplication({
			plugins: [contributor, databasePlugin(adapter)],
			schemas: [Source, Target],
		})
		const framework = createFrameworkEngine(application)
		const request = framework.anonymous({
			requestId: 'attributed-relation-filter',
			source: requestSources.internal,
		})
		const source = materializeSchemaModel(Source, { id: sourceId })

		try {
			await runWithRequestEngine(request, () =>
				source.relation('targets' as never).count(),
			)
			expect(observedOwner).toStrictEqual({
				instanceId: 'primary',
				pluginId: 'fixture.relation-filter-contributor',
			})
		} finally {
			await application.dispose()
		}
	})
})
