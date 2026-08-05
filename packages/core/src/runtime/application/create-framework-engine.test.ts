import {
	createApplication,
	definePlugin,
	FrameworkApplication,
} from '../../foundation.js'
import { Schema, stringField } from '../../schema/index.js'
import { describe, expect, it } from 'vitest'

import { runWithRequestEngine } from '../context/active-framework-context.js'
import {
	databaseAdapterServiceToken,
	type DatabaseAdapter,
} from '../database/contracts.js'
import {
	constraint,
	databaseConstraint,
	guard,
	restrictSelection,
} from '../enforcement/definitions.js'
import { beforeOperation, postCommitEvent } from '../hooks/definitions.js'
import { MasterAuthority } from '../master/master-authority.js'
import { runtimePipelineStage } from '../pipeline/definitions.js'
import { RecordingDatabaseAdapter } from '../../../tests/runtime/fixtures/recording-database-adapter.js'
import { createFrameworkEngine } from './create-framework-engine.js'

const articleSchema = Schema.define({
	className: 'AssembledArticle',
	fields: {
		title: stringField({ validation: { required: true } }),
	},
})

const databasePlugin = (adapter: DatabaseAdapter) =>
	definePlugin({
		name: 'fixture.assembled-database',
		slot: 'database-adapter',
		setup: ({ services }) => {
			services.provide(databaseAdapterServiceToken, adapter)
		},
	})

