import {
	createApplication,
	definePlugin,
	type FrameworkApplication,
	type PluginDefinition,
} from '@ultimabase/core'
import { Schema, stringField, type SchemaDefinition } from '@ultimabase/schema'
import { describe, expect, it } from 'vitest'

import {
	afterOperation,
	beforeOperation,
	createRuntimeHookStages,
	FrameworkEngine,
	postCommitEvent,
	requestSources,
	RuntimePipeline,
	type DatabaseAdapter,
	type RuntimePipelineStages,
} from '../src/index.js'
import {
	RecordingDatabaseAdapter,
	type QueuedAdapterResult,
} from './fixtures/recording-database-adapter.js'

const articleSchema = new Schema({
	className: 'HookArticle',
	fields: { title: stringField({ validation: { required: true } }) },
})

const foreignSchema = new Schema({
	className: 'HookForeign',
	fields: { title: stringField({ validation: { required: true } }) },
})

/** Produces the complete persisted shape expected by create-operation hooks. */
const createStoredArticle = (title: string) => ({
	id: 'article-1',
	title,
	createdAt: '2026-08-01T00:00:00.000Z',
	updatedAt: '2026-08-01T00:00:00.000Z',
})

const createOrderedPlugins = (trace: string[]) => {
	const dependency = definePlugin({
		name: 'fixture.hooks.dependency',
		setup: ({ registries }) => {
			registries.hooks.register(
				'fixture.dependency.global-before',
				beforeOperation({
					operations: ['create-one'],
					handler: (input) => {
						trace.push('global-before:dependency')
						expect(Object.isFrozen(input)).toBe(true)

						return { operation: input.operation }
					},
				}),
			)
			registries.hooks.register(
				'fixture.dependency.schema-before',
				beforeOperation({
					schema: articleSchema,
					operations: ['create-one'],
					handler: (input) => {
						trace.push('schema-before:dependency')

						return {
							operation: {
								...input.operation,
								input: {
									...input.operation.input,
									title: `${input.operation.input.title}:dependency`,
								},
							},
						}
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
								title: `${input.result.title}:dependency`,
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
						trace.push(`event:dependency:${input.result.title}`)
					},
				}),
			)
			// These valid contributions prove schema and operation filters skip non-matches.
			registries.hooks.register(
				'fixture.dependency.foreign-before',
				beforeOperation({
					schema: foreignSchema,
					operations: ['create-one'],
					handler: (input) => {
						trace.push('unexpected:foreign')

						return { operation: input.operation }
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
		name: 'fixture.hooks.consumer',
		dependencies: ['fixture.hooks.dependency'],
		setup: ({ registries }) => {
			registries.hooks.register(
				'fixture.consumer.global-before',
				beforeOperation({
					operations: ['create-one'],
					handler: (input) => {
						trace.push('global-before:consumer')

						return { operation: input.operation }
					},
				}),
			)
			registries.hooks.register(
				'fixture.consumer.schema-before',
				beforeOperation({
					schema: articleSchema,
					operations: ['create-one'],
					handler: (input) => {
						trace.push(`schema-before:consumer:${input.operation.input.title}`)

						return { operation: input.operation }
					},
				}),
			)
			registries.hooks.register(
				'fixture.consumer.schema-after',
				afterOperation({
					schema: articleSchema,
					operations: ['create-one'],
					handler: (input) => {
						trace.push(`schema-after:consumer:${input.result.title}`)

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
						trace.push(`event:consumer:${input.result.title}`)
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
		clp: () => undefined,
		acl: (input) => input.accessConstraints,
		fieldPermissions: (input) => ({
			operation: input.operation,
			accessConstraints: input.accessConstraints,
		}),
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
	it('orders plugin transformations and delivers events only after commit', async () => {
		const trace: string[] = []
		const stored = createStoredArticle('stored')
		const { adapter, request } = await createRequest(
			createOrderedPlugins(trace),
			[{ status: 'fulfilled', value: stored }],
			trace,
		)

		const result = await request.query(articleSchema).create({ title: 'input' })

		expect(adapter.rootRequests[0]?.operation).toMatchObject({
			kind: 'create-one',
			input: { title: 'input:dependency' },
		})
		expect(result).toStrictEqual({
			...stored,
			title: 'stored:dependency',
		})
		expect(trace).toStrictEqual([
			'global-before:dependency',
			'global-before:consumer',
			'schema-before:dependency',
			'schema-before:consumer:input:dependency',
			'execute:create-one',
			'schema-after:dependency',
			'schema-after:consumer:stored:dependency',
			'global-after:dependency',
			'global-after:consumer',
			'pipeline:commit',
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

		await request.transaction(async (transaction) => {
			await transaction.query(articleSchema).create({ title: 'input' })
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
			name: 'fixture.hooks.abort',
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

		await expect(
			request.transaction((transaction) =>
				transaction.query(articleSchema).create({ title: 'input' }),
			),
		).rejects.toBe(hookError)
		expect(trace).toStrictEqual([
			'adapter:begin',
			'execute:create-one',
			'after:abort',
			'adapter:rollback',
		])
	})
})
