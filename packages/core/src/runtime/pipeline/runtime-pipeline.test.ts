import { FrameworkError } from '../../foundation.js'
import {
	Query,
	type FindOperationAst,
	type UpdateOneOperationAst,
} from '../../query/index.js'
import { relationField, Schema, stringField } from '../../schema/index.js'
import { describe, expect, it } from 'vitest'

import {
	createTrustedMasterRequestContext,
	RequestContext,
	requestSources,
} from '../context/request-context.js'
import type {
	DatabaseAdapter,
	DatabaseAdapterCapabilities,
	DatabaseConstraintNode,
	DatabaseMutationOperationAst,
	DatabaseOperationAst,
	DatabaseOperationExecutor,
	DatabaseOperationRequest,
	DatabaseOperationResult,
	DatabaseTransactionAdapter,
	PreparedDatabaseOperation,
} from '../database/contracts.js'
import {
	databaseRelationCapability,
	databaseRelationPredicateCapability,
} from '../database/contracts.js'
import { databaseConstraint } from '../enforcement/definitions.js'
import { createEnforcementState } from '../enforcement/state.js'
import type {
	RuntimeEnforcementStages,
	RuntimeNativeHookStages,
	RuntimeOperationGuardStage,
	RuntimeOperationStageInput,
	RuntimeOperationTransformStage,
	RuntimePipelineStages,
	RuntimeResultEffectStage,
	RuntimeResultTransformStage,
} from './contracts.js'
import { RuntimePipeline } from './runtime-pipeline.js'
import { createPreparedOperationFixture } from '../../../tests/runtime/fixtures/recording-database-adapter.js'

const articleSchema = Schema.define({
	className: 'Article',
	fields: {
		title: stringField({ validation: { required: true } }),
	},
})

const articleOperation = {
	kind: 'find',
	query: new Query(articleSchema).limit(10).ast,
} satisfies FindOperationAst<typeof articleSchema>

const articleUpdateOperation = {
	kind: 'update-one',
	query: new Query(articleSchema).equalTo(
		'id',
		'0198f090-2a50-7000-8000-000000000081',
	).ast,
	update: {
		kind: 'update-expression',
		operations: [{ field: 'title', kind: 'set', value: 'requested' }],
	},
} satisfies UpdateOneOperationAst<typeof articleSchema>

const relationPredicateTarget = Schema.define({
	className: 'RuntimeRelationPredicateTarget',
	fields: { label: stringField() },
})
const relationPredicateSource = Schema.define({
	className: 'RuntimeRelationPredicateSource',
	fields: {
		targets: relationField({ target: () => relationPredicateTarget }),
	},
})
const relationPredicateOperation = {
	kind: 'find',
	query: relationPredicateSource
		.query()
		.some('targets', (target) => target.equalTo('label', 'portable')).ast,
} satisfies FindOperationAst<typeof relationPredicateSource>

const requestContext = RequestContext.anonymous({
	requestId: 'request-1',
	source: requestSources.internal,
})

/** Records one operation-transform phase while proving its input is immutable. */
const createOperationTransform =
	(stageName: string, trace: string[]): RuntimeOperationTransformStage =>
	<const TOperation extends DatabaseOperationAst>(
		input: RuntimeOperationStageInput<TOperation>,
	): TOperation => {
		trace.push(stageName)
		expect(Object.isFrozen(input)).toBe(true)
		// Private adapter scopes must never become transformable business input.
		expect(input).not.toHaveProperty('relation')

		return input.operation
	}

/** Records a policy-neutral guard or validation boundary. */
const createGuard =
	(stageName: string, trace: string[]): RuntimeOperationGuardStage =>
	(input): void => {
		trace.push(stageName)
		expect(Object.isFrozen(input)).toBe(true)
	}

