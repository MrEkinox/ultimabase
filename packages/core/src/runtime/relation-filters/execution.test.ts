import {
	addSchemaField,
	plugin as createPlugin,
	contributeDeclarations,
	relationField,
	type RelationWhereResolver,
} from '../../index.js'
import { createApplication } from '../../application/framework-application.js'
import { describe, expect, it } from 'vitest'

import { provideTestDatabaseAdapter } from '../../../tests/runtime/fixtures/database-adapter-capability.js'
import { RecordingDatabaseAdapter } from '../../../tests/runtime/fixtures/recording-database-adapter.js'
import { QueryBuilder } from '../../query/query/query.js'
import { runWithRequestEngine } from '../context/active-framework-context.js'
import { RequestContext, requestSources } from '../context/request-context.js'
import { createFrameworkEngine } from '../application/create-framework-engine.js'
import { readApplicationPluginOwner } from '../../plugins/callback-execution.js'
import { RuntimeRelationFilterResolver } from './execution.js'
import { UltimaBase } from '../application/ultima-base.js'

const databasePlugin = (adapter: RecordingDatabaseAdapter) =>
	createPlugin({
		core: '^0.0.0',
		id: 'fixture.relation-filter-database',
		version: '0.0.0',
		contributions: [provideTestDatabaseAdapter(adapter)],
	})

describe('Runtime relation filters', () => {
	it('applies a precompiled static declaration without a caller predicate', async () => {
		const Target = UltimaBase.Schema.define({
			className: 'StaticRelationTarget',
			fields: (field) => ({ visible: field.boolean() }),
		})
		const Source = UltimaBase.Schema.define({
			className: 'StaticRelationSource',
			fields: (field) => ({
				targets: field.relation({
					target: 'StaticRelationTarget',
					where: { visible: { eq: true } },
				}),
			}),
		})
		const adapter = new RecordingDatabaseAdapter(
			[{ status: 'fulfilled', value: [] }],
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
			// Related rows are read through `include` (ADR-0310).
			await runWithRequestEngine(request, () =>
				Source.findMany({ include: { targets: {} } } as never),
			)
			expect(
				adapter.rootRequests[0]?.inclusions?.[0]?.request.rowFilter,
			).toMatchObject({
				field: 'visible',
				kind: 'equal',
				value: true,
			})
		} finally {
			await application.dispose()
		}
	})

	it('fails invalid synchronous results and cancellation before adapter work', async () => {
		let invocations = 0
		const Target = UltimaBase.Schema.define({
			className: 'InvalidRelationTarget',
			fields: (field) => ({ label: field.string() }),
		})
		const asyncResolver = ({ where }: Parameters<RelationWhereResolver>[0]) => {
			invocations += 1
			return Promise.resolve(where.eq('label', 'invalid'))
		}
		const Source = UltimaBase.Schema.define({
			className: 'InvalidRelationSource',
			fields: (field) => ({
				targets: field.relation({
					target: 'InvalidRelationTarget',
					// The asynchronous result is deliberately invalid for the Runtime guard.
					where: asyncResolver as never,
				}),
			}),
		})
		const adapter = new RecordingDatabaseAdapter([], [])
		const application = await createApplication({
			plugins: [databasePlugin(adapter)],
			schemas: [Source, Target],
		})
		const framework = createFrameworkEngine(application)
		const readTargets = () =>
			Source.findMany({ include: { targets: {} } } as never)

		try {
			const request = framework.anonymous({
				requestId: 'invalid-relation-filter',
				source: requestSources.internal,
			})
			await expect(
				runWithRequestEngine(request, readTargets),
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
				runWithRequestEngine(cancelled, readTargets),
			).rejects.toMatchObject({ code: 'OPERATION_CANCELLED' })
			expect(invocations).toBe(1)
			expect(adapter.rootRequests).toStrictEqual([])
		} finally {
			await application.dispose()
		}
	})

	it('reuses one normalized expression within an operation and isolates application lifetimes', async () => {
		let invocations = 0
		const Target = UltimaBase.Schema.define({
			className: 'CachedRelationTarget',
			fields: (field) => ({ label: field.string() }),
		})
		const Source = UltimaBase.Schema.define({
			className: 'CachedRelationSource',
			fields: (field) => ({
				targets: field.relation({
					target: 'CachedRelationTarget',
					where: ({ where }) => {
						invocations += 1
						return where.eq('label', 'cached')
					},
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

	it('attributes a plugin-contributed relation resolver to its exact instance', async () => {
		const Target = UltimaBase.Schema.define({
			className: 'AttributedRelationTarget',
			fields: (field) => ({ visible: field.boolean() }),
		})
		const Source = UltimaBase.Schema.define({
			className: 'AttributedRelationSource',
			fields: () => ({}),
		})
		const adapter = new RecordingDatabaseAdapter(
			[{ status: 'fulfilled', value: [] }],
			[],
		)
		let observedOwner: unknown
		const contributor = createPlugin({
			core: '^0.0.0',
			instanceId: 'primary',
			id: 'fixture.relation-filter-contributor',
			version: '0.0.0',
			permissions: {
				'schema:declare': 'Adds the attributed relation field under test.',
			},
			contributions: [
				contributeDeclarations({
					schema: ({ schemas }) => {
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

						return undefined
					},
				}),
			],
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
		try {
			await runWithRequestEngine(request, () =>
				// The plugin contributes this relation only during Runtime compilation.
				Source.findMany({ include: { targets: {} } } as never),
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
