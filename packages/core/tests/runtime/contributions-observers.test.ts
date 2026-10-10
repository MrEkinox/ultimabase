import { applicationFixture } from '../application-fixture.js'
import { isPlainRecord } from '@ultimabase/shared'
import {
	plugin as createPlugin,
	type PluginDefinition,
	type SchemaDefinition,
} from '../../src/index.js'
import {
	createApplication,
	type FrameworkApplication,
} from '../../src/application/framework-application.js'

import { describe, expect, it } from 'vitest'

import {
	getOperationSchema,
	runWithRequestEngine,
	RuntimePipeline,
	type DatabaseAdapter,
	type RuntimeLogicalOperationAst,
	type RuntimeOperationGuardStage,
	type RuntimePipelineStages,
	type RuntimeResultEffectStage,
	type RuntimeResultTransformStage,
	provideRuntimeBehavior,
} from '../../src/runtime/index.js'
import { FrameworkEngine } from '../../src/runtime/engine/framework-engine.js'
import { composeRuntimeBehaviors } from '../../src/runtime/behaviors/composition.js'
import {
	RecordingDatabaseAdapter,
	type QueuedAdapterResult,
} from './fixtures/recording-database-adapter.js'
import { UltimaBase } from '../../src/runtime/application/ultima-base.js'
import { requestSources } from '../../src/plugin.js'

interface ObserverScope {
	readonly schema?: SchemaDefinition
}

/** Limits one behavior observer to singular creates of an optional schema. */
const matchesCreate = (
	scope: ObserverScope,
	operation: RuntimeLogicalOperationAst,
): boolean =>
	operation.kind === 'create-one' &&
	(scope.schema === undefined || getOperationSchema(operation) === scope.schema)

const createTestRuntimeContributions = (
	declare: (
		before: (
			name: string,
			scope: ObserverScope,
			handler: RuntimeOperationGuardStage,
		) => void,
		after: (
			name: string,
			scope: ObserverScope,
			handler: RuntimeResultTransformStage,
		) => void,
		postCommit: (name: string, handler: RuntimeResultEffectStage) => void,
	) => void,
) => {
	const provides: ReturnType<typeof provideRuntimeBehavior>[] = []
	declare(
		(name, scope, handler) => {
			provides.push(
				provideRuntimeBehavior({
					contributionId: name,
					create: () => ({
						value: {
							beforeOperation: (input) =>
								matchesCreate(scope, input.operation)
									? handler(input)
									: undefined,
						},
					}),
				}),
			)
		},
		(name, scope, handler) => {
			provides.push(
				provideRuntimeBehavior({
					contributionId: name,
					create: () => ({
						value: {
							transformResult: (input) =>
								matchesCreate(scope, input.operation)
									? handler(input)
									: input.result,
						},
					}),
				}),
			)
		},
		(name, definition) => {
			provides.push(
				provideRuntimeBehavior({
					contributionId: name,
					create: () => ({ value: { postCommit: definition } }),
				}),
			)
		},
	)
	return provides
}

/** Reads the fixture title from an untyped create input or result record. */
const readTitle = (value: unknown): string => {
	if (!isPlainRecord(value) || typeof value.title !== 'string') {
		throw new TypeError('Expected a fixture article record')
	}
	return value.title
}

const articleSchema = UltimaBase.Schema.define({
	className: 'ContributionArticle',
	fields: (field) => ({
		title: field.string({ required: true }),
	}),
})

const foreignSchema = UltimaBase.Schema.define({
	className: 'ContributionForeign',
	fields: (field) => ({
		title: field.string({ required: true }),
	}),
})

/** Produces the complete persisted shape expected by create-operation contributions. */
const createStoredArticle = (title: string) => ({
	id: '0198f090-2a50-7000-8000-000000000031',
	title,
	createdAt: '2026-08-01T00:00:00.000Z',
	updatedAt: '2026-08-01T00:00:00.000Z',
})

