import {
	createApplication,
	definePlugin,
	type FrameworkApplication,
	type PluginDefinition,
} from '../../src/index.js'
import { Schema, type SchemaDefinition } from '../../src/index.js'
import { describe, expect, it } from 'vitest'

import {
	afterOperation,
	beforeOperation,
	createRuntimeHookStages,
	FrameworkEngine,
	postCommitEvent,
	requestSources,
	runWithRequestEngine,
	RuntimePipeline,
	type DatabaseAdapter,
	type RuntimePipelineStages,
} from '../../src/runtime/index.js'
import {
	RecordingDatabaseAdapter,
	type QueuedAdapterResult,
} from './fixtures/recording-database-adapter.js'

const articleSchema = Schema.define({
	className: 'HookArticle',
	fields: (field) => ({
		title: field.string({ validation: { required: true } }),
	}),
})

const foreignSchema = Schema.define({
	className: 'HookForeign',
	fields: (field) => ({
		title: field.string({ validation: { required: true } }),
	}),
})

/** Produces the complete persisted shape expected by create-operation hooks. */
const createStoredArticle = (title: string) => ({
	id: '0198f090-2a50-7000-8000-000000000031',
	title,
	createdAt: '2026-08-01T00:00:00.000Z',
	updatedAt: '2026-08-01T00:00:00.000Z',
})

const createOrderedPlugins = (trace: string[]) => {
	const dependency = definePlugin({
		version: '0.0.0',
		core: '^0.0.0',
		pluginId: 'fixture.hooks.dependency',
		setup: ({ registries }) => {
			registries.hooks.register(
				'fixture.dependency.global-before',
				beforeOperation({
					operations: ['create-one'],
					handler: (input) => {
						trace.push('global-before:dependency')
						expect(Object.isFrozen(input)).toBe(true)
					},
				}),
			)
			registries.hooks.register(
				'fixture.dependency.schema-before',
				beforeOperation({
					schema: articleSchema,
					operations: ['create-one'],
					handler: () => {
						trace.push('schema-before:dependency')
					},
				}),
			)
			registries.hooks.register(
				'fixture.dependency.schema-after',
				afterOperation({
					schema: articleSchema,
					operations: ['create-one'],
					handler: (input) => {
						trace.push('schema-after:dependency')

						return {
							result: {
								...input.result,
								title: `${String(input.result.title)}:dependency`,
							},
						}
					},
				}),
			)
			registries.hooks.register(
				'fixture.dependency.global-after',
				afterOperation({
					operations: ['create-one'],
					handler: (input) => {
						trace.push('global-after:dependency')
						expect(Object.isFrozen(input)).toBe(true)

						return { result: input.result }
					},
				}),
			)
			registries.events.register(
				'fixture.dependency.event',
				postCommitEvent({
					schema: articleSchema,
					operations: ['create-one'],
					handler: (input) => {
						trace.push(`event:dependency:${String(input.result.title)}`)
					},
				}),
			)
			// These valid contributions prove schema and operation filters skip non-matches.
			registries.hooks.register(
				'fixture.dependency.foreign-before',
				beforeOperation({
					schema: foreignSchema,
					operations: ['create-one'],
					handler: () => {
						trace.push('unexpected:foreign')
					},
				}),
			)
			registries.hooks.register(
				'fixture.dependency.foreign-after',
				afterOperation({
					schema: foreignSchema,
					operations: ['create-one'],
					handler: (input) => {
						trace.push('unexpected:foreign-after')

						return { result: input.result }
					},
				}),
			)
		},
	})
	const consumer = definePlugin({
		version: '0.0.0',
		core: '^0.0.0',
		pluginId: 'fixture.hooks.consumer',
		dependencies: ['fixture.hooks.dependency'],
		setup: ({ registries }) => {
			registries.hooks.register(
				'fixture.consumer.global-before',
				beforeOperation({
					operations: ['create-one'],
					handler: () => {
						trace.push('global-before:consumer')
					},
				}),
			)
			registries.hooks.register(
				'fixture.consumer.schema-before',
				beforeOperation({
					schema: articleSchema,
					operations: ['create-one'],
					handler: (input) => {
						trace.push(
							`schema-before:consumer:${String(input.operation.input.title)}`,
						)
					},
				}),
			)
			registries.hooks.register(
				'fixture.consumer.schema-after',
				afterOperation({
					schema: articleSchema,
					operations: ['create-one'],
					handler: (input) => {
						trace.push(`schema-after:consumer:${String(input.result.title)}`)

						return { result: input.result }
					},
				}),
			)
			registries.hooks.register(
				'fixture.consumer.global-after',
				afterOperation({
					operations: ['create-one'],
					handler: (input) => {
						trace.push('global-after:consumer')

						return { result: input.result }
					},
				}),
			)
			registries.events.register(
				'fixture.consumer.event',
				postCommitEvent({
					schema: articleSchema,
					operations: ['create-one'],
					handler: (input) => {
						trace.push(`event:consumer:${String(input.result.title)}`)
					},
				}),
			)
			registries.events.register(
				'fixture.consumer.update-event',
				postCommitEvent({
					operations: ['update-one'],
					handler: () => {
						trace.push('unexpected:update')
					},
				}),
			)
		},
	})

	// Reversed configuration proves dependency order wins over array position.
	return [consumer, dependency] as const
}

