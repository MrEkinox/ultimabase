import { QueryBuilder, type FindManyOperationAst } from '../../query/index.js'

import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'
import { describe, expect, it } from 'vitest'

import { RequestContext, requestSources } from '../context/request-context.js'
import { createFixtureMasterContext } from '../../../tests/fixtures/master-context.js'
import type {
	DatabaseConstraintNode,
	DatabaseMutationOperationAst,
	DatabaseOperationAst,
	DatabaseOperationExecutor,
	DatabaseOperationRequest,
	DatabaseOperationResult,
	DatabaseTransactionAdapter,
	PreparedDatabaseOperation,
} from '../database/contracts.js'
import { databasePersistencePlanCapability } from '../database/contracts.js'
import { databaseConstraint } from '../enforcement/definitions.js'

import type {
	RuntimeEnforcementStages,
	RuntimeOperationResult,
	RuntimePreparedMutationTransformStage,
	RuntimeResultStageInput,
	RuntimeResultTransformStage,
} from './contracts.js'
import { RuntimePipeline } from './runtime-pipeline.js'
import { createPreparedOperationFixture } from '../../../tests/runtime/fixtures/recording-database-adapter.js'
import { readRuntimeSchemaModelMetadata } from '../operations/model-metadata.js'

import {
	articleOperation,
	articleSchema,
	articleUpdateOperation,
	articleUpdateManyOperation,
	createBehaviorStages,
	createEnforcementStages,
	createStages,
	requestContext,
	TraceDatabaseExecutor,
} from '../../../tests/fixtures/runtime-pipeline.js'