const createOrderedPlugins = (trace: string[]) => {
	const dependency = createPlugin({
		version: '0.0.0',
		core: '^0.0.0',
		id: 'fixture.contributions.dependency',
		permissions: {
			'runtime:intercept': 'Registers Runtime behavior observers for tests.',
		},
		contributions: createTestRuntimeContributions(
			(before, after, postCommit) => {
				before('fixture.dependency.global-before', {}, (input) => {
					trace.push('global-before:dependency')
					expect(Object.isFrozen(input)).toBe(true)
				})
				before(
					'fixture.dependency.schema-before',
					{ schema: articleSchema },
					() => {
						trace.push('schema-before:dependency')
					},
				)
				after(
					'fixture.dependency.schema-after',
					{ schema: articleSchema },
					(input) => {
						trace.push('schema-after:dependency')

						// Behavior transforms may replace the result with a same-shaped value.
						return {
							...(input.result as object),
							title: `${readTitle(input.result)}:dependency`,
						} as typeof input.result
					},
				)
				after('fixture.dependency.global-after', {}, (input) => {
					trace.push('global-after:dependency')
					expect(Object.isFrozen(input)).toBe(true)

					return input.result
				})
				postCommit('fixture.dependency.event', (input) => {
					// The product behavior runs only for its singular create operation.
					if (input.operation.kind === 'create-one') {
						if (!isPlainRecord(input.result))
							throw new TypeError('Expected a singular create result')
						trace.push(`event:dependency:${String(input.result.title)}`)
					}
				})
				// These valid contributions prove schema and operation filters skip non-matches.
				before(
					'fixture.dependency.foreign-before',
					{ schema: foreignSchema },
					() => {
						trace.push('unexpected:foreign')
					},
				)
				after(
					'fixture.dependency.foreign-after',
					{ schema: foreignSchema },
					(input) => {
						trace.push('unexpected:foreign-after')

						return input.result
					},
				)
			},
		),
	})
	const consumer = createPlugin({
		version: '0.0.0',
		core: '^0.0.0',
		id: 'fixture.contributions.consumer',
		permissions: {
			'runtime:intercept': 'Registers Runtime behavior observers for tests.',
		},
		dependencies: [
			{ pluginId: 'fixture.contributions.dependency', version: '^0.0.0' },
		],
		contributions: createTestRuntimeContributions(
			(before, after, postCommit) => {
				before('fixture.consumer.global-before', {}, () => {
					trace.push('global-before:consumer')
				})
				before(
					'fixture.consumer.schema-before',
					{ schema: articleSchema },
					(input) => {
						const operation: unknown = input.operation
						const data: unknown = isPlainRecord(operation)
							? operation.input
							: undefined
						trace.push(`schema-before:consumer:${readTitle(data)}`)
					},
				)
				after(
					'fixture.consumer.schema-after',
					{ schema: articleSchema },
					(input) => {
						trace.push(`schema-after:consumer:${readTitle(input.result)}`)

						return input.result
					},
				)
				after('fixture.consumer.global-after', {}, (input) => {
					trace.push('global-after:consumer')

					return input.result
				})
				postCommit('fixture.consumer.event', (input) => {
					// The product behavior runs only for its singular create operation.
					if (input.operation.kind === 'create-one') {
						if (!isPlainRecord(input.result))
							throw new TypeError('Expected a singular create result')
						trace.push(`event:consumer:${String(input.result.title)}`)
					}
				})
				postCommit('fixture.consumer.update-event', (input) => {
					if (input.operation.kind === 'update-one')
						trace.push('unexpected:update')
				})
			},
		),
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
	const behavior = composeRuntimeBehaviors(application)
	const stages: RuntimePipelineStages = {
		normalization: (input) => input.operation,
		structuralValidation: (input) => input.operation,
		finalMutationValidation: (input) => input.operation,
		...(behavior === undefined ? {} : { behaviors: behavior }),
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
	const application = applicationFixture(
		await createApplication({
			schemas: [articleSchema, foreignSchema],
			plugins,
		}),
	)
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

describe('Runtime contributions and post-commit events', () => {
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
		expect(Object.getPrototypeOf(result)).toBe(Object.prototype)
		expect(result).toStrictEqual({
			...stored,
			title: 'stored:dependency',
		})
		// Behavior providers run in plugin graph order, then contribution order.
		expect(trace).toStrictEqual([
			'adapter:begin',
			'global-before:dependency',
			'schema-before:dependency',
			'global-before:consumer',
			'schema-before:consumer:input',
			'prepare:create-one',
			'execute:create-one',
			'schema-after:dependency',
			'global-after:dependency',
			'schema-after:consumer:stored:dependency',
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
		const plugin = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.contributions.abort',
			permissions: {
				'runtime:intercept': 'Registers a low-level Runtime hook for tests.',
			},
			contributions: createTestRuntimeContributions(
				(_before, after, postCommit) => {
					after('fixture.abort.after', { schema: articleSchema }, () => {
						trace.push('after:abort')
						throw hookError
					})
					postCommit('fixture.abort.event', () => {
						trace.push('event:unexpected')
					})
				},
			),
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