/** Records one opaque enforcement envelope without exposing accumulated state. */
const createEnforcementStages = (trace: string[]): RuntimeEnforcementStages => {
	const state = createEnforcementState()
	const constraint: DatabaseConstraintNode = databaseConstraint(
		'fixture.tenant',
		1,
		{ tenantId: 'tenant-1' },
	)

	return {
		evaluate: (input) => {
			trace.push('enforcement:evaluate')
			expect(Object.isFrozen(input)).toBe(true)

			return state
		},
		reevaluate: (input) => {
			trace.push('enforcement:reevaluate')
			expect(Object.isFrozen(input)).toBe(true)
			expect(input.enforcement).toBe(state)

			return state
		},
		enforceOperation: (input) => {
			trace.push('enforcement:operation')
			expect(Object.isFrozen(input)).toBe(true)
			expect(input.enforcement).toBe(state)

			return {
				constraints: [constraint],
				operation: input.operation,
			}
		},
		enforceSelectionResult: (input) => {
			trace.push('enforcement:selection-result')
			expect(Object.isFrozen(input)).toBe(true)
			expect(input.enforcement).toBe(state)

			return input.result
		},
		enforceResult: (input) => {
			trace.push('enforcement:result')
			expect(Object.isFrozen(input)).toBe(true)
			expect(input.enforcement).toBe(state)

			return input.result
		},
	}
}

/** Records an after-hook phase while retaining the operation-specific result. */
const createResultTransform =
	(stageName: string, trace: string[]): RuntimeResultTransformStage =>
	(input) => {
		trace.push(stageName)
		expect(Object.isFrozen(input)).toBe(true)

		return input.result
	}

/** Records commit and event effects that deliberately do not alter the result. */
const createResultEffect =
	(stageName: string, trace: string[]): RuntimeResultEffectStage =>
	(input): void => {
		trace.push(stageName)
		expect(Object.isFrozen(input)).toBe(true)
	}

/** Records the native dispatcher boundary independently from its hook contents. */
const createNativeHookStages = (trace: string[]): RuntimeNativeHookStages => ({
	resolveInput: createOperationTransform('native:resolveInput', trace),
	revalidate: createOperationTransform('native:revalidate', trace),
	validate: createGuard('native:validate', trace),
	schemaBefore: createOperationTransform('native:schemaBefore', trace),
	fieldBefore: (): void => {
		trace.push('native:fieldBefore')
	},
	fieldAfter: (input) => {
		trace.push('native:fieldAfter')

		return input.outcome
	},
	resolveOutput: createResultTransform('native:resolveOutput', trace),
	schemaAfter: createResultTransform('native:schemaAfter', trace),
})

/** Supplies deterministic adapter output for every generic operation call. */
class TraceDatabaseExecutor implements DatabaseOperationExecutor {
	readonly requests: DatabaseOperationRequest[] = []

	constructor(
		private readonly trace: string[],
		private readonly fixtureResult: unknown,
		readonly capabilities: DatabaseAdapterCapabilities = {},
	) {}

	execute<const TOperation extends DatabaseOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): Promise<DatabaseOperationResult<TOperation>> {
		this.trace.push('databaseOperation')
		this.requests.push(request)
		expect(Object.isFrozen(request)).toBe(true)

		// The fixture value is selected by the test's exact operation discriminant.
		return Promise.resolve(
			this.fixtureResult as DatabaseOperationResult<TOperation>,
		)
	}
}

/** Builds all mandatory phases while allowing one focused test override. */
const createStages = (
	trace: string[],
	databaseOperation: DatabaseOperationExecutor,
	overrides: Partial<RuntimePipelineStages> = {},
): RuntimePipelineStages => ({
	normalization: createOperationTransform('normalization', trace),
	structuralValidation: createOperationTransform('structuralValidation', trace),
	globalBeforeHooks: createOperationTransform('globalBeforeHooks', trace),
	schemaBeforeHooks: createOperationTransform('schemaBeforeHooks', trace),
	databaseOperation,
	schemaAfterHooks: createResultTransform('schemaAfterHooks', trace),
	globalAfterHooks: createResultTransform('globalAfterHooks', trace),
	commit: createResultEffect('commit', trace),
	postCommitEvents: createResultEffect('postCommitEvents', trace),
	...overrides,
})