const createPipeline = <
	const TSchemas extends readonly SchemaDefinition[],
	const TPlugins extends readonly PluginDefinition[],
>(
	application: FrameworkApplication<TSchemas, TPlugins>,
	databaseOperation: DatabaseAdapter,
	trace: string[],
): RuntimePipeline => {
	const hookStages = createRuntimeHookStages(application)
	const stages: RuntimePipelineStages = {
		normalization: (input) => input.operation,
		structuralValidation: (input) => input.operation,
		...hookStages,
		databaseOperation,
		commit: () => {
			trace.push('pipeline:commit')
		},
	}

	return new RuntimePipeline(stages)
}

const createRequest = async (
	plugins: readonly PluginDefinition[],
	results: readonly QueuedAdapterResult[],
	trace: string[],
) => {
	const application = await createApplication({
		schemas: [articleSchema, foreignSchema],
		plugins,
	})
	const adapter = new RecordingDatabaseAdapter(results, trace)
	const framework = new FrameworkEngine({
		application,
		pipeline: createPipeline(application, adapter, trace),
	})
	const request = framework.anonymous({
		requestId: 'hooks-1',
		source: requestSources.internal,
	})

	return { adapter, application, request }
}

describe('Runtime hooks and post-commit events', () => {
	it('orders plugin observers and delivers events only after commit', async () => {
		const trace: string[] = []
		const stored = createStoredArticle('stored')
		const { adapter, request } = await createRequest(
			createOrderedPlugins(trace),
			[{ status: 'fulfilled', value: stored }],
			trace,
		)

		const result = await runWithRequestEngine(request, () =>
			articleSchema.createOne({ data: { title: 'input' } }),
		)

		// Root mutations must use the transaction executor rather than the root adapter.
		expect(adapter.rootRequests).toStrictEqual([])
		expect(adapter.transactions).toHaveLength(1)
		expect(adapter.transactions[0]?.requests[0]?.operation).toMatchObject({
			kind: 'create-one',
			selection: { fields: [], kind: 'selection' },
			input: { title: 'input' },
		})
		expect(result).toBeInstanceOf(articleSchema)
		expect(result.toJSON()).toStrictEqual({
			...stored,
			title: 'stored:dependency',
		})
		expect(trace).toStrictEqual([
			'adapter:begin',
			'global-before:dependency',
			'global-before:consumer',
			'schema-before:dependency',
			'schema-before:consumer:input',
			'prepare:create-one',
			'execute:create-one',
			'schema-after:dependency',
			'schema-after:consumer:stored:dependency',
			'global-after:dependency',
			'global-after:consumer',
			'adapter:commit',
			'event:dependency:stored:dependency',
			'event:consumer:stored:dependency',
		])
	})

	it('defers external events until an explicit transaction commits', async () => {
		const trace: string[] = []
		const { request } = await createRequest(
			createOrderedPlugins(trace),
			[{ status: 'fulfilled', value: createStoredArticle('stored') }],
			trace,
		)

		await request.transaction(async () => {
			await articleSchema.createOne({ data: { title: 'input' } })
			expect(trace.some((entry) => entry.startsWith('event:'))).toBe(false)
			trace.push('transaction:callback-complete')
		})

		expect(trace.indexOf('adapter:commit')).toBeLessThan(
			trace.indexOf('event:dependency:stored:dependency'),
		)
		expect(trace).toContain('transaction:callback-complete')
	})

	it('rolls back when an after-hook aborts and never delivers its event', async () => {
		const trace: string[] = []
		const hookError = new Error('business after-hook rejected the write')
		const plugin = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.hooks.abort',
			setup: ({ registries }) => {
				registries.hooks.register(
					'fixture.abort.after',
					afterOperation({
						schema: articleSchema,
						operations: ['create-one'],
						handler: () => {
							trace.push('after:abort')
							throw hookError
						},
					}),
				)
				registries.events.register(
					'fixture.abort.event',
					postCommitEvent({
						handler: () => {
							trace.push('event:unexpected')
						},
					}),
				)
			},
		})
		const { request } = await createRequest(
			[plugin],
			[{ status: 'fulfilled', value: createStoredArticle('stored') }],
			trace,
		)

		// The root mutation owns the rollback boundary without an explicit callback.
		await expect(
			runWithRequestEngine(request, () =>
				articleSchema.createOne({ data: { title: 'input' } }),
			),
		).rejects.toBe(hookError)
		expect(trace).toStrictEqual([
			'adapter:begin',
			'prepare:create-one',
			'execute:create-one',
			'after:abort',
			'adapter:rollback',
		])
	})
})