describe('RuntimePipeline', () => {
	it('keeps protected identities attached when result hooks filter a find', async () => {
		const first = immutableRecord({
			id: '0198f090-2a50-7000-8000-000000000091',
			title: 'First',
		})
		const second = immutableRecord({
			id: '0198f090-2a50-7000-8000-000000000092',
			title: 'Second',
		})
		const identities = new WeakMap<object, string>([
			[first, '0198f090-2a50-7000-8000-000000000091'],
			[second, '0198f090-2a50-7000-8000-000000000092'],
		])
		const executor: DatabaseOperationExecutor = {
			capabilities: { persistencePlans: databasePersistencePlanCapability },
			execute: <const TOperation extends DatabaseOperationAst>() =>
				Promise.resolve(
					immutableArray([
						first,
						second,
					]) as unknown as DatabaseOperationResult<TOperation>,
				),
			readObjectIdentity: (record) => identities.get(record),
		}
		const retainSecondResult: RuntimeResultTransformStage = <
			const TOperation extends DatabaseOperationAst,
		>(
			input: RuntimeResultStageInput<TOperation>,
		): RuntimeOperationResult<TOperation> => {
			const secondResult = isUnknownArray(input.result)
				? input.result[1]
				: undefined

			if (
				input.operation.kind !== 'find-many' ||
				!isPlainRecord(secondResult)
			) {
				throw new TypeError('Expected a find result containing two records')
			}

			return immutableArray([
				secondResult,
			]) as unknown as RuntimeOperationResult<TOperation>
		}
		const operation = immutableRecord({
			kind: 'find-many',
			query: new QueryBuilder(articleSchema).select({ title: true }).ast,
		}) satisfies FindManyOperationAst<typeof articleSchema>
		const pipeline = new RuntimePipeline(
			createStages([], executor, {
				behaviors: { transformResult: retainSecondResult },
			}),
		)

		const result = await pipeline.execute({
			context: requestContext,
			operation,
		})

		expect(result.map(({ title }) => title)).toStrictEqual(['Second'])
		const retainedResult = result[0]

		if (retainedResult === undefined) {
			throw new TypeError('Expected the retained second result')
		}

		expect(readRuntimeSchemaModelMetadata(retainedResult)).toMatchObject({
			objectId: '0198f090-2a50-7000-8000-000000000092',
		})
	})

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
			'databaseOperation',
			'commit',
		])
		expect(executor.requests[0]?.constraints).toStrictEqual([])
		expect(Object.isFrozen(executor.requests[0]?.constraints)).toBe(true)
	})

	it('keeps validation, business hooks, adapter work, and effects for master', async () => {
		const trace: string[] = []
		const executor = new TraceDatabaseExecutor(trace, [])
		const pipeline = new RuntimePipeline(createStages(trace, executor))
		const masterContext = createFixtureMasterContext(
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

		expect(trace).toStrictEqual([
			'normalization',
			'structuralValidation',
			'databaseOperation',
			'commit',
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
		let executedConstraints: readonly DatabaseConstraintNode[] | undefined
		const transaction: DatabaseTransactionAdapter = {
			capabilities: { persistencePlans: databasePersistencePlanCapability },
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
						onExecute: (request) => {
							executedOperation = request?.operation
							executedConstraints = request?.constraints
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
		const finalConstraint = databaseConstraint('fixture.resolved-title', 1, {
			title: 'stored',
		})
		const enforcement = createEnforcementStages(trace, finalConstraint)
		let schemaResolveTarget: unknown
		const transformPreparedInput: RuntimePreparedMutationTransformStage = (
			input,
		) => {
			trace.push('behavior:transformPreparedInput')
			schemaResolveTarget = input.target

			return input.operation
		}
		const pipeline = new RuntimePipeline(
			createStages(trace, transaction, {
				enforcement,
				behaviors: {
					transformPreparedInput,
					transformPreparedOperation: (input) => ({
						...input.operation,
						update: {
							kind: 'update-expression',
							operations: [
								{ field: 'title', kind: 'set', value: target.title },
							],
						},
					}),
				},
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
		expect(schemaResolveTarget).toStrictEqual(target)
		expect(trace.indexOf('enforcement:prepared')).toBeLessThan(
			trace.indexOf('behavior:transformPreparedInput'),
		)
		expect(
			trace.filter((entry) => entry === 'enforcement:reevaluate'),
		).toHaveLength(1)
		expect(executedConstraints).toStrictEqual([
			{
				kind: 'fixture.tenant',
				payload: { tenantId: 'tenant-1' },
				version: 1,
			},
			{
				kind: 'fixture.resolved-title',
				payload: { title: 'stored' },
				version: 1,
			},
		])
	})

	it('preserves the complete mandatory mutation stage order', async () => {
		const trace: string[] = []
		const target = immutableRecord({
			createdAt: '2026-08-11T00:00:00.000Z',
			id: '0198f090-2a50-7000-8000-000000000081',
			title: 'stored',
			updatedAt: '2026-08-11T00:00:00.000Z',
		})
		const transaction: DatabaseTransactionAdapter = {
			capabilities: { persistencePlans: databasePersistencePlanCapability },
			kind: 'database-transaction-adapter',
			prepare: <const TOperation extends DatabaseMutationOperationAst>() => {
				trace.push('database:prepare')

				return Promise.resolve(
					createPreparedOperationFixture<TOperation>({
						execute: () =>
							Promise.resolve(
								target as unknown as DatabaseOperationResult<TOperation>,
							),
						onExecute: () => {
							trace.push('database:execute')
						},
						target,
					}),
				)
			},
			execute: <const TOperation extends DatabaseOperationAst>(): Promise<
				DatabaseOperationResult<TOperation>
			> => Promise.reject(new TypeError('Unexpected direct execution')),
			commit: () => Promise.resolve(),
			rollback: () => Promise.resolve(),
		}
		const enforcement: RuntimeEnforcementStages = {
			...createEnforcementStages(trace),
			enforcePreparedMutation: () => {
				trace.push('enforcement:prepared')
			},
			enforceMutationOutcome: (input) => {
				trace.push('enforcement:mutation-outcome')

				return input.outcome
			},
		}
		const pipeline = new RuntimePipeline(
			createStages(trace, transaction, {
				behaviors: createBehaviorStages(trace),
				enforcement,
			}),
		)

		await pipeline.execute({
			context: requestContext,
			operation: articleUpdateOperation,
		})

		expect(trace).toStrictEqual([
			'normalization',
			'structuralValidation',
			'enforcement:evaluate',
			'enforcement:operation',
			'database:prepare',
			'enforcement:prepared',
			'behavior:transformInput',
			'behavior:transformPreparedInput',
			'behavior:transformPreparedOperation',
			'final-validation',
			'enforcement:reevaluate',
			'enforcement:operation',
			'enforcement:prepared',
			'behavior:beforeOperation',
			'behavior:observePreparedMutation',
			'database:execute',
			'enforcement:mutation-outcome',
			'behavior:transformMutationOutcome',
			'enforcement:selection-result',
			'behavior:transformDatabaseResult',
			'behavior:transformResult',
			'enforcement:result',
			'commit',
			'behavior:postCommit',
		])
	})

	it('forwards a behavior item-target requirement to mutation preparation', async () => {
		const trace: string[] = []
		let preparedRequest: DatabaseOperationRequest | undefined
		const transaction: DatabaseTransactionAdapter = {
			capabilities: { persistencePlans: databasePersistencePlanCapability },
			kind: 'database-transaction-adapter',
			prepare: <const TOperation extends DatabaseMutationOperationAst>(
				request: DatabaseOperationRequest<TOperation>,
			): Promise<PreparedDatabaseOperation<TOperation>> => {
				preparedRequest = request

				return Promise.resolve({
					execute: () =>
						Promise.resolve({ materializations: [], result: [] }) as Promise<
							Awaited<
								ReturnType<PreparedDatabaseOperation<TOperation>['execute']>
							>
						>,
					targets: immutableArray([]),
				} as unknown as PreparedDatabaseOperation<TOperation>)
			},
			execute: <const TOperation extends DatabaseOperationAst>(): Promise<
				DatabaseOperationResult<TOperation>
			> => Promise.reject(new TypeError('Unexpected direct execution')),
			commit: () => Promise.resolve(),
			rollback: () => Promise.resolve(),
		}
		const pipeline = new RuntimePipeline(
			createStages(trace, transaction, {
				behaviors: { requiresPreparedMutationItems: () => true },
			}),
		)

		await expect(
			pipeline.execute({
				context: requestContext,
				operation: articleUpdateManyOperation,
			}),
		).resolves.toStrictEqual([])
		expect(preparedRequest?.prepareMutationItems).toBe(true)
	})

	it('forwards Access bulk targets from preparation to enforcement', async () => {
		const trace: string[] = []
		const targets = immutableArray([
			immutableRecord({
				createdAt: '2026-08-08T00:00:00.000Z',
				id: '0198f090-2a50-7000-8000-000000000082',
				title: 'First',
				updatedAt: '2026-08-08T00:00:00.000Z',
			}),
			immutableRecord({
				createdAt: '2026-08-08T00:00:00.000Z',
				id: '0198f090-2a50-7000-8000-000000000083',
				title: 'Second',
				updatedAt: '2026-08-08T00:00:00.000Z',
			}),
		])
		let preparedRequest: DatabaseOperationRequest | undefined
		let observedTargets: readonly unknown[] | undefined
		const transaction: DatabaseTransactionAdapter = {
			capabilities: { persistencePlans: databasePersistencePlanCapability },
			kind: 'database-transaction-adapter',
			prepare: <const TOperation extends DatabaseMutationOperationAst>(
				request: DatabaseOperationRequest<TOperation>,
			): Promise<PreparedDatabaseOperation<TOperation>> => {
				preparedRequest = request

				return Promise.resolve({
					execute: () =>
						Promise.resolve({ materializations: [], result: [] }) as Promise<
							Awaited<
								ReturnType<PreparedDatabaseOperation<TOperation>['execute']>
							>
						>,
					targets,
				} as unknown as PreparedDatabaseOperation<TOperation>)
			},
			execute: <const TOperation extends DatabaseOperationAst>(): Promise<
				DatabaseOperationResult<TOperation>
			> => Promise.reject(new TypeError('Unexpected direct execution')),
			commit: () => Promise.resolve(),
			rollback: () => Promise.resolve(),
		}
		const enforcement: RuntimeEnforcementStages = {
			...createEnforcementStages(trace),
			enforcePreparedMutation: (input) => {
				observedTargets = input.targets
			},
			requiresPreparedMutationItems: () => true,
		}
		const pipeline = new RuntimePipeline(
			createStages(trace, transaction, { enforcement }),
		)

		await expect(
			pipeline.execute({
				context: requestContext,
				operation: articleUpdateManyOperation,
			}),
		).resolves.toStrictEqual([])
		expect(preparedRequest?.prepareMutationItems).toBe(true)
		expect(observedTargets).toStrictEqual(targets)
		expect(Object.isFrozen(observedTargets)).toBe(true)
	})
})