describe('RuntimePipeline', () => {
	it('executes without policy placeholders when no enforcement was contributed', async () => {
		const trace: string[] = []
		const articles = [
			{
				createdAt: '2026-08-02T00:00:00.000Z',
				id: '0198f090-2a50-7000-8000-000000000001',
				title: 'UltimaBase',
				updatedAt: '2026-08-02T00:00:00.000Z',
			},
		]
		const executor = new TraceDatabaseExecutor(trace, articles)
		const pipeline = new RuntimePipeline(createStages(trace, executor))

		const result = await pipeline.execute({
			context: requestContext,
			operation: articleOperation,
		})

		expect(result).toStrictEqual(articles)
		expect(Object.isFrozen(result)).toBe(true)
		expect(trace).toStrictEqual([
			'normalization',
			'structuralValidation',
			'globalBeforeHooks',
			'schemaBeforeHooks',
			'databaseOperation',
			'schemaAfterHooks',
			'globalAfterHooks',
			'commit',
			'postCommitEvents',
		])
		expect(executor.requests[0]?.constraints).toStrictEqual([])
		expect(Object.isFrozen(executor.requests[0]?.constraints)).toBe(true)
	})

	it('keeps validation, business hooks, adapter work, and effects for master', async () => {
		const trace: string[] = []
		const executor = new TraceDatabaseExecutor(trace, [])
		const pipeline = new RuntimePipeline(createStages(trace, executor))
		const masterContext = createTrustedMasterRequestContext(
			'audited maintenance',
			'maintenance',
			RequestContext.anonymous({
				requestId: 'pipeline-master',
				source: requestSources.internal,
			}),
		)

		await pipeline.execute({
			context: masterContext,
			operation: articleOperation,
		})

		// Runtime transports master authority without manufacturing policy behavior.
		expect(trace).toStrictEqual([
			'normalization',
			'structuralValidation',
			'globalBeforeHooks',
			'schemaBeforeHooks',
			'databaseOperation',
			'schemaAfterHooks',
			'globalAfterHooks',
			'commit',
			'postCommitEvents',
		])
	})

	it('revalidates prepared values and executes the transformed update', async () => {
		const trace: string[] = []
		const target = {
			createdAt: '2026-08-02T00:00:00.000Z',
			id: '0198f090-2a50-7000-8000-000000000081',
			title: 'stored',
			updatedAt: '2026-08-02T00:00:00.000Z',
		}
		let executedOperation: DatabaseMutationOperationAst | undefined
		const transaction: DatabaseTransactionAdapter = {
			kind: 'database-transaction-adapter',
			prepare: <
				const TOperation extends DatabaseMutationOperationAst,
			>(): Promise<PreparedDatabaseOperation<TOperation>> =>
				Promise.resolve(
					createPreparedOperationFixture<TOperation>({
						execute: () =>
							Promise.resolve(
								target as unknown as DatabaseOperationResult<TOperation>,
							),
						onExecute: (operation) => {
							executedOperation = operation
						},
						target,
					}),
				),
			execute: <const TOperation extends DatabaseOperationAst>(): Promise<
				DatabaseOperationResult<TOperation>
			> => Promise.reject(new TypeError('Unexpected direct execution')),
			commit: () => Promise.resolve(),
			rollback: () => Promise.resolve(),
		}
		const enforcement = createEnforcementStages(trace)
		const pipeline = new RuntimePipeline(
			createStages(trace, transaction, {
				enforcement,
				nativeHooks: createNativeHookStages(trace),
				preparedOperationHooks: (input) => ({
					...input.operation,
					update: {
						kind: 'update-expression',
						operations: [{ field: 'title', kind: 'set', value: target.title }],
					},
				}),
			}),
		)

		await pipeline.execute({
			context: requestContext,
			operation: articleUpdateOperation,
		})

		expect(executedOperation).toMatchObject({
			kind: 'update-one',
			update: {
				operations: [{ field: 'title', kind: 'set', value: 'stored' }],
			},
		})
		expect(
			trace.filter((entry) => entry === 'enforcement:reevaluate'),
		).toHaveLength(2)
	})

	it('reapplies operation enforcement after hooks and restricts the final result', async () => {
		const trace: string[] = []
		const executor = new TraceDatabaseExecutor(trace, [])
		const pipeline = new RuntimePipeline(
			createStages(trace, executor, {
				enforcement: createEnforcementStages(trace),
				nativeHooks: createNativeHookStages(trace),
			}),
		)

		await pipeline.execute({
			context: requestContext,
			operation: articleOperation,
		})

		expect(trace).toStrictEqual([
			'normalization',
			'structuralValidation',
			'native:resolveInput',
			'native:revalidate',
			'native:validate',
			'enforcement:evaluate',
			'enforcement:operation',
			'globalBeforeHooks',
			'schemaBeforeHooks',
			'native:schemaBefore',
			'native:revalidate',
			'enforcement:reevaluate',
			'enforcement:operation',
			'databaseOperation',
			'enforcement:selection-result',
			'native:resolveOutput',
			'native:schemaAfter',
			'schemaAfterHooks',
			'globalAfterHooks',
			'enforcement:result',
			'commit',
			'postCommitEvents',
		])
		expect(executor.requests[0]?.constraints).toStrictEqual([
			{
				kind: 'fixture.tenant',
				version: 1,
				payload: { tenantId: 'tenant-1' },
			},
		])
	})

	it('keeps a relation scope private while enforcing and forwarding it', async () => {
		const trace: string[] = []
		const executor = new TraceDatabaseExecutor(trace, [], {
			relations: databaseRelationCapability,
		})
		const relation = {
			fieldPath: ['tags'],
			source: articleSchema,
			sourceObjectId: '0198f090-2a50-7000-8000-000000000070',
			target: articleSchema,
		} as const
		const enforcement = createEnforcementStages(trace)
		const pipeline = new RuntimePipeline(
			createStages(trace, executor, {
				enforcement: {
					...enforcement,
					enforceRelationRead: (input) => {
						trace.push('enforcement:relation-read')
						expect(Object.isFrozen(input)).toBe(true)
						expect(input.relation).toBe(relation)
					},
				},
			}),
		)

		await pipeline.execute({
			context: requestContext,
			operation: articleOperation,
			relation,
		})

		expect(trace).toContain('enforcement:relation-read')
		expect(executor.requests).toHaveLength(1)
		expect(executor.requests[0]?.relation).toBe(relation)
	})

	it('fails closed when an adapter does not advertise relation support', async () => {
		const trace: string[] = []
		const executor = new TraceDatabaseExecutor(trace, [])
		const pipeline = new RuntimePipeline(createStages(trace, executor))

		await expect(
			pipeline.execute({
				context: requestContext,
				operation: articleOperation,
				relation: {
					fieldPath: ['tags'],
					source: articleSchema,
					sourceObjectId: '0198f090-2a50-7000-8000-000000000071',
					target: articleSchema,
				},
			}),
		).rejects.toMatchObject({
			code: 'INTERNAL_ERROR',
			publicMessage: 'Relation queries are not available.',
		})
		expect(executor.requests).toStrictEqual([])
	})

	it('fails closed when an adapter cannot compile relation predicates', async () => {
		const trace: string[] = []
		const executor = new TraceDatabaseExecutor(trace, [])
		const pipeline = new RuntimePipeline(
			createStages(trace, executor, {
				enforcement: createEnforcementStages(trace),
			}),
		)

		await expect(
			pipeline.execute({
				context: requestContext,
				operation: relationPredicateOperation,
			}),
		).rejects.toMatchObject({
			code: 'INTERNAL_ERROR',
			publicMessage: 'Relation filters are not available.',
		})
		expect(executor.requests).toStrictEqual([])
	})

	it('requires private target policy for every relation predicate leaf', async () => {
		const trace: string[] = []
		const executor = new TraceDatabaseExecutor(trace, [], {
			relationPredicates: databaseRelationPredicateCapability,
		})
		const pipeline = new RuntimePipeline(
			createStages(trace, executor, {
				enforcement: createEnforcementStages(trace),
			}),
		)

		await expect(
			pipeline.execute({
				context: requestContext,
				operation: relationPredicateOperation,
			}),
		).rejects.toMatchObject({
			code: 'INTERNAL_ERROR',
			publicMessage: 'Relation filters are not available.',
		})
		expect(executor.requests).toStrictEqual([])
	})

	it('preserves framework errors and stops every later phase', async () => {
		const trace: string[] = []
		const executor = new TraceDatabaseExecutor(trace, [])
		const denial = new FrameworkError(
			'PERMISSION_DENIED',
			'Fixture guard rejected the operation',
		)
		const enforcement = createEnforcementStages(trace)
		const pipeline = new RuntimePipeline(
			createStages(trace, executor, {
				enforcement: {
					...enforcement,
					evaluate: (input) => {
						trace.push('enforcement:deny')
						expect(input.operation).toBe(articleOperation)

						throw denial
					},
				},
			}),
		)

		const execution = pipeline.execute({
			context: requestContext,
			operation: articleOperation,
		})

		await expect(execution).rejects.toBe(denial)
		await expect(execution).rejects.toMatchObject({
			code: 'PERMISSION_DENIED',
		})
		expect(trace).toStrictEqual([
			'normalization',
			'structuralValidation',
			'enforcement:deny',
		])
		expect(executor.requests).toStrictEqual([])
	})

	it('rejects an invalid replacement from the retained low-level after hooks', async () => {
		const trace: string[] = []
		const executor = new TraceDatabaseExecutor(trace, [
			{
				createdAt: '2026-08-02T00:00:00.000Z',
				id: '0198f090-2a50-7000-8000-000000000040',
				title: 'Valid adapter result',
				updatedAt: '2026-08-02T00:00:00.000Z',
			},
		])
		const pipeline = new RuntimePipeline(
			createStages(trace, executor, {
				globalAfterHooks: () =>
					[
						// The final shared boundary protects malformed JavaScript hook output.
						{},
					] as never,
			}),
		)

		await expect(
			pipeline.execute({
				context: requestContext,
				operation: articleOperation,
			}),
		).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
		expect(trace).not.toContain('commit')
		expect(trace).not.toContain('postCommitEvents')
	})

	it('rejects an omitted mandatory stage during JavaScript assembly', () => {
		const trace: string[] = []
		const stages = createStages(trace, new TraceDatabaseExecutor(trace, []))

		expect(
			() =>
				new RuntimePipeline({
					...stages,
					// @ts-expect-error -- Runtime validation protects JavaScript assembly.
					structuralValidation: undefined,
				}),
		).toThrow(
			new TypeError(
				'Runtime pipeline stage structuralValidation must be a function',
			),
		)
	})

	it('rejects malformed JavaScript pipeline assembly eagerly', () => {
		const trace: string[] = []
		const stages = createStages(trace, new TraceDatabaseExecutor(trace, []))

		expect(
			() =>
				// @ts-expect-error -- Runtime validation protects non-object assembly.
				new RuntimePipeline([]),
		).toThrow(new TypeError('Runtime pipeline stages must be a plain object'))

		for (const invalidExecutor of [undefined, null, {}, { execute: true }]) {
			expect(
				() =>
					new RuntimePipeline({
						...stages,
						// @ts-expect-error -- Runtime validation rejects forged executors.
						databaseOperation: invalidExecutor,
					}),
			).toThrow(
				new TypeError(
					'Runtime pipeline databaseOperation must be an operation executor',
				),
			)
		}
	})

	it('rejects malformed constraint envelopes at the enforcement boundary', async () => {
		const invalidCases: readonly {
			readonly output: readonly unknown[] | string
			readonly message: string
		}[] = [
			{
				output: 'not-an-array',
				message: 'Runtime enforcement constraints must be an array',
			},
			{
				output: [null],
				message: 'Runtime enforcement returned an invalid constraint',
			},
			{
				output: [{ kind: '', payload: null }],
				message:
					'Runtime enforcement constraint kind must be a non-empty string',
			},
			{
				output: [
					{ kind: 'fixture.invalid-version', version: 0, payload: null },
				],
				message:
					'Runtime enforcement constraint version must be a positive safe integer',
			},
			{
				output: [{ kind: 'fixture.missing-payload', version: 1 }],
				message:
					'Runtime enforcement constraint must contain an opaque payload',
			},
		]

		for (const invalidCase of invalidCases) {
			const trace: string[] = []
			const executor = new TraceDatabaseExecutor(trace, [])
			const enforcement = createEnforcementStages(trace)
			const pipeline = new RuntimePipeline(
				createStages(trace, executor, {
					enforcement: {
						...enforcement,
						enforceOperation: (input) => ({
							// Runtime validation protects JavaScript plugin boundaries.
							constraints: invalidCase.output as never,
							operation: input.operation,
						}),
					},
				}),
			)

			await expect(
				pipeline.execute({
					context: requestContext,
					operation: articleOperation,
				}),
			).rejects.toThrow(new TypeError(invalidCase.message))
			expect(executor.requests).toStrictEqual([])
		}
	})

	it('rejects malformed JavaScript execution requests before normalization', async () => {
		const trace: string[] = []
		const pipeline = new RuntimePipeline(
			createStages(trace, new TraceDatabaseExecutor(trace, [])),
		)

		await expect(
			// @ts-expect-error -- Runtime validation protects non-object requests.
			pipeline.execute(null),
		).rejects.toThrow(
			new TypeError('Runtime pipeline request must be a plain object'),
		)
		await expect(
			pipeline.execute({
				// @ts-expect-error -- Runtime validation rejects forged contexts.
				context: {},
				operation: articleOperation,
			}),
		).rejects.toThrow(
			new TypeError('Runtime pipeline context must be a RequestContext'),
		)
		expect(trace).toStrictEqual([])
	})

	it('requires a valid database adapter before opening a transaction', async () => {
		const trace: string[] = []
		const executor = new TraceDatabaseExecutor(trace, [])
		const pipeline = new RuntimePipeline(createStages(trace, executor))

		await expect(pipeline.beginTransaction()).rejects.toMatchObject({
			code: 'TRANSACTION_ERROR',
			internalDetails: { reason: 'database-adapter-required' },
		})

		const invalidAdapter = {
			kind: 'database-adapter' as const,
			execute: <const TOperation extends DatabaseOperationAst>(
				request: DatabaseOperationRequest<TOperation>,
			): Promise<DatabaseOperationResult<TOperation>> =>
				executor.execute(request),
			beginTransaction: (): Promise<null> => Promise.resolve(null),
		}
		const invalidTransactionPipeline = new RuntimePipeline(
			createStages(trace, invalidAdapter),
		)

		await expect(
			invalidTransactionPipeline.beginTransaction(),
		).rejects.toMatchObject({
			code: 'TRANSACTION_ERROR',
			internalDetails: { reason: 'invalid-transaction-adapter' },
		})
	})

	it('prevents a transaction scope from being finalized twice', async () => {
		const trace: string[] = []
		const executor = new TraceDatabaseExecutor(trace, [])
		const transaction: DatabaseTransactionAdapter = {
			kind: 'database-transaction-adapter',
			prepare: <const TOperation extends DatabaseMutationOperationAst>(
				request: DatabaseOperationRequest<TOperation>,
			): Promise<PreparedDatabaseOperation<TOperation>> =>
				Promise.resolve(
					createPreparedOperationFixture({
						execute: () => executor.execute(request),
					}),
				),
			execute: <const TOperation extends DatabaseOperationAst>(
				request: DatabaseOperationRequest<TOperation>,
			): Promise<DatabaseOperationResult<TOperation>> =>
				executor.execute(request),
			commit: (): Promise<void> => Promise.resolve(),
			rollback: (): Promise<void> => Promise.resolve(),
		}
		const adapter: DatabaseAdapter = {
			kind: 'database-adapter',
			execute: <const TOperation extends DatabaseOperationAst>(
				request: DatabaseOperationRequest<TOperation>,
			): Promise<DatabaseOperationResult<TOperation>> =>
				executor.execute(request),
			beginTransaction: (): Promise<DatabaseTransactionAdapter> =>
				Promise.resolve(transaction),
		}
		const pipeline = new RuntimePipeline(createStages(trace, adapter))
		const committedScope = await pipeline.beginTransaction()

		await expect(committedScope.flushPostCommitEvents()).rejects.toThrow(
			new TypeError(
				'Runtime transaction events require a committed transaction',
			),
		)
		await committedScope.commit()
		await committedScope.flushPostCommitEvents()
		await expect(committedScope.commit()).rejects.toThrow(
			new TypeError('Runtime transaction scope is already finalized'),
		)
		await expect(committedScope.rollback()).rejects.toThrow(
			new TypeError('Runtime transaction scope is already finalized'),
		)

		const rolledBackScope = await pipeline.beginTransaction()

		await rolledBackScope.rollback()
		await expect(rolledBackScope.commit()).rejects.toThrow(
			new TypeError('Runtime transaction scope is already finalized'),
		)
	})
})
