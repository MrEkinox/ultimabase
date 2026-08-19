import {
	createApplication,
	definePlugin,
	FrameworkApplication,
} from '../../foundation.js'
import { Schema } from '../../schema/index.js'
import { describe, expect, it } from 'vitest'

import { runWithRequestEngine } from '../context/active-framework-context.js'
import { type DatabaseAdapter } from '../database/contracts.js'
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
import { provideTestDatabaseAdapter } from '../../../tests/runtime/fixtures/database-adapter-capability.js'
import {
	provideTestRuntimeConstraint,
	provideTestRuntimeInterceptor,
	provideTestRuntimeObserver,
} from '../../../tests/runtime/fixtures/runtime-capabilities.js'
import { createFrameworkEngine } from './create-framework-engine.js'

const articleSchema = Schema.define({
	className: 'AssembledArticle',
	fields: (field) => ({
		title: field.string({
			hooks: { resolveInput: ({ value }) => value.trim() },
			validation: { required: true },
		}),
	}),
})

const databasePlugin = (adapter: DatabaseAdapter) =>
	definePlugin({
		version: '0.0.0',
		core: '^0.0.0',
		pluginId: 'fixture.assembled-database',
		capabilities: {
			provides: [provideTestDatabaseAdapter(adapter)],
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
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.pipeline-dependency',
			privileges: [
				{
					name: 'runtime:intercept',
					reason: 'Exercises ordered Runtime pipeline handlers.',
				},
			],
			capabilities: {
				provides: [
					provideTestRuntimeInterceptor(
						'fixture.dependency-normalization',
						runtimePipelineStage({
							stage: 'normalization',
							handler: (input) => {
								trace.push('normalization:dependency')

								return input.operation
							},
						}),
					),
					provideTestRuntimeInterceptor(
						'fixture.dependency-commit',
						runtimePipelineStage({
							stage: 'commit',
							handler: () => {
								trace.push('commit:dependency')
							},
						}),
					),
				],
			},
		})
		const consumer = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.pipeline-consumer',
			dependencies: [
				{ pluginId: 'fixture.pipeline-dependency', version: '^0.0.0' },
			],
			privileges: [
				{
					name: 'runtime:intercept',
					reason: 'Exercises ordered Runtime pipeline handlers.',
				},
			],
			capabilities: {
				provides: [
					provideTestRuntimeInterceptor(
						'fixture.consumer-normalization',
						runtimePipelineStage({
							stage: 'normalization',
							handler: (input) => {
								trace.push('normalization:consumer')

								return input.operation
							},
						}),
					),
					provideTestRuntimeInterceptor(
						'fixture.consumer-commit',
						runtimePipelineStage({
							stage: 'commit',
							handler: () => {
								trace.push('commit:consumer')
							},
						}),
					),
				],
			},
		})
		const automation = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.assembled-automation',
			privileges: [
				{
					name: 'runtime:intercept',
					reason: 'Exercises low-level before-operation hooks.',
				},
				{
					name: 'runtime:observe',
					reason: 'Exercises post-commit observers.',
				},
			],
			capabilities: {
				provides: [
					provideTestRuntimeInterceptor(
						'fixture.trim-title',
						beforeOperation({
							schema: articleSchema,
							operations: ['create-one'],
							handler: () => {
								trace.push('hook:before')
							},
						}),
					),
					provideTestRuntimeObserver(
						'fixture.created-event',
						postCommitEvent({
							schema: articleSchema,
							operations: ['create-one'],
							handler: () => {
								trace.push('event:post-commit')
							},
						}),
					),
				],
			},
		})
		const enforcement = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.assembled-enforcement',
			privileges: [
				{
					name: 'runtime:constrain',
					reason: 'Exercises monotonic Runtime enforcement.',
				},
			],
			capabilities: {
				provides: [
					provideTestRuntimeConstraint(
						'fixture.create-guard',
						guard({
							schema: articleSchema,
							operations: ['create-one'],
							handler: () => {
								trace.push('enforcement:guard')
							},
						}),
					),
					provideTestRuntimeConstraint(
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
					),
				],
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
			articleSchema.createOne({ data: { title: '  assembled  ' } }),
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
			selection: { fields: [], kind: 'selection' },
			input: {
				id: generatedId,
				title: 'assembled',
				createdAt: '2026-08-01T08:00:00.000Z',
				updatedAt: '2026-08-01T08:00:00.000Z',
			},
		})
		expect(adapter.transactions[0]?.executions[0]).toMatchObject({
			constraints: [
				{
					kind: 'fixture.tenant',
					payload: { tenantId: 'tenant-1' },
					version: 1,
				},
			],
			operation: {
				input: { title: 'assembled' },
				kind: 'create-one',
			},
		})
		expect(trace).toStrictEqual([
			'adapter:begin',
			'normalization:dependency',
			'normalization:consumer',
			'enforcement:guard',
			'enforcement:constraint',
			'enforcement:guard',
			'enforcement:constraint',
			'hook:before',
			'prepare:create-one',
			'execute:create-one',
			'adapter:commit',
			'event:post-commit',
		])

		await application.dispose()
	})

	it('shares one protected read pipeline without opening an automatic transaction', async () => {
		const trace: string[] = []
		const schema = Schema.define({
			className: 'AssembledReadArticle',
			fields: (field) => ({
				secret: field.string(),
				title: field.string(),
			}),
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
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.assembled-read-policy',
			privileges: [
				{
					name: 'runtime:constrain',
					reason: 'Exercises read constraints and selection narrowing.',
				},
			],
			capabilities: {
				provides: [
					provideTestRuntimeConstraint(
						'fixture.read-constraint',
						constraint({
							handler: () =>
								databaseConstraint('fixture.read-tenant', 1, {
									tenantId: 'tenant-1',
								}),
							operations: ['find-many'],
							schema,
						}),
					),
					provideTestRuntimeConstraint(
						'fixture.read-selection',
						restrictSelection({
							handler: () => ['title'],
							operations: ['find-many'],
							schema,
						}),
					),
				],
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
			schema.findMany({ select: { title: true, secret: true } }),
		)

		expect(result).toHaveLength(1)
		expect(result[0]).toBeInstanceOf(schema)
		expect(result.map((article) => article.toJSON())).toStrictEqual([
			{ title: 'visible' },
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
			kind: 'find-many',
			query: {
				selection: {
					fields: [{ field: 'title', kind: 'selected-field' }],
				},
			},
		})
		expect(trace).toStrictEqual(['execute:find-many'])

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
			fields: (field) => ({
				title: field.string({ validation: { required: true } }),
			}),
			hooks: {
				beforeOperation: {
					create: () => {
						trace.push('hook:beforeCreate')

						throw failure
					},
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
			runWithRequestEngine(request, () =>
				schema.createOne({ data: { title: 'Rejected' } }),
			),
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
		const transformedSchema = Schema.define({
			className: 'SecuritySensitiveTransformArticle',
			fields: (field) => ({
				title: field.string({
					hooks: { resolveInput: () => 'blocked' },
					validation: { required: true },
				}),
			}),
		})
		const enforcementPlugin = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.security-sensitive-guard',
			privileges: [
				{
					name: 'runtime:constrain',
					reason: 'Exercises value-dependent enforcement.',
				},
			],
			capabilities: {
				provides: [
					provideTestRuntimeConstraint(
						'fixture.guard-title',
						guard({
							schema: transformedSchema,
							operations: ['create-one'],
							handler: ({ operation }) => {
								trace.push(`guard:${String(operation.input.title)}`)

								if (operation.input.title === 'blocked') {
									throw denial
								}
							},
						}),
					),
				],
			},
		})
		const application = await createApplication({
			schemas: [transformedSchema],
			plugins: [enforcementPlugin, databasePlugin(adapter)],
		})
		const framework = createFrameworkEngine(application)

		const request = framework.anonymous({
			requestId: 'reevaluated-enforcement',
			source: 'internal',
		})
		await expect(
			runWithRequestEngine(request, () =>
				transformedSchema.createOne({ data: { title: 'initial' } }),
			),
		).rejects.toBe(denial)
		expect(trace).toStrictEqual([
			'adapter:begin',
			'guard:initial',
			'guard:blocked',
			'adapter:rollback',
		])
		expect(adapter.transactions[0]?.requests).toStrictEqual([])
		expect(adapter.transactions[0]?.executions).toStrictEqual([])

		await application.dispose()
	})

	it('rejects missing, malformed, and conflicting plugin assembly eagerly', async () => {
		const missingAdapterApplication = await createApplication({
			schemas: [articleSchema],
			plugins: [],
		})

		expect(() => createFrameworkEngine(missingAdapterApplication)).toThrow(
			new TypeError(
				'databaseAdapterCapability must resolve to a DatabaseAdapter',
			),
		)

		const invalidAdapterPlugin = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.invalid-adapter',
			capabilities: {
				provides: [provideTestDatabaseAdapter({} as never)],
			},
		})
		const invalidAdapterApplication = await createApplication({
			schemas: [articleSchema],
			plugins: [invalidAdapterPlugin],
		})

		expect(() => createFrameworkEngine(invalidAdapterApplication)).toThrow(
			new TypeError(
				'databaseAdapterCapability must resolve to a DatabaseAdapter',
			),
		)

		const adapter = new RecordingDatabaseAdapter([], [])
		const invalidPipelinePlugin = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.invalid-pipeline',
			privileges: [
				{
					name: 'runtime:intercept',
					reason: 'Exercises forged Runtime pipeline rejection.',
				},
			],
			capabilities: {
				provides: [
					provideTestRuntimeInterceptor('fixture.forged-stage', {
						stage: 'unknown',
					} as never),
				],
			},
		})

		await expect(
			createApplication({
				schemas: [articleSchema],
				plugins: [invalidPipelinePlugin, databasePlugin(adapter)],
			}),
		).rejects.toThrow(
			new TypeError(
				'runtime interceptor factories must return a definition created by an interceptor factory',
			),
		)

		await Promise.all([
			missingAdapterApplication.dispose(),
			invalidAdapterApplication.dispose(),
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