describe('createFrameworkEngine', () => {
	it('assembles validation, ordered plugin stages, hooks, and events', async () => {
		const trace: string[] = []
		const generatedId = '0198a43e-2431-7000-8000-000000000001'
		const adapter = new RecordingDatabaseAdapter(
			[
				{
					materializations: [
						{
							kind: 'create',
							current: {
								id: generatedId,
								title: 'assembled',
								createdAt: '2026-08-01T08:00:00.000Z',
								updatedAt: '2026-08-01T08:00:00.000Z',
							},
						},
					],
					status: 'fulfilled',
					value: {
						id: generatedId,
						title: 'assembled',
						createdAt: '2026-08-01T08:00:00.000Z',
						updatedAt: '2026-08-01T08:00:00.000Z',
					},
				},
			],
			trace,
		)
		const dependency = definePlugin({
			name: 'fixture.pipeline-dependency',
			setup: ({ registries }) => {
				registries.pipelines.register(
					'fixture.dependency-normalization',
					runtimePipelineStage({
						stage: 'normalization',
						handler: (input) => {
							trace.push('normalization:dependency')

							return input.operation
						},
					}),
				)
				registries.pipelines.register(
					'fixture.dependency-commit',
					runtimePipelineStage({
						stage: 'commit',
						handler: () => {
							trace.push('commit:dependency')
						},
					}),
				)
			},
		})
		const consumer = definePlugin({
			name: 'fixture.pipeline-consumer',
			dependencies: ['fixture.pipeline-dependency'],
			setup: ({ registries }) => {
				registries.pipelines.register(
					'fixture.consumer-normalization',
					runtimePipelineStage({
						stage: 'normalization',
						handler: (input) => {
							trace.push('normalization:consumer')

							return input.operation
						},
					}),
				)
				registries.pipelines.register(
					'fixture.consumer-commit',
					runtimePipelineStage({
						stage: 'commit',
						handler: () => {
							trace.push('commit:consumer')
						},
					}),
				)
			},
		})
		const automation = definePlugin({
			name: 'fixture.assembled-automation',
			setup: ({ registries }) => {
				registries.hooks.register(
					'fixture.trim-title',
					beforeOperation({
						schema: articleSchema,
						operations: ['create-one'],
						handler: ({ operation }) => {
							trace.push('hook:before')

							return {
								operation: {
									...operation,
									input: {
										...operation.input,
										title: operation.input.title.trim(),
									},
								},
							}
						},
					}),
				)
				registries.events.register(
					'fixture.created-event',
					postCommitEvent({
						schema: articleSchema,
						operations: ['create-one'],
						handler: () => {
							trace.push('event:post-commit')
						},
					}),
				)
			},
		})
		const enforcement = definePlugin({
			name: 'fixture.assembled-enforcement',
			setup: ({ registries }) => {
				registries.hooks.register(
					'fixture.create-guard',
					guard({
						schema: articleSchema,
						operations: ['create-one'],
						handler: () => {
							trace.push('enforcement:guard')
						},
					}),
				)
				registries.hooks.register(
					'fixture.tenant-constraint',
					constraint({
						schema: articleSchema,
						operations: ['create-one'],
						handler: () => {
							trace.push('enforcement:constraint')

							return databaseConstraint('fixture.tenant', 1, {
								tenantId: 'tenant-1',
							})
						},
					}),
				)
			},
		})
		const application = await createApplication({
			schemas: [articleSchema],
			// Dependency ordering must win even when configuration lists the consumer first.
			plugins: [
				consumer,
				dependency,
				automation,
				enforcement,
				databasePlugin(adapter),
			],
		})
		const framework = createFrameworkEngine(application, {
			validation: {
				clock: () => new Date('2026-08-01T08:00:00.000Z'),
				timezone: 'UTC',
				uuidV7Generator: () => generatedId,
			},
		})

		const request = framework.anonymous({
			requestId: 'assembled-create',
			source: 'internal',
		})
		const result = await runWithRequestEngine(request, () =>
			articleSchema.create({ title: '  assembled  ' }),
		)

		expect(result.title).toBe('assembled')
		// Application assembly must route root mutations through the transaction adapter.
		expect(adapter.rootRequests).toStrictEqual([])
		expect(adapter.transactions).toHaveLength(1)
		expect(adapter.transactions[0]?.requests[0]?.constraints).toStrictEqual([
			{
				kind: 'fixture.tenant',
				version: 1,
				payload: { tenantId: 'tenant-1' },
			},
		])
		expect(adapter.transactions[0]?.requests[0]?.operation).toMatchObject({
			kind: 'create-one',
			input: {
				id: generatedId,
				title: 'assembled',
				createdAt: '2026-08-01T08:00:00.000Z',
				updatedAt: '2026-08-01T08:00:00.000Z',
			},
		})
		expect(trace).toStrictEqual([
			'adapter:begin',
			'normalization:dependency',
			'normalization:consumer',
			'enforcement:guard',
			'enforcement:constraint',
			'hook:before',
			'enforcement:guard',
			'enforcement:constraint',
			'prepare:create-one',
			'execute:create-one',
			'adapter:commit',
			'event:post-commit',
		])

		await application.dispose()
	})

	it('shares one protected read lifecycle without opening an automatic transaction', async () => {
		const trace: string[] = []
		const schema = Schema.define({
			className: 'AssembledReadArticle',
			fields: {
				secret: stringField({
					hooks: {
						resolveOutput: () => {
							trace.push('field:secret')

							return 'leaked'
						},
					},
				}),
				title: stringField({
					hooks: {
						resolveOutput: ({ value }) => {
							trace.push('field:title')

							return value === null ? null : value.toUpperCase()
						},
					},
				}),
			},
			hooks: {
				afterFind: ({ kind, result }) => {
					trace.push('schema:afterFind')
					// The exact terminal remains available even when this hook only observes.
					expect(kind).toBe('find')

					return result
				},
				beforeFind: ({ query }) => {
					trace.push('schema:beforeFind')

					return query.equalTo('title', 'visible')
				},
			},
		})
		const adapter = new RecordingDatabaseAdapter(
			[
				{
					status: 'fulfilled',
					value: [{ secret: 'hidden', title: 'visible' }],
				},
			],
			trace,
		)
		const policy = definePlugin({
			name: 'fixture.assembled-read-policy',
			setup: ({ registries }) => {
				registries.hooks.register(
					'fixture.read-constraint',
					constraint({
						handler: () =>
							databaseConstraint('fixture.read-tenant', 1, {
								tenantId: 'tenant-1',
							}),
						operations: ['find'],
						schema,
					}),
				)
				registries.hooks.register(
					'fixture.read-selection',
					restrictSelection({
						handler: () => ['title'],
						operations: ['find'],
						schema,
					}),
				)
			},
		})
		const application = await createApplication({
			plugins: [policy, databasePlugin(adapter)],
			schemas: [schema],
		})
		const framework = createFrameworkEngine(application)
		const request = framework.anonymous({
			requestId: 'assembled-find',
			source: 'internal',
		})
		const result = await runWithRequestEngine(request, () =>
			schema.query().select('title', 'secret').find(),
		)

		expect(result).toHaveLength(1)
		expect(result[0]).toBeInstanceOf(schema)
		expect(result.map((article) => article.toJSON())).toStrictEqual([
			{ title: 'VISIBLE' },
		])
		expect(adapter.transactions).toStrictEqual([])
		expect(adapter.rootRequests).toHaveLength(1)
		expect(adapter.rootRequests[0]?.constraints).toStrictEqual([
			{
				kind: 'fixture.read-tenant',
				payload: { tenantId: 'tenant-1' },
				version: 1,
			},
		])
		expect(adapter.rootRequests[0]?.operation).toMatchObject({
			kind: 'find',
			query: {
				selection: {
					fields: [{ field: 'title', kind: 'selected-field' }],
				},
				where: {
					expression: { field: 'title', kind: 'equal', value: 'visible' },
				},
			},
		})
		expect(trace).toStrictEqual([
			'schema:beforeFind',
			'execute:find',
			'field:title',
			'schema:afterFind',
		])

		await application.dispose()
	})

	it('forwards optional audited master authority to the assembled engine', async () => {
		const adapter = new RecordingDatabaseAdapter([], [])
		const authority = new MasterAuthority({
			keys: [{ id: 'fixture-master', value: 'fixture-master-secret' }],
			onUse: () => undefined,
		})
		const application = await createApplication({
			schemas: [articleSchema],
			plugins: [databasePlugin(adapter)],
		})
		const framework = createFrameworkEngine(application, {
			masterAuthority: authority,
		})

		expect(framework.authorizeMasterKey('fixture-master-secret')).toBeDefined()

		await application.dispose()
	})

	it('rolls back the automatic transaction when a native business hook fails', async () => {
		const failure = new Error('Native hook rejected the mutation')
		const trace: string[] = []
		const schema = Schema.define({
			className: 'RejectedNativeHookArticle',
			fields: {
				title: stringField({ validation: { required: true } }),
			},
			hooks: {
				beforeCreate: () => {
					trace.push('hook:beforeCreate')

					throw failure
				},
			},
		})
		const adapter = new RecordingDatabaseAdapter([], trace)
		const application = await createApplication({
			schemas: [schema],
			plugins: [databasePlugin(adapter)],
		})
		const framework = createFrameworkEngine(application)

		const request = framework.anonymous({
			requestId: 'native-hook-rollback',
			source: 'internal',
		})
		await expect(
			runWithRequestEngine(request, () => schema.create({ title: 'Rejected' })),
		).rejects.toBe(failure)
		expect(trace).toStrictEqual([
			'adapter:begin',
			'hook:beforeCreate',
			'adapter:rollback',
		])
		expect(adapter.transactions[0]?.requests).toStrictEqual([])

		await application.dispose()
	})

	it('reevaluates guards monotonically after business operation transforms', async () => {
		const denial = new Error('Transformed title is not permitted')
		const trace: string[] = []
		const adapter = new RecordingDatabaseAdapter([], trace)
		const transformPlugin = definePlugin({
			name: 'fixture.security-sensitive-transform',
			setup: ({ registries }) => {
				registries.hooks.register(
					'fixture.transform-title',
					beforeOperation({
						schema: articleSchema,
						operations: ['create-one'],
						handler: ({ operation }) => ({
							operation: {
								...operation,
								input: { ...operation.input, title: 'blocked' },
							},
						}),
					}),
				)
			},
		})
		const enforcementPlugin = definePlugin({
			name: 'fixture.security-sensitive-guard',
			setup: ({ registries }) => {
				registries.hooks.register(
					'fixture.guard-title',
					guard({
						schema: articleSchema,
						operations: ['create-one'],
						handler: ({ operation }) => {
							trace.push(`guard:${operation.input.title}`)

							if (operation.input.title === 'blocked') {
								throw denial
							}
						},
					}),
				)
			},
		})
		const application = await createApplication({
			schemas: [articleSchema],
			plugins: [transformPlugin, enforcementPlugin, databasePlugin(adapter)],
		})
		const framework = createFrameworkEngine(application)

		const request = framework.anonymous({
			requestId: 'reevaluated-enforcement',
			source: 'internal',
		})
		await expect(
			runWithRequestEngine(request, () =>
				articleSchema.create({ title: 'initial' }),
			),
		).rejects.toBe(denial)
		expect(trace).toStrictEqual([
			'adapter:begin',
			'guard:initial',
			'guard:blocked',
			'adapter:rollback',
		])
		expect(adapter.transactions[0]?.requests).toStrictEqual([])

		await application.dispose()
	})

	it('rejects missing, malformed, and conflicting plugin assembly eagerly', async () => {
		const missingAdapterApplication = await createApplication({
			schemas: [articleSchema],
			plugins: [],
		})

		expect(() => createFrameworkEngine(missingAdapterApplication)).toThrow(
			expect.objectContaining({ code: 'SERVICE_NOT_FOUND' }),
		)

		const invalidAdapterPlugin = definePlugin({
			name: 'fixture.invalid-adapter',
			setup: ({ services }) => {
				// Runtime validation protects JavaScript plugins that violate the service contract.
				services.provide(databaseAdapterServiceToken, {} as never)
			},
		})
		const invalidAdapterApplication = await createApplication({
			schemas: [articleSchema],
			plugins: [invalidAdapterPlugin],
		})

		expect(() => createFrameworkEngine(invalidAdapterApplication)).toThrow(
			new TypeError(
				'databaseAdapterServiceToken must resolve to a DatabaseAdapter',
			),
		)

		const adapter = new RecordingDatabaseAdapter([], [])
		const invalidPipelinePlugin = definePlugin({
			name: 'fixture.invalid-pipeline',
			setup: ({ registries }) => {
				registries.pipelines.register('fixture.forged-stage', {
					stage: 'unknown',
				})
			},
		})
		const invalidPipelineApplication = await createApplication({
			schemas: [articleSchema],
			plugins: [invalidPipelinePlugin, databasePlugin(adapter)],
		})

		expect(() => createFrameworkEngine(invalidPipelineApplication)).toThrow(
			new TypeError(
				'Plugin "fixture.invalid-pipeline" registered invalid runtime pipeline contribution "fixture.forged-stage"',
			),
		)

		await Promise.all([
			missingAdapterApplication.dispose(),
			invalidAdapterApplication.dispose(),
			invalidPipelineApplication.dispose(),
		])
	})

	it('rejects malformed options and unusable application lifecycle states', async () => {
		const adapter = new RecordingDatabaseAdapter([], [])
		const plugin = databasePlugin(adapter)
		const idleApplication = new FrameworkApplication({
			schemas: [articleSchema],
			plugins: [plugin],
		})

		expect(() => createFrameworkEngine(idleApplication)).toThrow(
			new TypeError(
				'Framework engine assembly requires a ready or started application; received idle',
			),
		)
		expect(() => createFrameworkEngine({} as never)).toThrow(
			new TypeError(
				'framework engine factory application must be a FrameworkApplication',
			),
		)

		const application = await createApplication({
			schemas: [articleSchema],
			plugins: [plugin],
		})

		expect(() => createFrameworkEngine(application, null as never)).toThrow(
			new TypeError('framework engine factory options must be a plain object'),
		)
		expect(() =>
			createFrameworkEngine(application, { unknown: true } as never),
		).toThrow(
			new TypeError('framework engine factory contains unknown key: unknown'),
		)
		expect(() =>
			createFrameworkEngine(application, { masterAuthority: {} } as never),
		).toThrow(
			new TypeError(
				'framework engine factory masterAuthority must be a MasterAuthority',
			),
		)

		await application.start()
		expect(createFrameworkEngine(application)).toBeDefined()
		await application.stop()

		expect(() => createFrameworkEngine(application)).toThrow(
			new TypeError(
				'Framework engine assembly requires a ready or started application; received stopped',
			),
		)

		await application.dispose()

		expect(() => createFrameworkEngine(application)).toThrow(
			new TypeError(
				'Framework engine assembly requires a ready or started application; received disposed',
			),
		)
	})
})
